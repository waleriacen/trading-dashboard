/**
 * Universal Trading Strategies
 * Each strategy works across all asset classes (crypto, forex, commodities, stocks).
 * Strategies return: signal (-100 to 100), confidence (0-100), entry/exit levels.
 */
const Strategies = (() => {

  // ─── 1. Trend Following (EMA Crossover + ADX) ────────
  function trendFollowing(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const len = closes.length;
    if (len < 52) return null;

    const ema12 = TA.ema(closes, 12);
    const ema26 = TA.ema(closes, 26);
    const ema50 = TA.ema(closes, 50);
    const adxResult = TA.adx(highs, lows, closes);
    const atrValues = TA.atr(highs, lows, closes);
    const last = len - 1;

    // Direction from EMA alignment
    let signal = 0;
    const ema12Last = ema12[last], ema26Last = ema26[last], ema50Last = ema50[last];
    const price = closes[last];

    // Full bullish alignment: price > ema12 > ema26 > ema50
    if (price > ema12Last && ema12Last > ema26Last && ema26Last > ema50Last) {
      signal = 70;
    } else if (price < ema12Last && ema12Last < ema26Last && ema26Last < ema50Last) {
      signal = -70;
    } else if (ema12Last > ema26Last) {
      signal = 30;
    } else if (ema12Last < ema26Last) {
      signal = -30;
    }

    // Crossover boost
    if (ema12[last] > ema26[last] && ema12[last - 1] <= ema26[last - 1]) signal = 85;
    if (ema12[last] < ema26[last] && ema12[last - 1] >= ema26[last - 1]) signal = -85;

    // ADX filter: only trend in strong trends
    const adxVal = adxResult.adxLine[last];
    let confidence = 40;
    if (adxVal > 25) confidence = 60 + Math.min(adxVal - 25, 30);
    else confidence = 30 + adxVal;

    // Entry/Exit levels
    const atr = atrValues[last];
    const entry = price;
    const stopLoss = signal > 0 ? price - 2 * atr : price + 2 * atr;
    const takeProfit = signal > 0 ? price + 3 * atr : price - 3 * atr;

    return {
      name: 'Trend Following',
      description: 'EMA-Alignment + ADX Trendstärke',
      signal: Math.round(signal),
      confidence: Math.round(confidence),
      entry, stopLoss, takeProfit,
      riskReward: Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss),
      details: {
        ema12: ema12Last.toFixed(2),
        ema26: ema26Last.toFixed(2),
        ema50: ema50Last.toFixed(2),
        adx: adxVal.toFixed(1),
        atr: atr.toFixed(2),
        trendDirection: signal > 0 ? 'Aufwärts' : signal < 0 ? 'Abwärts' : 'Seitwärts'
      }
    };
  }

  // ─── 2. Mean Reversion (RSI + Bollinger Bands) ───────
  function meanReversion(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const len = closes.length;
    if (len < 30) return null;

    const rsiValues = TA.rsi(closes, 14);
    const bb = TA.bollingerBands(closes, 20, 2);
    const atrValues = TA.atr(highs, lows, closes);
    const last = len - 1;
    const rsiLast = rsiValues[last];
    const percentB = bb.percentB[last];
    const price = closes[last];
    const atr = atrValues[last];

    let signal = 0;
    let confidence = 40;

    // RSI extremes
    if (rsiLast < 30) {
      signal += 50;
      confidence += 15;
    } else if (rsiLast < 40) {
      signal += 20;
    } else if (rsiLast > 70) {
      signal -= 50;
      confidence += 15;
    } else if (rsiLast > 60) {
      signal -= 20;
    }

    // Bollinger Band extremes
    if (percentB !== null) {
      if (percentB < 0) {
        signal += 40;
        confidence += 20;
      } else if (percentB < 0.2) {
        signal += 25;
        confidence += 10;
      } else if (percentB > 1) {
        signal -= 40;
        confidence += 20;
      } else if (percentB > 0.8) {
        signal -= 25;
        confidence += 10;
      }
    }

    // RSI divergence detection (bullish: price lower low, RSI higher low)
    if (len > 20) {
      const priceLow1 = Math.min(...closes.slice(-10));
      const priceLow2 = Math.min(...closes.slice(-20, -10));
      const rsiAtLow1 = rsiValues[closes.lastIndexOf(priceLow1)] || rsiLast;
      const rsiAtLow2 = rsiValues[len - 15] || 50;
      if (priceLow1 < priceLow2 && rsiAtLow1 > rsiAtLow2) {
        signal += 20; // Bullish divergence
        confidence += 10;
      }
    }

    signal = Math.max(-100, Math.min(100, signal));
    confidence = Math.min(90, confidence);

    const stopLoss = signal > 0 ? price - 1.5 * atr : price + 1.5 * atr;
    const takeProfit = signal > 0 ? bb.middle[last] : bb.middle[last];

    return {
      name: 'Mean Reversion',
      description: 'RSI-Extreme + Bollinger-Band Rückkehr',
      signal: Math.round(signal),
      confidence: Math.round(confidence),
      entry: price,
      stopLoss,
      takeProfit: takeProfit || price,
      riskReward: Math.abs((takeProfit || price) - price) / Math.abs(price - stopLoss),
      details: {
        rsi: rsiLast ? rsiLast.toFixed(1) : 'N/A',
        percentB: percentB ? percentB.toFixed(3) : 'N/A',
        upperBand: bb.upper[last] ? bb.upper[last].toFixed(2) : 'N/A',
        lowerBand: bb.lower[last] ? bb.lower[last].toFixed(2) : 'N/A',
        middleBand: bb.middle[last] ? bb.middle[last].toFixed(2) : 'N/A',
        bandwidth: bb.bandwidth[last] ? bb.bandwidth[last].toFixed(2) + '%' : 'N/A'
      }
    };
  }

  // ─── 3. Momentum (MACD + ROC + Volume) ───────────────
  function momentum(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume || 1);
    const len = closes.length;
    if (len < 30) return null;

    const macdResult = TA.macd(closes);
    const rocValues = TA.roc(closes, 12);
    const atrValues = TA.atr(highs, lows, closes);
    const last = len - 1;

    let signal = 0;
    let confidence = 40;

    // MACD momentum
    const hist = macdResult.histogram[last];
    const histPrev = macdResult.histogram[last - 1];
    if (hist > 0 && hist > histPrev) { signal += 35; confidence += 10; }
    else if (hist > 0 && hist < histPrev) { signal += 15; }
    else if (hist < 0 && hist > histPrev) { signal -= 15; }
    else if (hist < 0 && hist < histPrev) { signal -= 35; confidence += 10; }

    // MACD crossover
    if (macdResult.macdLine[last] > macdResult.signalLine[last] &&
        macdResult.macdLine[last - 1] <= macdResult.signalLine[last - 1]) {
      signal += 30;
      confidence += 15;
    } else if (macdResult.macdLine[last] < macdResult.signalLine[last] &&
               macdResult.macdLine[last - 1] >= macdResult.signalLine[last - 1]) {
      signal -= 30;
      confidence += 15;
    }

    // Rate of Change
    const roc = rocValues[last];
    if (roc !== null) {
      signal += Math.max(-30, Math.min(30, roc * 2));
      if (Math.abs(roc) > 5) confidence += 10;
    }

    // Volume confirmation
    if (volumes[last] > 0) {
      const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      if (volumes[last] > avgVol * 1.5) {
        confidence += 15; // High volume confirms the move
      }
    }

    signal = Math.max(-100, Math.min(100, signal));
    confidence = Math.min(90, confidence);

    const price = closes[last];
    const atr = atrValues[last];

    return {
      name: 'Momentum',
      description: 'MACD + Rate of Change + Volumen',
      signal: Math.round(signal),
      confidence: Math.round(confidence),
      entry: price,
      stopLoss: signal > 0 ? price - 2 * atr : price + 2 * atr,
      takeProfit: signal > 0 ? price + 2.5 * atr : price - 2.5 * atr,
      riskReward: 1.25,
      details: {
        macdHistogram: hist ? hist.toFixed(4) : 'N/A',
        macdLine: macdResult.macdLine[last] ? macdResult.macdLine[last].toFixed(4) : 'N/A',
        signalLine: macdResult.signalLine[last] ? macdResult.signalLine[last].toFixed(4) : 'N/A',
        roc: roc ? roc.toFixed(2) + '%' : 'N/A',
        volumeRatio: volumes[last] > 0 ?
          (volumes[last] / (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)).toFixed(2) + 'x' : 'N/A'
      }
    };
  }

  // ─── 4. Volatility Breakout (ATR + Bollinger Squeeze) ─
  function volatilityBreakout(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const len = closes.length;
    if (len < 30) return null;

    const atrValues = TA.atr(highs, lows, closes);
    const bb = TA.bollingerBands(closes, 20, 2);
    const last = len - 1;
    const price = closes[last];
    const atr = atrValues[last];

    // Bollinger Bandwidth squeeze detection
    const recentBW = bb.bandwidth.slice(-20).filter(v => v !== null);
    const avgBW = recentBW.reduce((a, b) => a + b, 0) / recentBW.length;
    const currentBW = bb.bandwidth[last];
    const isSqueeze = currentBW < avgBW * 0.75;

    // ATR expansion detection
    const recentATR = atrValues.slice(-20);
    const avgATR = recentATR.reduce((a, b) => a + b, 0) / recentATR.length;
    const isExpanding = atr > avgATR * 1.2;

    let signal = 0;
    let confidence = 30;

    // Squeeze + Expansion = Breakout
    if (isSqueeze) {
      confidence += 10;
      // Direction from recent price action
      if (price > bb.upper[last]) {
        signal = 70;
        confidence += 25;
      } else if (price < bb.lower[last]) {
        signal = -70;
        confidence += 25;
      } else {
        signal = 0; // Squeeze but no breakout yet - wait
        confidence += 5;
      }
    } else if (isExpanding) {
      // Breakout already happening
      if (price > bb.upper[last]) {
        signal = 60;
        confidence += 20;
      } else if (price < bb.lower[last]) {
        signal = -60;
        confidence += 20;
      }
    }

    // Keltner Channel comparison for stronger squeeze signal
    const ema20 = TA.ema(closes, 20);
    const keltnerUpper = ema20[last] + 1.5 * atr;
    const keltnerLower = ema20[last] - 1.5 * atr;
    const bbInsideKeltner = bb.upper[last] < keltnerUpper && bb.lower[last] > keltnerLower;

    if (bbInsideKeltner) {
      confidence += 15; // Tight squeeze confirmed
    }

    // 20-day high/low breakout
    const high20 = Math.max(...highs.slice(-20));
    const low20 = Math.min(...lows.slice(-20));
    if (price >= high20) { signal = Math.max(signal, 50); confidence += 10; }
    if (price <= low20) { signal = Math.min(signal, -50); confidence += 10; }

    confidence = Math.min(90, confidence);

    return {
      name: 'Volatility Breakout',
      description: 'Bollinger-Squeeze + ATR-Expansion',
      signal: Math.round(signal),
      confidence: Math.round(confidence),
      entry: price,
      stopLoss: signal > 0 ? price - 2.5 * atr : price + 2.5 * atr,
      takeProfit: signal > 0 ? price + 4 * atr : price - 4 * atr,
      riskReward: 1.6,
      details: {
        atr: atr.toFixed(2),
        atrExpansion: (atr / avgATR).toFixed(2) + 'x',
        bandwidth: currentBW ? currentBW.toFixed(2) + '%' : 'N/A',
        isSqueeze: isSqueeze ? 'Ja' : 'Nein',
        isExpanding: isExpanding ? 'Ja' : 'Nein',
        bbInsideKeltner: bbInsideKeltner ? 'Ja' : 'Nein',
        high20: high20.toFixed(2),
        low20: low20.toFixed(2)
      }
    };
  }

  // ─── 5. Multi-Timeframe Confluence ────────────────────
  function multiTimeframeConfluence(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume || 1);
    const len = closes.length;
    if (len < 52) return null;

    // Simulate different timeframes from daily data
    // Short-term (last 14 days)
    const shortCandles = candles.slice(-14);
    // Medium-term (last 30 days)
    const medCandles = candles.slice(-30);
    // Full data as long-term

    const shortScore = TA.compositeScore(
      shortCandles.map(c => c.close),
      shortCandles.map(c => c.high),
      shortCandles.map(c => c.low),
      shortCandles.map(c => c.volume || 1)
    );

    const fullScore = TA.compositeScore(closes, highs, lows, volumes);

    // Simple trend detection per "timeframe"
    const shortTrend = shortCandles[shortCandles.length - 1].close > shortCandles[0].close ? 1 : -1;
    const medTrend = medCandles[medCandles.length - 1].close > medCandles[0].close ? 1 : -1;
    const longTrend = closes[closes.length - 1] > closes[0] ? 1 : -1;

    let signal = 0;
    let confidence = 30;

    // All timeframes agree
    if (shortTrend === medTrend && medTrend === longTrend) {
      signal = longTrend * 70;
      confidence = 75;
    }
    // Short + Medium agree
    else if (shortTrend === medTrend) {
      signal = shortTrend * 50;
      confidence = 55;
    }
    // Only short-term signal
    else {
      signal = shortTrend * 25;
      confidence = 35;
    }

    // Boost from composite score
    if ((fullScore.score > 60 && signal > 0) || (fullScore.score < 40 && signal < 0)) {
      confidence += 10;
    }

    const price = closes[len - 1];
    const atrValues = TA.atr(highs, lows, closes);
    const atr = atrValues[len - 1];

    return {
      name: 'Multi-Timeframe',
      description: 'Kurz/Mittel/Langfrist-Übereinstimmung',
      signal: Math.round(signal),
      confidence: Math.min(90, Math.round(confidence)),
      entry: price,
      stopLoss: signal > 0 ? price - 2 * atr : price + 2 * atr,
      takeProfit: signal > 0 ? price + 3 * atr : price - 3 * atr,
      riskReward: 1.5,
      details: {
        shortTermTrend: shortTrend > 0 ? 'Aufwärts' : 'Abwärts',
        mediumTermTrend: medTrend > 0 ? 'Aufwärts' : 'Abwärts',
        longTermTrend: longTrend > 0 ? 'Aufwärts' : 'Abwärts',
        compositeScore: fullScore.score.toFixed(1),
        compositeTrend: fullScore.trend,
        compositeConfidence: fullScore.confidence + '%'
      }
    };
  }

  // ─── Master Signal: Combines all strategies ───────────
  function generateMasterSignal(candles) {
    const results = [
      trendFollowing(candles),
      meanReversion(candles),
      momentum(candles),
      volatilityBreakout(candles),
      multiTimeframeConfluence(candles)
    ].filter(r => r !== null);

    if (results.length === 0) return null;

    // Weighted average based on confidence
    let totalWeightedSignal = 0;
    let totalConfidence = 0;
    results.forEach(r => {
      totalWeightedSignal += r.signal * r.confidence;
      totalConfidence += r.confidence;
    });

    const masterSignal = totalConfidence > 0 ? totalWeightedSignal / totalConfidence : 0;

    // Count agreeing strategies
    const bullish = results.filter(r => r.signal > 15).length;
    const bearish = results.filter(r => r.signal < -15).length;
    const neutral = results.filter(r => Math.abs(r.signal) <= 15).length;

    // Consensus confidence
    const maxAgreement = Math.max(bullish, bearish, neutral);
    const consensus = Math.round((maxAgreement / results.length) * 100);

    // Best R:R setup
    const bestSetup = results.reduce((best, r) =>
      r.riskReward > (best ? best.riskReward : 0) ? r : best, null);

    // Average stop loss and take profit
    const avgATR = results.reduce((sum, r) => sum + Math.abs(r.entry - r.stopLoss), 0) / results.length;

    const price = candles[candles.length - 1].close;

    let action = 'HALTEN';
    if (masterSignal > 30 && consensus >= 60) action = 'KAUFEN';
    else if (masterSignal > 15) action = 'LEICHT KAUFEN';
    else if (masterSignal < -30 && consensus >= 60) action = 'VERKAUFEN';
    else if (masterSignal < -15) action = 'LEICHT VERKAUFEN';

    return {
      masterSignal: Math.round(masterSignal),
      action,
      consensus,
      strategies: results,
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: neutral,
      bestSetup,
      suggestedEntry: price,
      suggestedStopLoss: masterSignal > 0 ? price - avgATR : price + avgATR,
      suggestedTakeProfit: masterSignal > 0 ? price + avgATR * 1.5 : price - avgATR * 1.5,
      overallRiskReward: 1.5,
      timestamp: Date.now()
    };
  }

  return {
    trendFollowing,
    meanReversion,
    momentum,
    volatilityBreakout,
    multiTimeframeConfluence,
    generateMasterSignal
  };
})();
