/**
 * Risk Management Module
 * Provides position sizing, stop-loss calculation, portfolio risk analysis.
 */
const RiskManager = (() => {

  // ─── Position Sizing (Kelly Criterion / Fixed Fractional) ─
  function calculatePositionSize(config) {
    const {
      accountBalance,
      riskPerTrade = 2,   // % of account per trade
      entryPrice,
      stopLossPrice,
      method = 'fixed'     // 'fixed' | 'kelly' | 'atr'
    } = config;

    const riskAmount = accountBalance * (riskPerTrade / 100);
    const priceDiff = Math.abs(entryPrice - stopLossPrice);
    const riskPerUnit = priceDiff;

    if (riskPerUnit === 0) return { units: 0, positionValue: 0, riskAmount: 0 };

    let units;
    if (method === 'kelly') {
      // Kelly Criterion: f = (bp - q) / b
      // Use conservative half-Kelly
      const winRate = config.winRate || 0.55;
      const avgWin = config.avgWin || 1.5;
      const avgLoss = config.avgLoss || 1;
      const b = avgWin / avgLoss;
      const kelly = (b * winRate - (1 - winRate)) / b;
      const halfKelly = Math.max(0, kelly / 2);
      const kellyRisk = accountBalance * halfKelly;
      units = Math.min(kellyRisk, riskAmount) / riskPerUnit;
    } else {
      units = riskAmount / riskPerUnit;
    }

    const positionValue = units * entryPrice;
    const leverage = positionValue / accountBalance;

    return {
      units: Math.floor(units * 100000) / 100000, // 5 decimal precision
      positionValue: Math.round(positionValue * 100) / 100,
      riskAmount: Math.round(riskAmount * 100) / 100,
      riskPercent: riskPerTrade,
      leverage: Math.round(leverage * 100) / 100,
      stopDistance: priceDiff,
      stopDistancePercent: ((priceDiff / entryPrice) * 100).toFixed(2)
    };
  }

  // ─── ATR-Based Stop Loss ──────────────────────────────
  function calculateStopLoss(price, atr, direction = 'long', multiplier = 2) {
    const stopDistance = atr * multiplier;
    return {
      stopLoss: direction === 'long' ? price - stopDistance : price + stopDistance,
      stopDistance,
      stopPercent: ((stopDistance / price) * 100).toFixed(2)
    };
  }

  // ─── Take Profit Levels ──────────────────────────────
  function calculateTakeProfitLevels(entry, stopLoss, direction = 'long') {
    const risk = Math.abs(entry - stopLoss);
    const levels = [1.5, 2, 3, 5].map(ratio => {
      const tp = direction === 'long' ? entry + risk * ratio : entry - risk * ratio;
      return {
        ratio: `${ratio}:1`,
        price: Math.round(tp * 100) / 100,
        profitPercent: ((Math.abs(tp - entry) / entry) * 100).toFixed(2)
      };
    });
    return levels;
  }

  // ─── Portfolio Risk Analysis ──────────────────────────
  function analyzePortfolioRisk(positions) {
    if (!positions || positions.length === 0) {
      return { totalRisk: 0, positions: [], warnings: [] };
    }

    let totalRiskPercent = 0;
    const warnings = [];

    const analyzed = positions.map(pos => {
      const risk = Math.abs(pos.entry - pos.stopLoss) / pos.entry * 100;
      const positionRisk = risk * (pos.size / pos.accountBalance * 100);
      totalRiskPercent += positionRisk;
      return { ...pos, riskPercent: risk.toFixed(2), positionRisk: positionRisk.toFixed(2) };
    });

    if (totalRiskPercent > 6) warnings.push('WARNUNG: Gesamtrisiko > 6% - zu hoch!');
    if (totalRiskPercent > 10) warnings.push('KRITISCH: Gesamtrisiko > 10% - sofort reduzieren!');
    if (positions.length > 5) warnings.push('HINWEIS: Mehr als 5 offene Positionen - Korrelation prüfen!');

    // Check for correlated positions (same direction)
    const longCount = positions.filter(p => p.direction === 'long').length;
    const shortCount = positions.filter(p => p.direction === 'short').length;
    if (longCount >= 4) warnings.push('WARNUNG: 4+ Long-Positionen - einseitiges Risiko!');
    if (shortCount >= 4) warnings.push('WARNUNG: 4+ Short-Positionen - einseitiges Risiko!');

    return {
      totalRiskPercent: totalRiskPercent.toFixed(2),
      positions: analyzed,
      warnings,
      positionCount: positions.length,
      longCount,
      shortCount
    };
  }

  // ─── Risk/Reward Calculator ───────────────────────────
  function riskRewardRatio(entry, stopLoss, takeProfit) {
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  }

  // ─── Maximum Position Size by Volatility ──────────────
  function maxPositionByVolatility(accountBalance, atr, price, maxRiskPercent = 2) {
    const maxRisk = accountBalance * (maxRiskPercent / 100);
    const stopDistance = atr * 2;
    const maxUnits = maxRisk / stopDistance;
    const maxValue = maxUnits * price;
    return {
      maxUnits: Math.floor(maxUnits * 100000) / 100000,
      maxValue: Math.round(maxValue * 100) / 100,
      maxLeverage: Math.round((maxValue / accountBalance) * 100) / 100,
      atrStopPercent: ((stopDistance / price) * 100).toFixed(2)
    };
  }

  // ─── Drawdown Calculator ──────────────────────────────
  function calculateDrawdown(equityCurve) {
    let peak = equityCurve[0];
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    const drawdowns = [];

    for (let i = 0; i < equityCurve.length; i++) {
      if (equityCurve[i] > peak) peak = equityCurve[i];
      const dd = peak - equityCurve[i];
      const ddPercent = (dd / peak) * 100;
      drawdowns.push(ddPercent);
      if (ddPercent > maxDrawdownPercent) {
        maxDrawdown = dd;
        maxDrawdownPercent = ddPercent;
      }
    }

    return {
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
      currentDrawdown: drawdowns[drawdowns.length - 1].toFixed(2),
      drawdownSeries: drawdowns
    };
  }

  // ─── Trade Journal Entry ──────────────────────────────
  function createTradeEntry(trade) {
    const { symbol, direction, entry, exit, size, stopLoss, takeProfit } = trade;
    const pnl = direction === 'long' ? (exit - entry) * size : (entry - exit) * size;
    const pnlPercent = ((exit - entry) / entry * 100) * (direction === 'long' ? 1 : -1);
    const rr = riskRewardRatio(entry, stopLoss, exit);
    const hitStop = direction === 'long' ? exit <= stopLoss : exit >= stopLoss;
    const hitTP = direction === 'long' ? exit >= takeProfit : exit <= takeProfit;

    return {
      ...trade,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      riskReward: rr,
      result: pnl >= 0 ? 'WIN' : 'LOSS',
      hitStop,
      hitTP,
      timestamp: Date.now()
    };
  }

  return {
    calculatePositionSize,
    calculateStopLoss,
    calculateTakeProfitLevels,
    analyzePortfolioRisk,
    riskRewardRatio,
    maxPositionByVolatility,
    calculateDrawdown,
    createTradeEntry
  };
})();
