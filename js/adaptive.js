/**
 * Adaptive Intelligence Module
 * Makes the bot context-aware: detects market regime, adjusts strategy weights,
 * filters false signals, and analyzes cross-asset correlations.
 *
 * This is what separates a 2024 bot from a 2026 bot.
 */
const Adaptive = (() => {

  // ═══════════════════════════════════════════════════════
  // 1. MARKET REGIME DETECTOR
  // Classifies the current market into one of 5 regimes.
  // Each regime requires different strategy emphasis.
  // ═══════════════════════════════════════════════════════

  const REGIMES = {
    STRONG_TREND_UP:   { label: 'Starker Aufwaertstrend', color: '#10b981', strategies: { trend: 40, momentum: 30, breakout: 20, meanRev: 5, multiTF: 5 } },
    WEAK_TREND_UP:     { label: 'Schwacher Aufwaertstrend', color: '#34d399', strategies: { trend: 25, momentum: 25, breakout: 15, meanRev: 20, multiTF: 15 } },
    RANGING:           { label: 'Seitwaertsmarkt', color: '#f59e0b', strategies: { trend: 5, momentum: 10, breakout: 10, meanRev: 50, multiTF: 25 } },
    WEAK_TREND_DOWN:   { label: 'Schwacher Abwaertstrend', color: '#f97316', strategies: { trend: 25, momentum: 25, breakout: 15, meanRev: 20, multiTF: 15 } },
    STRONG_TREND_DOWN: { label: 'Starker Abwaertstrend', color: '#ef4444', strategies: { trend: 40, momentum: 30, breakout: 20, meanRev: 5, multiTF: 5 } },
    VOLATILE_CHOP:     { label: 'Volatile Seitwaertsbewegung', color: '#8b5cf6', strategies: { trend: 5, momentum: 5, breakout: 15, meanRev: 40, multiTF: 35 } },
    CRASH:             { label: 'Crash / Kapitulation', color: '#dc2626', strategies: { trend: 10, momentum: 10, breakout: 5, meanRev: 45, multiTF: 30 } }
  };

  function detectRegime(candles) {
    if (!candles || candles.length < 60) return { regime: 'RANGING', confidence: 0, details: {} };

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const len = closes.length;
    const last = len - 1;

    // ADX for trend strength
    const adxResult = TA.adx(highs, lows, closes);
    const adxVal = adxResult.adxLine[last];
    const plusDI = adxResult.plusDI[last];
    const minusDI = adxResult.minusDI[last];
    const isTrending = adxVal > 25;
    const isStrongTrend = adxVal > 40;
    const trendDirection = plusDI > minusDI ? 'up' : 'down';

    // EMA alignment
    const ema20 = TA.ema(closes, 20);
    const ema50 = TA.ema(closes, 50);
    const emaBullish = ema20[last] > ema50[last];
    const emaSpread = Math.abs(ema20[last] - ema50[last]) / closes[last] * 100;

    // Volatility analysis
    const atrValues = TA.atr(highs, lows, closes);
    const currentATR = atrValues[last];
    const avgATR = atrValues.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const volatilityRatio = currentATR / avgATR;
    const isHighVol = volatilityRatio > 1.5;
    const isLowVol = volatilityRatio < 0.7;

    // Bollinger Bandwidth for squeeze detection
    const bb = TA.bollingerBands(closes, 20, 2);
    const bw = bb.bandwidth[last];
    const avgBW = bb.bandwidth.slice(-30).filter(v => v !== null);
    const meanBW = avgBW.reduce((a, b) => a + b, 0) / avgBW.length;
    const isSqueeze = bw < meanBW * 0.6;

    // Price action: recent returns
    const ret7d = (closes[last] - closes[Math.max(0, last - 7)]) / closes[Math.max(0, last - 7)] * 100;
    const ret30d = (closes[last] - closes[Math.max(0, last - 30)]) / closes[Math.max(0, last - 30)] * 100;

    // Crash detection: sharp drop + high volume + low RSI
    const rsiValues = TA.rsi(closes, 14);
    const rsiLast = rsiValues[last];
    const isCrash = ret7d < -15 && rsiLast < 30 && isHighVol;

    // Chop detection: frequent direction changes
    let directionChanges = 0;
    for (let i = last - 19; i <= last; i++) {
      if (i > 0 && ((closes[i] > closes[i - 1]) !== (closes[i - 1] > closes[Math.max(0, i - 2)]))) {
        directionChanges++;
      }
    }
    const isChoppy = directionChanges > 12 && !isTrending;

    // ─── Classify regime ────────────────────────────
    let regime, confidence;

    if (isCrash) {
      regime = 'CRASH';
      confidence = 85;
    } else if (isChoppy && isHighVol) {
      regime = 'VOLATILE_CHOP';
      confidence = 70;
    } else if (isStrongTrend && trendDirection === 'up') {
      regime = 'STRONG_TREND_UP';
      confidence = 75 + Math.min(adxVal - 40, 15);
    } else if (isStrongTrend && trendDirection === 'down') {
      regime = 'STRONG_TREND_DOWN';
      confidence = 75 + Math.min(adxVal - 40, 15);
    } else if (isTrending && trendDirection === 'up') {
      regime = 'WEAK_TREND_UP';
      confidence = 55 + Math.min(adxVal - 25, 15);
    } else if (isTrending && trendDirection === 'down') {
      regime = 'WEAK_TREND_DOWN';
      confidence = 55 + Math.min(adxVal - 25, 15);
    } else if (isChoppy || (isLowVol && !isTrending)) {
      regime = 'RANGING';
      confidence = 60;
    } else {
      regime = 'RANGING';
      confidence = 40;
    }

    confidence = Math.min(95, Math.round(confidence));

    return {
      regime,
      ...REGIMES[regime],
      confidence,
      details: {
        adx: round(adxVal),
        plusDI: round(plusDI),
        minusDI: round(minusDI),
        emaSpread: round(emaSpread) + '%',
        volatilityRatio: round(volatilityRatio) + 'x',
        bollingerBW: round(bw) + '%',
        isSqueeze,
        ret7d: round(ret7d) + '%',
        ret30d: round(ret30d) + '%',
        rsi: round(rsiLast),
        directionChanges,
        isChoppy,
        isTrending,
        isHighVol
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  // 2. ADAPTIVE STRATEGY WEIGHTS
  // Adjusts strategy combination based on detected regime.
  // ═══════════════════════════════════════════════════════

  function getAdaptiveWeights(regime) {
    const r = REGIMES[regime];
    if (!r) return { trend: 20, momentum: 20, breakout: 20, meanRev: 20, multiTF: 20 };
    return r.strategies;
  }

  function applyAdaptiveWeights(masterSignal, regime) {
    if (!masterSignal || !masterSignal.strategies) return masterSignal;

    const weights = getAdaptiveWeights(regime);
    const stratMap = {
      'Trend Following': 'trend',
      'Mean Reversion': 'meanRev',
      'Momentum': 'momentum',
      'Volatility Breakout': 'breakout',
      'Multi-Timeframe': 'multiTF'
    };

    let totalWeightedSignal = 0;
    let totalWeight = 0;

    for (const strat of masterSignal.strategies) {
      const key = stratMap[strat.name];
      const weight = key ? weights[key] : 20;
      const effectiveWeight = weight * (strat.confidence / 100);
      totalWeightedSignal += strat.signal * effectiveWeight;
      totalWeight += effectiveWeight;
    }

    const adaptiveSignal = totalWeight > 0 ? totalWeightedSignal / totalWeight : 0;

    // Determine action with regime-aware thresholds
    let action = 'HALTEN';
    let threshold = 20; // Default

    // In choppy/ranging markets, require stronger signals
    if (regime === 'VOLATILE_CHOP' || regime === 'RANGING') threshold = 35;
    // In crash, lower threshold for mean reversion buys
    if (regime === 'CRASH') threshold = 15;

    if (adaptiveSignal > threshold * 1.5) action = 'KAUFEN';
    else if (adaptiveSignal > threshold) action = 'LEICHT KAUFEN';
    else if (adaptiveSignal < -threshold * 1.5) action = 'VERKAUFEN';
    else if (adaptiveSignal < -threshold) action = 'LEICHT VERKAUFEN';

    return {
      ...masterSignal,
      originalSignal: masterSignal.masterSignal,
      masterSignal: Math.round(adaptiveSignal),
      action,
      adaptiveWeights: weights,
      regimeAdjusted: true
    };
  }

  // ═══════════════════════════════════════════════════════
  // 3. FALSE SIGNAL FILTER (Chop Filter)
  // Prevents trading in noise. Uses multiple confirmations.
  // ═══════════════════════════════════════════════════════

  function filterSignal(signal, candles, regime) {
    if (!candles || candles.length < 30) return { ...signal, filtered: false };

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const last = closes.length - 1;

    const filters = [];
    let passCount = 0;

    // Filter 1: ADX minimum (trend strength)
    const adxResult = TA.adx(highs, lows, closes);
    const adxVal = adxResult.adxLine[last];
    const adxPass = adxVal > 20;
    filters.push({ name: 'ADX > 20 (Trendstaerke)', pass: adxPass, value: round(adxVal) });
    if (adxPass) passCount++;

    // Filter 2: Volume confirmation (if available)
    const volumes = candles.map(c => c.volume || 0);
    const hasVolume = volumes[last] > 0;
    if (hasVolume) {
      const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const volPass = volumes[last] > avgVol * 0.8;
      filters.push({ name: 'Volumen > 80% Durchschnitt', pass: volPass, value: round(volumes[last] / avgVol) + 'x' });
      if (volPass) passCount++;
    }

    // Filter 3: Price not at extreme (prevents chasing)
    const rsiValues = TA.rsi(closes, 14);
    const rsiLast = rsiValues[last];
    const direction = signal.masterSignal > 0 ? 'long' : 'short';
    const notExtreme = direction === 'long' ? rsiLast < 75 : rsiLast > 25;
    filters.push({ name: 'Nicht ueberkauft/ueberverkauft', pass: notExtreme, value: 'RSI ' + round(rsiLast) });
    if (notExtreme) passCount++;

    // Filter 4: ATR not collapsing (avoid dead markets)
    const atrValues = TA.atr(highs, lows, closes);
    const currentATR = atrValues[last];
    const avgATR = atrValues.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const atrPass = currentATR > avgATR * 0.5;
    filters.push({ name: 'ATR > 50% Durchschnitt', pass: atrPass, value: round(currentATR / avgATR) + 'x' });
    if (atrPass) passCount++;

    // Filter 5: Signal consistency (signal should agree with short-term price action)
    const ret3d = (closes[last] - closes[Math.max(0, last - 3)]) / closes[Math.max(0, last - 3)] * 100;
    const consistencyPass = (signal.masterSignal > 0 && ret3d > -3) || (signal.masterSignal < 0 && ret3d < 3) || Math.abs(signal.masterSignal) < 15;
    filters.push({ name: 'Signal-Konsistenz (3d)', pass: consistencyPass, value: round(ret3d) + '%' });
    if (consistencyPass) passCount++;

    // Filter 6: Regime alignment
    const regimeAligned = (
      (signal.masterSignal > 0 && ['STRONG_TREND_UP', 'WEAK_TREND_UP'].includes(regime)) ||
      (signal.masterSignal < 0 && ['STRONG_TREND_DOWN', 'WEAK_TREND_DOWN'].includes(regime)) ||
      (Math.abs(signal.masterSignal) < 20 && ['RANGING', 'VOLATILE_CHOP'].includes(regime)) ||
      regime === 'CRASH'
    );
    filters.push({ name: 'Regime-Uebereinstimmung', pass: regimeAligned, value: regime });
    if (regimeAligned) passCount++;

    const totalFilters = filters.length;
    const passRate = (passCount / totalFilters) * 100;

    // Signal quality grade
    let grade, gradeColor;
    if (passRate >= 85) { grade = 'A'; gradeColor = '#10b981'; }
    else if (passRate >= 70) { grade = 'B'; gradeColor = '#34d399'; }
    else if (passRate >= 55) { grade = 'C'; gradeColor = '#f59e0b'; }
    else if (passRate >= 40) { grade = 'D'; gradeColor = '#f97316'; }
    else { grade = 'F'; gradeColor = '#ef4444'; }

    // Reduce signal strength if too many filters fail
    let adjustedSignal = signal.masterSignal;
    if (passRate < 50) {
      adjustedSignal = Math.round(signal.masterSignal * 0.5); // Halve the signal
    } else if (passRate < 70) {
      adjustedSignal = Math.round(signal.masterSignal * 0.75);
    }

    // Kill signal entirely if grade is F and not a crash
    const shouldTrade = grade !== 'F' || regime === 'CRASH';

    return {
      ...signal,
      masterSignal: shouldTrade ? adjustedSignal : 0,
      action: shouldTrade ? signal.action : 'HALTEN',
      filtered: true,
      filterResults: {
        filters,
        passCount,
        totalFilters,
        passRate: round(passRate),
        grade,
        gradeColor,
        shouldTrade,
        originalSignal: signal.masterSignal,
        adjustedSignal: shouldTrade ? adjustedSignal : 0
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  // 4. CROSS-ASSET CORRELATION ANALYSIS
  // Understands how assets move together to avoid
  // concentrated risk.
  // ═══════════════════════════════════════════════════════

  function calculateCorrelation(series1, series2) {
    const n = Math.min(series1.length, series2.length);
    if (n < 10) return 0;

    // Use returns, not prices
    const returns1 = [], returns2 = [];
    for (let i = 1; i < n; i++) {
      returns1.push((series1[i] - series1[i - 1]) / series1[i - 1]);
      returns2.push((series2[i] - series2[i - 1]) / series2[i - 1]);
    }

    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

    let cov = 0, var1 = 0, var2 = 0;
    for (let i = 0; i < returns1.length; i++) {
      const d1 = returns1[i] - mean1;
      const d2 = returns2[i] - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }

    const denom = Math.sqrt(var1 * var2);
    return denom > 0 ? round(cov / denom) : 0;
  }

  function buildCorrelationMatrix(assetData) {
    const symbols = Object.keys(assetData);
    const matrix = {};

    for (const sym1 of symbols) {
      matrix[sym1] = {};
      for (const sym2 of symbols) {
        if (sym1 === sym2) {
          matrix[sym1][sym2] = 1;
        } else if (matrix[sym2] && matrix[sym2][sym1] !== undefined) {
          matrix[sym1][sym2] = matrix[sym2][sym1]; // Symmetric
        } else {
          const closes1 = assetData[sym1].map(c => c.close);
          const closes2 = assetData[sym2].map(c => c.close);
          matrix[sym1][sym2] = calculateCorrelation(closes1, closes2);
        }
      }
    }

    return matrix;
  }

  function analyzePortfolioCorrelation(correlationMatrix, signals) {
    const warnings = [];
    const symbols = Object.keys(correlationMatrix);

    // Find highly correlated pairs with same-direction signals
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const corr = correlationMatrix[symbols[i]][symbols[j]];
        const sig1 = signals[symbols[i]];
        const sig2 = signals[symbols[j]];

        if (Math.abs(corr) > 0.7 && sig1 && sig2) {
          const sameDirection = (sig1 > 0 && sig2 > 0) || (sig1 < 0 && sig2 < 0);
          if (sameDirection && Math.abs(corr) > 0.7) {
            warnings.push({
              type: 'HIGH_CORRELATION',
              severity: Math.abs(corr) > 0.85 ? 'high' : 'medium',
              message: `${symbols[i]} und ${symbols[j]} sind stark korreliert (${corr}) mit gleicher Richtung. Erhoehtes Klumpenrisiko!`,
              assets: [symbols[i], symbols[j]],
              correlation: corr
            });
          }
        }
      }
    }

    // Calculate average correlation
    let totalCorr = 0, count = 0;
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        totalCorr += Math.abs(correlationMatrix[symbols[i]][symbols[j]]);
        count++;
      }
    }
    const avgCorrelation = count > 0 ? round(totalCorr / count) : 0;

    if (avgCorrelation > 0.6) {
      warnings.push({
        type: 'PORTFOLIO_CONCENTRATION',
        severity: 'high',
        message: `Durchschnittliche Korrelation ${avgCorrelation} ist zu hoch. Portfolio ist nicht diversifiziert.`,
        correlation: avgCorrelation
      });
    }

    return { warnings, avgCorrelation };
  }

  // ═══════════════════════════════════════════════════════
  // 5. ENHANCED MASTER SIGNAL (combines everything)
  // ═══════════════════════════════════════════════════════

  function generateEnhancedSignal(candles) {
    // Step 1: Detect market regime
    const regime = detectRegime(candles);

    // Step 2: Generate base master signal
    const baseSignal = Strategies.generateMasterSignal(candles);
    if (!baseSignal) return null;

    // Step 3: Apply adaptive weights based on regime
    const adaptedSignal = applyAdaptiveWeights(baseSignal, regime.regime);

    // Step 4: Filter for false signals
    const filteredSignal = filterSignal(adaptedSignal, candles, regime.regime);

    return {
      ...filteredSignal,
      regime,
      enhanced: true,
      pipeline: [
        { step: 'Base Signal', value: baseSignal.masterSignal },
        { step: 'Regime-Anpassung', value: adaptedSignal.masterSignal },
        { step: 'Signal-Filter', value: filteredSignal.masterSignal }
      ]
    };
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  return {
    REGIMES,
    detectRegime,
    getAdaptiveWeights,
    applyAdaptiveWeights,
    filterSignal,
    calculateCorrelation,
    buildCorrelationMatrix,
    analyzePortfolioCorrelation,
    generateEnhancedSignal
  };
})();
