/**
 * Backtesting Engine
 * Simulates trading strategies against historical candle data.
 * Tracks every trade, calculates real P&L, win rate, drawdown, Sharpe ratio.
 *
 * Rules:
 * - One position at a time per asset (no pyramiding)
 * - Entry on signal, exit on stop-loss, take-profit, or reverse signal
 * - Slippage: 0.1% per trade (entry + exit)
 * - Commission: 0.1% per trade (entry + exit)
 */
const Backtest = (() => {

  const SLIPPAGE = 0.001;   // 0.1%
  const COMMISSION = 0.001; // 0.1%

  // ─── Run a single strategy backtest ───────────────────
  function runStrategy(candles, strategyFn, config = {}) {
    const {
      initialBalance = 10000,
      riskPerTrade = 2,          // % of equity per trade
      signalThreshold = 20,      // minimum |signal| to enter
      useTrailingStop = false,
      lookback = 52              // minimum candles before first signal
    } = config;

    if (!candles || candles.length < lookback + 10) {
      return { error: 'Nicht genug Daten fuer Backtest', trades: [] };
    }

    let equity = initialBalance;
    let peakEquity = initialBalance;
    let position = null; // { direction, entry, size, stopLoss, takeProfit, entryIndex }
    const trades = [];
    const equityCurve = [initialBalance];
    const dailyReturns = [];

    for (let i = lookback; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const current = candles[i];
      const price = current.close;

      // Check if position hits stop or take-profit on this candle
      if (position) {
        let exitPrice = null;
        let exitReason = '';

        if (position.direction === 'long') {
          if (current.low <= position.stopLoss) {
            exitPrice = position.stopLoss;
            exitReason = 'Stop-Loss';
          } else if (current.high >= position.takeProfit) {
            exitPrice = position.takeProfit;
            exitReason = 'Take-Profit';
          }
        } else {
          if (current.high >= position.stopLoss) {
            exitPrice = position.stopLoss;
            exitReason = 'Stop-Loss';
          } else if (current.low <= position.takeProfit) {
            exitPrice = position.takeProfit;
            exitReason = 'Take-Profit';
          }
        }

        if (exitPrice) {
          const trade = closePosition(position, exitPrice, exitReason, i, current.time);
          trades.push(trade);
          equity += trade.pnl;
          position = null;
        }
      }

      // Generate signal
      let result;
      try {
        result = strategyFn(slice);
      } catch (e) {
        equityCurve.push(equity);
        dailyReturns.push(0);
        continue;
      }

      if (!result) {
        equityCurve.push(equity);
        dailyReturns.push(0);
        continue;
      }

      const signal = result.signal;

      // Check for reverse signal (exit current position)
      if (position) {
        const shouldExit =
          (position.direction === 'long' && signal < -signalThreshold) ||
          (position.direction === 'short' && signal > signalThreshold);

        if (shouldExit) {
          const exitPrice = applySlippage(price, position.direction === 'long' ? 'sell' : 'buy');
          const trade = closePosition(position, exitPrice, 'Signal-Umkehr', i, current.time);
          trades.push(trade);
          equity += trade.pnl;
          position = null;
        }
      }

      // Open new position
      if (!position && Math.abs(signal) >= signalThreshold) {
        const direction = signal > 0 ? 'long' : 'short';
        const entryPrice = applySlippage(price, direction === 'long' ? 'buy' : 'sell');
        const stopLoss = result.stopLoss;
        const takeProfit = result.takeProfit;

        // Position sizing based on risk
        const riskAmount = equity * (riskPerTrade / 100);
        const stopDistance = Math.abs(entryPrice - stopLoss);
        if (stopDistance === 0 || !isFinite(stopDistance)) {
          equityCurve.push(equity);
          dailyReturns.push(0);
          continue;
        }

        const size = riskAmount / stopDistance;
        const positionValue = size * entryPrice;

        // Don't open if position would exceed account
        if (positionValue > equity * 3) {
          equityCurve.push(equity);
          dailyReturns.push(0);
          continue;
        }

        position = {
          direction,
          entry: entryPrice,
          size,
          stopLoss,
          takeProfit,
          entryIndex: i,
          entryTime: current.time,
          signal: signal,
          confidence: result.confidence
        };
      }

      // Track equity (mark-to-market)
      let unrealizedPnL = 0;
      if (position) {
        if (position.direction === 'long') {
          unrealizedPnL = (price - position.entry) * position.size;
        } else {
          unrealizedPnL = (position.entry - price) * position.size;
        }
      }

      const currentEquity = equity + unrealizedPnL;
      const prevEquity = equityCurve[equityCurve.length - 1];
      dailyReturns.push(prevEquity > 0 ? (currentEquity - prevEquity) / prevEquity : 0);
      equityCurve.push(currentEquity);
      peakEquity = Math.max(peakEquity, currentEquity);
    }

    // Close any remaining position at last price
    if (position) {
      const lastPrice = candles[candles.length - 1].close;
      const exitPrice = applySlippage(lastPrice, position.direction === 'long' ? 'sell' : 'buy');
      const trade = closePosition(position, exitPrice, 'Backtest-Ende', candles.length - 1, candles[candles.length - 1].time);
      trades.push(trade);
      equity += trade.pnl;
      equityCurve.push(equity);
    }

    return calculateStats(trades, equityCurve, dailyReturns, initialBalance, equity);
  }

  // ─── Apply slippage to price ──────────────────────────
  function applySlippage(price, side) {
    if (side === 'buy') return price * (1 + SLIPPAGE);
    return price * (1 - SLIPPAGE);
  }

  // ─── Close a position ─────────────────────────────────
  function closePosition(position, exitPrice, reason, exitIndex, exitTime) {
    const commission = (position.entry * position.size + exitPrice * position.size) * COMMISSION;
    let grossPnL;
    if (position.direction === 'long') {
      grossPnL = (exitPrice - position.entry) * position.size;
    } else {
      grossPnL = (position.entry - exitPrice) * position.size;
    }
    const netPnL = grossPnL - commission;
    const pnlPercent = (netPnL / (position.entry * position.size)) * 100;

    return {
      direction: position.direction,
      entry: position.entry,
      exit: exitPrice,
      size: position.size,
      entryIndex: position.entryIndex,
      exitIndex,
      entryTime: position.entryTime,
      exitTime,
      holdingPeriod: exitIndex - position.entryIndex,
      grossPnL,
      commission,
      pnl: netPnL,
      pnlPercent,
      reason,
      signal: position.signal,
      confidence: position.confidence,
      isWin: netPnL > 0
    };
  }

  // ─── Calculate comprehensive stats ────────────────────
  function calculateStats(trades, equityCurve, dailyReturns, initialBalance, finalEquity) {
    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);
    const totalTrades = trades.length;

    // Win rate
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    // Average win/loss
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;

    // Profit factor
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = equityCurve[0];
    const drawdownSeries = [];
    for (const eq of equityCurve) {
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      drawdownSeries.push(ddPct);
      if (ddPct > maxDrawdownPercent) {
        maxDrawdown = dd;
        maxDrawdownPercent = ddPct;
      }
    }

    // Sharpe Ratio (annualized, assuming daily data)
    const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const returnStdDev = dailyReturns.length > 1 ?
      Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1)) : 0;
    const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) * Math.sqrt(365) : 0;

    // Sortino Ratio (only downside deviation)
    const negReturns = dailyReturns.filter(r => r < 0);
    const downsideDev = negReturns.length > 1 ?
      Math.sqrt(negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length) : 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(365) : 0;

    // Expectancy (average $ per trade)
    const expectancy = totalTrades > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / totalTrades : 0;

    // Win/Loss streaks
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const t of trades) {
      if (t.isWin) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
      else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
    }

    // Total return
    const totalReturn = initialBalance > 0 ? ((finalEquity - initialBalance) / initialBalance) * 100 : 0;

    // Average holding period
    const avgHolding = totalTrades > 0 ? trades.reduce((s, t) => s + t.holdingPeriod, 0) / totalTrades : 0;

    // Total commissions paid
    const totalCommissions = trades.reduce((s, t) => s + t.commission, 0);

    // Calmar Ratio (annualized return / max drawdown)
    const tradingDays = equityCurve.length;
    const annualizedReturn = tradingDays > 0 ? (totalReturn / tradingDays) * 365 : 0;
    const calmarRatio = maxDrawdownPercent > 0 ? annualizedReturn / maxDrawdownPercent : 0;

    return {
      trades,
      equityCurve,
      drawdownSeries,
      stats: {
        totalTrades,
        wins: wins.length,
        losses: losses.length,
        winRate: round(winRate),
        avgWinPercent: round(avgWin),
        avgLossPercent: round(avgLoss),
        profitFactor: round(profitFactor),
        maxDrawdownPercent: round(maxDrawdownPercent),
        maxDrawdown: round(maxDrawdown),
        sharpeRatio: round(sharpeRatio),
        sortinoRatio: round(sortinoRatio),
        calmarRatio: round(calmarRatio),
        expectancy: round(expectancy),
        totalReturn: round(totalReturn),
        finalEquity: round(finalEquity),
        initialBalance,
        maxWinStreak,
        maxLossStreak,
        avgHoldingPeriod: round(avgHolding),
        totalCommissions: round(totalCommissions),
        annualizedReturn: round(annualizedReturn),
        tradingDays
      }
    };
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // ─── Run all strategies and compare ───────────────────
  function runAll(candles, config = {}) {
    const strategies = [
      { name: 'Trend Following', fn: Strategies.trendFollowing, desc: 'EMA-Crossover + ADX' },
      { name: 'Mean Reversion', fn: Strategies.meanReversion, desc: 'RSI + Bollinger Bands' },
      { name: 'Momentum', fn: Strategies.momentum, desc: 'MACD + ROC + Volume' },
      { name: 'Volatility Breakout', fn: Strategies.volatilityBreakout, desc: 'Bollinger Squeeze + ATR' },
      { name: 'Multi-Timeframe', fn: Strategies.multiTimeframeConfluence, desc: 'Kurz/Mittel/Lang' },
      { name: 'Master Signal', fn: (c) => {
          const m = Strategies.generateMasterSignal(c);
          if (!m) return null;
          return {
            signal: m.masterSignal,
            confidence: m.consensus,
            stopLoss: m.suggestedStopLoss,
            takeProfit: m.suggestedTakeProfit
          };
        }, desc: 'Alle Strategien kombiniert'
      }
    ];

    const results = {};
    for (const strat of strategies) {
      try {
        results[strat.name] = {
          ...runStrategy(candles, strat.fn, config),
          description: strat.desc
        };
      } catch (e) {
        results[strat.name] = { error: e.message, description: strat.desc, trades: [], stats: {} };
      }
    }

    return results;
  }

  // ─── Run backtest for multiple assets ─────────────────
  async function runMultiAsset(symbols, config = {}) {
    const results = {};

    for (const symbol of symbols) {
      try {
        const candles = await DataAPI.getMarketData(symbol, config.days || 365);
        if (!candles || candles.length < 60) {
          results[symbol] = { error: 'Nicht genug historische Daten', strategies: {} };
          continue;
        }
        results[symbol] = {
          strategies: runAll(candles, config),
          candleCount: candles.length,
          dateRange: {
            from: new Date(candles[0].time).toLocaleDateString('de-DE'),
            to: new Date(candles[candles.length - 1].time).toLocaleDateString('de-DE')
          }
        };
      } catch (e) {
        results[symbol] = { error: e.message, strategies: {} };
      }
    }

    return results;
  }

  return { runStrategy, runAll, runMultiAsset };
})();
