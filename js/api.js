/**
 * Data Fetching Layer
 * Connects to free, CORS-friendly APIs for live market data.
 * Supports: Crypto (CoinGecko/Binance), Forex, Commodities, Indices
 */
const DataAPI = (() => {

  const COINGECKO = 'https://api.coingecko.com/api/v3';
  const BINANCE   = 'https://api.binance.com/api/v3';

  // ─── Rate limiter ─────────────────────────────────────
  const queue = [];
  let processing = false;
  async function rateLimited(fn, delay = 300) {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try { resolve(await fn()); }
        catch (e) { reject(e); }
      });
      if (!processing) processQueue(delay);
    });
  }
  async function processQueue(delay) {
    processing = true;
    while (queue.length > 0) {
      const task = queue.shift();
      await task();
      if (queue.length > 0) await new Promise(r => setTimeout(r, delay));
    }
    processing = false;
  }

  // ─── Generic fetch with retry ─────────────────────────
  async function fetchJSON(url, retries = 3) {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 2000 * (i + 1)));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  // ─── CoinGecko: Crypto market data ────────────────────
  async function getCryptoList() {
    return fetchJSON(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false`);
  }

  async function getCryptoPrice(id) {
    return fetchJSON(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
  }

  async function getCryptoOHLC(id, days = 90) {
    return rateLimited(() =>
      fetchJSON(`${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${days}`)
    );
  }

  async function getCryptoHistory(id, days = 90) {
    return rateLimited(() =>
      fetchJSON(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`)
    );
  }

  // ─── Binance: Detailed crypto OHLCV ──────────────────
  async function getBinanceKlines(symbol, interval = '1d', limit = 100) {
    try {
      const data = await fetchJSON(
        `${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      return data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    } catch {
      return null;
    }
  }

  // ─── Transform CoinGecko OHLC to candle format ───────
  function transformOHLC(data) {
    if (!data || !Array.isArray(data)) return null;
    return data.map(d => ({
      time: d[0],
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4],
      volume: 0  // OHLC endpoint doesn't include volume
    }));
  }

  function transformHistory(data) {
    if (!data || !data.prices) return null;
    const prices = data.prices;
    const volumes = data.total_volumes || [];
    return prices.map((p, i) => ({
      time: p[0],
      close: p[1],
      open: p[1],
      high: p[1],
      low: p[1],
      volume: volumes[i] ? volumes[i][1] : 0
    }));
  }

  // ─── Universal market data getter ─────────────────────
  // Maps common symbols to their data sources
  const ASSET_MAP = {
    // Crypto - Binance symbols
    'BTC': { binance: 'BTCUSDT', coingecko: 'bitcoin', type: 'crypto' },
    'ETH': { binance: 'ETHUSDT', coingecko: 'ethereum', type: 'crypto' },
    'SOL': { binance: 'SOLUSDT', coingecko: 'solana', type: 'crypto' },
    'BNB': { binance: 'BNBUSDT', coingecko: 'binancecoin', type: 'crypto' },
    'XRP': { binance: 'XRPUSDT', coingecko: 'ripple', type: 'crypto' },
    'ADA': { binance: 'ADAUSDT', coingecko: 'cardano', type: 'crypto' },
    'DOGE': { binance: 'DOGEUSDT', coingecko: 'dogecoin', type: 'crypto' },
    'DOT': { binance: 'DOTUSDT', coingecko: 'polkadot', type: 'crypto' },
    'AVAX': { binance: 'AVAXUSDT', coingecko: 'avalanche-2', type: 'crypto' },
    'LINK': { binance: 'LINKUSDT', coingecko: 'chainlink', type: 'crypto' },
    'MATIC': { binance: 'MATICUSDT', coingecko: 'matic-network', type: 'crypto' },
    'UNI': { binance: 'UNIUSDT', coingecko: 'uniswap', type: 'crypto' },
    'ATOM': { binance: 'ATOMUSDT', coingecko: 'cosmos', type: 'crypto' },

    // Commodities via CoinGecko (limited but available)
    'GOLD': { coingecko: null, type: 'commodity', name: 'Gold (XAU/USD)' },
    'SILVER': { coingecko: null, type: 'commodity', name: 'Silver (XAG/USD)' },

    // Forex pairs - approximated via stablecoins where available
    'EUR/USD': { type: 'forex', name: 'EUR/USD' },
    'GBP/USD': { type: 'forex', name: 'GBP/USD' },
  };

  async function getMarketData(symbol, days = 90) {
    const asset = ASSET_MAP[symbol];
    if (!asset) throw new Error(`Unknown symbol: ${symbol}`);

    let candles = null;

    // Try Binance first (best data quality for crypto)
    if (asset.binance) {
      candles = await getBinanceKlines(asset.binance, '1d', Math.min(days, 1000));
    }

    // Fallback to CoinGecko
    if (!candles && asset.coingecko) {
      const ohlc = await getCryptoOHLC(asset.coingecko, days);
      candles = transformOHLC(ohlc);

      // If OHLC fails, try market_chart
      if (!candles) {
        const history = await getCryptoHistory(asset.coingecko, days);
        candles = transformHistory(history);
      }
    }

    return candles;
  }

  async function getCurrentPrices(symbols) {
    const cryptoIds = symbols
      .map(s => ASSET_MAP[s])
      .filter(a => a && a.coingecko)
      .map(a => a.coingecko);

    if (cryptoIds.length === 0) return {};

    const data = await fetchJSON(
      `${COINGECKO}/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
    );

    const result = {};
    for (const symbol of symbols) {
      const asset = ASSET_MAP[symbol];
      if (asset && asset.coingecko && data[asset.coingecko]) {
        const d = data[asset.coingecko];
        result[symbol] = {
          price: d.usd,
          change24h: d.usd_24h_change,
          volume24h: d.usd_24h_vol,
          marketCap: d.usd_market_cap
        };
      }
    }
    return result;
  }

  // ─── Fear & Greed Index (Crypto) ──────────────────────
  async function getFearGreedIndex() {
    try {
      const data = await fetchJSON('https://api.alternative.me/fng/?limit=30');
      return data.data.map(d => ({
        value: parseInt(d.value),
        classification: d.value_classification,
        timestamp: parseInt(d.timestamp) * 1000
      }));
    } catch {
      return null;
    }
  }

  // ─── Get all available symbols ────────────────────────
  function getAvailableSymbols() {
    return Object.entries(ASSET_MAP).map(([symbol, info]) => ({
      symbol,
      type: info.type,
      name: info.name || symbol,
      hasLiveData: !!(info.binance || info.coingecko)
    }));
  }

  return {
    getCryptoList,
    getCryptoPrice,
    getCryptoOHLC,
    getCryptoHistory,
    getBinanceKlines,
    getMarketData,
    getCurrentPrices,
    getFearGreedIndex,
    getAvailableSymbols,
    ASSET_MAP
  };
})();
