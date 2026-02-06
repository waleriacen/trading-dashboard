/**
 * Technical Analysis Engine
 * Implements standard TA indicators used across all markets.
 * All functions are pure - they take price arrays and return indicator values.
 */
const TA = (() => {

  // ─── Helper ──────────────────────────────────────────────
  function sma(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
    return result;
  }

  function ema(data, period) {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  function stdDev(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      result.push(Math.sqrt(variance));
    }
    return result;
  }

  function trueRange(highs, lows, closes) {
    const tr = [highs[0] - lows[0]];
    for (let i = 1; i < closes.length; i++) {
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    return tr;
  }

  // ─── RSI (Relative Strength Index) ──────────────────────
  function rsi(closes, period = 14) {
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    const result = new Array(period).fill(null);
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
  }

  // ─── MACD ───────────────────────────────────────────────
  function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = ema(closes, fastPeriod);
    const emaSlow = ema(closes, slowPeriod);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, signalPeriod);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);
    return { macdLine, signalLine, histogram };
  }

  // ─── Bollinger Bands ────────────────────────────────────
  function bollingerBands(closes, period = 20, multiplier = 2) {
    const middle = sma(closes, period);
    const sd = stdDev(closes, period);
    const upper = middle.map((m, i) => m !== null ? m + multiplier * sd[i] : null);
    const lower = middle.map((m, i) => m !== null ? m - multiplier * sd[i] : null);
    const bandwidth = middle.map((m, i) => m !== null ? (upper[i] - lower[i]) / m * 100 : null);
    const percentB = closes.map((c, i) =>
      lower[i] !== null ? (c - lower[i]) / (upper[i] - lower[i]) : null
    );
    return { upper, middle, lower, bandwidth, percentB };
  }

  // ─── ATR (Average True Range) ──────────────────────────
  function atr(highs, lows, closes, period = 14) {
    const tr = trueRange(highs, lows, closes);
    return ema(tr, period);
  }

  // ─── ADX (Average Directional Index) ───────────────────
  function adx(highs, lows, closes, period = 14) {
    const plusDM = [0], minusDM = [0];
    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    const atrValues = atr(highs, lows, closes, period);
    const smoothPlusDM = ema(plusDM, period);
    const smoothMinusDM = ema(minusDM, period);

    const plusDI = smoothPlusDM.map((v, i) => atrValues[i] !== 0 ? (v / atrValues[i]) * 100 : 0);
    const minusDI = smoothMinusDM.map((v, i) => atrValues[i] !== 0 ? (v / atrValues[i]) * 100 : 0);

    const dx = plusDI.map((p, i) => {
      const sum = p + minusDI[i];
      return sum !== 0 ? (Math.abs(p - minusDI[i]) / sum) * 100 : 0;
    });

    const adxLine = ema(dx, period);
    return { adxLine, plusDI, minusDI };
  }

  // ─── Stochastic Oscillator ─────────────────────────────
  function stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    const kValues = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < kPeriod - 1) { kValues.push(null); continue; }
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...highSlice);
      const lowestLow = Math.min(...lowSlice);
      const range = highestHigh - lowestLow;
      kValues.push(range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50);
    }
    const validK = kValues.filter(v => v !== null);
    const dValues = sma(validK, dPeriod);
    const dPadded = new Array(kPeriod - 1).fill(null).concat(
      new Array(dPeriod - 1).fill(null),
      dValues.filter(v => v !== null)
    );
    return { k: kValues, d: dPadded };
  }

  // ─── Volume Weighted Average Price (approx) ────────────
  function vwap(highs, lows, closes, volumes) {
    const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
    let cumTPV = 0, cumVol = 0;
    return tp.map((t, i) => {
      cumTPV += t * volumes[i];
      cumVol += volumes[i];
      return cumVol > 0 ? cumTPV / cumVol : closes[i];
    });
  }

  // ─── On-Balance Volume ─────────────────────────────────
  function obv(closes, volumes) {
    const result = [volumes[0]];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) result.push(result[i - 1] + volumes[i]);
      else if (closes[i] < closes[i - 1]) result.push(result[i - 1] - volumes[i]);
      else result.push(result[i - 1]);
    }
    return result;
  }

  // ─── Ichimoku Cloud ────────────────────────────────────
  function ichimoku(highs, lows, closes, tenkan = 9, kijun = 26, senkou = 52) {
    function midPoint(data, period) {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        const slice = data.slice(i - period + 1, i + 1);
        result.push(null); // placeholder
      }
      // Recalculate properly
      const res = [];
      for (let i = 0; i < highs.length; i++) {
        if (i < period - 1) { res.push(null); continue; }
        const hSlice = highs.slice(i - period + 1, i + 1);
        const lSlice = lows.slice(i - period + 1, i + 1);
        res.push((Math.max(...hSlice) + Math.min(...lSlice)) / 2);
      }
      return res;
    }

    const tenkanSen = midPoint(null, tenkan);
    const kijunSen = midPoint(null, kijun);
    const senkouA = tenkanSen.map((t, i) =>
      t !== null && kijunSen[i] !== null ? (t + kijunSen[i]) / 2 : null
    );
    const senkouB = midPoint(null, senkou);
    const chikouSpan = closes.slice(kijun);

    return { tenkanSen, kijunSen, senkouA, senkouB, chikouSpan };
  }

  // ─── Support & Resistance Detection ────────────────────
  function supportResistance(highs, lows, closes, lookback = 20) {
    const levels = [];
    for (let i = lookback; i < closes.length - lookback; i++) {
      const leftHighs = highs.slice(i - lookback, i);
      const rightHighs = highs.slice(i + 1, i + lookback + 1);
      if (highs[i] >= Math.max(...leftHighs) && highs[i] >= Math.max(...rightHighs)) {
        levels.push({ type: 'resistance', price: highs[i], index: i });
      }
      const leftLows = lows.slice(i - lookback, i);
      const rightLows = lows.slice(i + 1, i + lookback + 1);
      if (lows[i] <= Math.min(...leftLows) && lows[i] <= Math.min(...rightLows)) {
        levels.push({ type: 'support', price: lows[i], index: i });
      }
    }
    return levels;
  }

  // ─── Fibonacci Retracement Levels ──────────────────────
  function fibonacciLevels(high, low) {
    const diff = high - low;
    return {
      level_0: high,
      level_236: high - diff * 0.236,
      level_382: high - diff * 0.382,
      level_500: high - diff * 0.5,
      level_618: high - diff * 0.618,
      level_786: high - diff * 0.786,
      level_100: low
    };
  }

  // ─── Pivot Points ─────────────────────────────────────
  function pivotPoints(high, low, close) {
    const pp = (high + low + close) / 3;
    return {
      pp,
      r1: 2 * pp - low,
      r2: pp + (high - low),
      r3: high + 2 * (pp - low),
      s1: 2 * pp - high,
      s2: pp - (high - low),
      s3: low - 2 * (high - pp)
    };
  }

  // ─── Rate of Change ───────────────────────────────────
  function roc(closes, period = 12) {
    const result = new Array(period).fill(null);
    for (let i = period; i < closes.length; i++) {
      result.push(((closes[i] - closes[i - period]) / closes[i - period]) * 100);
    }
    return result;
  }

  // ─── Commodity Channel Index ──────────────────────────
  function cci(highs, lows, closes, period = 20) {
    const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
    const tpSMA = sma(tp, period);
    const result = [];
    for (let i = 0; i < tp.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const slice = tp.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const meanDev = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
      result.push(meanDev !== 0 ? (tp[i] - tpSMA[i]) / (0.015 * meanDev) : 0);
    }
    return result;
  }

  // ─── Williams %R ──────────────────────────────────────
  function williamsR(highs, lows, closes, period = 14) {
    const result = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      const hSlice = highs.slice(i - period + 1, i + 1);
      const lSlice = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...hSlice);
      const ll = Math.min(...lSlice);
      const range = hh - ll;
      result.push(range !== 0 ? ((hh - closes[i]) / range) * -100 : -50);
    }
    return result;
  }

  // ─── Composite Score (combines multiple indicators) ────
  function compositeScore(closes, highs, lows, volumes) {
    const len = closes.length;
    if (len < 52) return { score: 50, signals: {}, confidence: 0 };

    const rsiVal = rsi(closes, 14);
    const macdResult = macd(closes);
    const bb = bollingerBands(closes);
    const stoch = stochastic(highs, lows, closes);
    const adxResult = adx(highs, lows, closes);
    const rocVal = roc(closes, 12);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const cciVal = cci(highs, lows, closes);
    const wrVal = williamsR(highs, lows, closes);

    const last = len - 1;
    const signals = {};
    let totalScore = 0;
    let totalWeight = 0;

    // RSI Signal (weight: 15)
    const rsiLast = rsiVal[last];
    if (rsiLast !== null) {
      let rsiScore = 50;
      if (rsiLast < 30) rsiScore = 80 + (30 - rsiLast);        // Oversold = bullish
      else if (rsiLast < 40) rsiScore = 65;
      else if (rsiLast > 70) rsiScore = 20 - (rsiLast - 70);    // Overbought = bearish
      else if (rsiLast > 60) rsiScore = 35;
      else rsiScore = 50;
      rsiScore = Math.max(0, Math.min(100, rsiScore));
      signals.rsi = { value: rsiLast, score: rsiScore, weight: 15 };
      totalScore += rsiScore * 15;
      totalWeight += 15;
    }

    // MACD Signal (weight: 20)
    const macdHist = macdResult.histogram[last];
    const macdHistPrev = macdResult.histogram[last - 1];
    if (macdHist != null && macdHistPrev != null) {
      let macdScore = 50;
      if (macdHist > 0 && macdHist > macdHistPrev) macdScore = 75;
      else if (macdHist > 0 && macdHist < macdHistPrev) macdScore = 60;
      else if (macdHist < 0 && macdHist > macdHistPrev) macdScore = 40;
      else if (macdHist < 0 && macdHist < macdHistPrev) macdScore = 25;
      // Crossover detection
      if (macdResult.macdLine[last] > macdResult.signalLine[last] &&
          macdResult.macdLine[last - 1] <= macdResult.signalLine[last - 1]) {
        macdScore = 85; // Bullish crossover
      } else if (macdResult.macdLine[last] < macdResult.signalLine[last] &&
                 macdResult.macdLine[last - 1] >= macdResult.signalLine[last - 1]) {
        macdScore = 15; // Bearish crossover
      }
      signals.macd = { value: macdHist, score: macdScore, weight: 20 };
      totalScore += macdScore * 20;
      totalWeight += 20;
    }

    // Bollinger Bands Signal (weight: 15)
    if (bb.percentB[last] !== null) {
      let bbScore = 50;
      const pB = bb.percentB[last];
      if (pB < 0) bbScore = 80;         // Below lower band = oversold
      else if (pB < 0.2) bbScore = 70;
      else if (pB > 1) bbScore = 20;     // Above upper band = overbought
      else if (pB > 0.8) bbScore = 30;
      else bbScore = 50;
      signals.bollinger = { value: pB, score: bbScore, weight: 15 };
      totalScore += bbScore * 15;
      totalWeight += 15;
    }

    // EMA Crossover Signal (weight: 15)
    {
      let emaScore = 50;
      if (ema20[last] > ema50[last]) {
        emaScore = 65;
        if (ema20[last - 1] <= ema50[last - 1]) emaScore = 80; // Golden cross
      } else {
        emaScore = 35;
        if (ema20[last - 1] >= ema50[last - 1]) emaScore = 20; // Death cross
      }
      // Price relative to EMAs
      if (closes[last] > ema20[last] && closes[last] > ema50[last]) emaScore += 5;
      else if (closes[last] < ema20[last] && closes[last] < ema50[last]) emaScore -= 5;
      emaScore = Math.max(0, Math.min(100, emaScore));
      signals.emaCross = { value: { ema20: ema20[last], ema50: ema50[last] }, score: emaScore, weight: 15 };
      totalScore += emaScore * 15;
      totalWeight += 15;
    }

    // ADX Trend Strength (weight: 10)
    {
      const adxVal = adxResult.adxLine[last];
      let adxScore = 50;
      const trend = adxResult.plusDI[last] > adxResult.minusDI[last] ? 'bullish' : 'bearish';
      if (adxVal > 25) {
        adxScore = trend === 'bullish' ? 70 + Math.min(adxVal - 25, 20) : 30 - Math.min(adxVal - 25, 20);
      }
      adxScore = Math.max(0, Math.min(100, adxScore));
      signals.adx = { value: adxVal, trend, score: adxScore, weight: 10 };
      totalScore += adxScore * 10;
      totalWeight += 10;
    }

    // Stochastic Signal (weight: 10)
    if (stoch.k[last] !== null) {
      let stochScore = 50;
      if (stoch.k[last] < 20) stochScore = 75;
      else if (stoch.k[last] > 80) stochScore = 25;
      signals.stochastic = { value: stoch.k[last], score: stochScore, weight: 10 };
      totalScore += stochScore * 10;
      totalWeight += 10;
    }

    // ROC Momentum (weight: 10)
    if (rocVal[last] !== null) {
      let rocScore = 50 + Math.max(-30, Math.min(30, rocVal[last] * 3));
      rocScore = Math.max(0, Math.min(100, rocScore));
      signals.roc = { value: rocVal[last], score: rocScore, weight: 10 };
      totalScore += rocScore * 10;
      totalWeight += 10;
    }

    // CCI Signal (weight: 5)
    if (cciVal[last] !== null) {
      let cciScore = 50;
      if (cciVal[last] < -100) cciScore = 75;
      else if (cciVal[last] > 100) cciScore = 25;
      else cciScore = 50 - cciVal[last] / 4;
      cciScore = Math.max(0, Math.min(100, cciScore));
      signals.cci = { value: cciVal[last], score: cciScore, weight: 5 };
      totalScore += cciScore * 5;
      totalWeight += 5;
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 50;
    const agreeing = Object.values(signals).filter(s =>
      (finalScore >= 50 && s.score >= 50) || (finalScore < 50 && s.score < 50)
    ).length;
    const confidence = Math.round((agreeing / Object.keys(signals).length) * 100);

    return {
      score: Math.round(finalScore * 10) / 10,
      signals,
      confidence,
      trend: finalScore >= 65 ? 'STRONG_BUY' :
             finalScore >= 55 ? 'BUY' :
             finalScore >= 45 ? 'NEUTRAL' :
             finalScore >= 35 ? 'SELL' : 'STRONG_SELL'
    };
  }

  // ─── Public API ────────────────────────────────────────
  return {
    sma, ema, stdDev, rsi, macd, bollingerBands, atr, adx,
    stochastic, vwap, obv, ichimoku, supportResistance,
    fibonacciLevels, pivotPoints, roc, cci, williamsR,
    compositeScore
  };
})();
