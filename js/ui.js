/**
 * UI Controller
 * Manages all DOM updates, tab switching, and user interactions.
 */
const UI = (() => {

  let currentTab = 'signals';
  let selectedAssets = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
  let accountBalance = 10000;
  let riskPercent = 2;
  let analysisCache = {};
  let isLoading = false;

  // ─── Tab Management ───────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById(`tab-${target}`).classList.add('active');
        currentTab = target;
      });
    });
  }

  // ─── Asset Selector ───────────────────────────────────
  function initAssetSelector() {
    const container = document.getElementById('asset-selector');
    if (!container) return;

    const symbols = DataAPI.getAvailableSymbols().filter(s => s.hasLiveData);
    container.innerHTML = symbols.map(s => `
      <button class="asset-chip ${selectedAssets.includes(s.symbol) ? 'active' : ''}"
              data-symbol="${s.symbol}">${s.symbol}</button>
    `).join('');

    container.querySelectorAll('.asset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sym = chip.dataset.symbol;
        if (selectedAssets.includes(sym)) {
          selectedAssets = selectedAssets.filter(s => s !== sym);
          chip.classList.remove('active');
        } else {
          selectedAssets.push(sym);
          chip.classList.add('active');
        }
      });
    });
  }

  // ─── Account Settings ─────────────────────────────────
  function initAccountBar() {
    const balanceInput = document.getElementById('account-balance');
    const riskInput = document.getElementById('risk-percent');
    if (balanceInput) {
      balanceInput.value = accountBalance;
      balanceInput.addEventListener('change', (e) => {
        accountBalance = parseFloat(e.target.value) || 10000;
      });
    }
    if (riskInput) {
      riskInput.value = riskPercent;
      riskInput.addEventListener('change', (e) => {
        riskPercent = parseFloat(e.target.value) || 2;
      });
    }
  }

  // ─── Loading State ────────────────────────────────────
  function showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div class="loading-text">Lade Marktdaten und analysiere...</div>
      </div>
    `;
  }

  function showError(container, message) {
    container.innerHTML = `
      <div class="error-msg">${message}</div>
    `;
  }

  // ─── Format Helpers ───────────────────────────────────
  function formatPrice(price) {
    if (price >= 1000) return price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }

  function formatChange(change) {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }

  function getSignalClass(signal) {
    if (signal > 30) return 'buy';
    if (signal < -30) return 'sell';
    return 'neutral';
  }

  function getActionLabel(action) {
    const map = {
      'KAUFEN': 'KAUFEN',
      'LEICHT KAUFEN': 'LEICHT KAUFEN',
      'VERKAUFEN': 'VERKAUFEN',
      'LEICHT VERKAUFEN': 'LEICHT VERK.',
      'HALTEN': 'HALTEN'
    };
    return map[action] || action;
  }

  function getActionClass(action) {
    if (action.includes('KAUFEN')) return 'buy';
    if (action.includes('VERKAUFEN')) return 'sell';
    return 'hold';
  }

  function getSignalStrengthLabel(signal) {
    const abs = Math.abs(signal);
    if (abs >= 70) return 'Sehr Stark';
    if (abs >= 50) return 'Stark';
    if (abs >= 30) return 'Moderat';
    if (abs >= 15) return 'Schwach';
    return 'Neutral';
  }

  function getScoreFillClass(score) {
    if (score >= 55) return 'bullish';
    if (score <= 45) return 'bearish';
    return 'neutral';
  }

  function getStrategyBorderClass(signal) {
    if (signal > 15) return 'bullish-border';
    if (signal < -15) return 'bearish-border';
    return 'neutral-border';
  }

  function getStrategySignalClass(signal) {
    if (signal > 15) return 'positive';
    if (signal < -15) return 'negative';
    return 'neutral-sig';
  }

  // ─── Render Signals Tab ───────────────────────────────
  function renderSignals(results) {
    const container = document.getElementById('signals-container');
    if (!container) return;

    if (!results || Object.keys(results).length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F4CA;</div><p>Klicke "Analyse starten" um Signale zu generieren</p></div>';
      return;
    }

    let html = '<div class="grid-2">';
    for (const [symbol, data] of Object.entries(results)) {
      const master = data.masterSignal;
      if (!master) continue;

      const signalClass = getSignalClass(master.masterSignal);
      const actionClass = getActionClass(master.action);
      const price = data.currentPrice || master.suggestedEntry;
      const change = data.change24h || 0;

      html += `
        <div class="signal-card ${signalClass} fade-in">
          <div class="signal-header">
            <div>
              <div class="signal-symbol">${symbol}</div>
              <div class="signal-price">$${formatPrice(price)}</div>
              <div class="signal-change ${change >= 0 ? 'positive' : 'negative'}">${formatChange(change)}</div>
            </div>
            <div style="text-align: right;">
              <div class="signal-action ${actionClass}">${getActionLabel(master.action)}</div>
              <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                Signal: ${master.masterSignal > 0 ? '+' : ''}${master.masterSignal}
              </div>
            </div>
          </div>

          <div class="score-meter">
            <div class="score-fill ${getScoreFillClass(master.masterSignal + 50)}"
                 style="width: ${Math.min(100, Math.max(0, master.masterSignal + 50))}%"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            <span>Konsens: ${master.consensus}%</span>
            <span>${master.bullishCount} Bullish / ${master.bearishCount} Bearish / ${master.neutralCount} Neutral</span>
          </div>

          <!-- Strategies Breakdown -->
          ${master.strategies.map(s => `
            <div class="strategy-row">
              <span class="strategy-name">${s.name}</span>
              <span class="strategy-signal ${getStrategySignalClass(s.signal)}">
                ${s.signal > 0 ? '+' : ''}${s.signal}
              </span>
              <span class="strategy-confidence">${s.confidence}%</span>
            </div>
          `).join('')}

          <!-- Trade Setup -->
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">TRADE SETUP</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div class="tp-level">
                <div class="tp-label">Einstieg</div>
                <div class="tp-price">$${formatPrice(master.suggestedEntry)}</div>
              </div>
              <div class="tp-level">
                <div class="tp-label">Stop-Loss</div>
                <div class="tp-price" style="color: var(--red);">$${formatPrice(master.suggestedStopLoss)}</div>
              </div>
              <div class="tp-level">
                <div class="tp-label">Take-Profit</div>
                <div class="tp-price" style="color: var(--green);">$${formatPrice(master.suggestedTakeProfit)}</div>
              </div>
            </div>
          </div>

          <!-- Position Size -->
          ${renderPositionSize(symbol, master, price)}
        </div>
      `;
    }
    html += '</div>';
    container.innerHTML = html;

    // Wire up toggle buttons
    container.querySelectorAll('.toggle-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.classList.toggle('open');
      });
    });
  }

  function renderPositionSize(symbol, master, price) {
    const direction = master.masterSignal > 0 ? 'long' : 'short';
    const posSize = RiskManager.calculatePositionSize({
      accountBalance,
      riskPerTrade: riskPercent,
      entryPrice: master.suggestedEntry,
      stopLossPrice: master.suggestedStopLoss
    });

    const tpLevels = RiskManager.calculateTakeProfitLevels(
      master.suggestedEntry,
      master.suggestedStopLoss,
      direction
    );

    return `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">
          POSITION (${riskPercent}% Risiko von $${accountBalance.toLocaleString('de-DE')})
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 13px;">
          <div class="risk-result">
            <span class="risk-result-label">Menge:</span>
            <span class="risk-result-value">${posSize.units} ${symbol}</span>
          </div>
          <div class="risk-result">
            <span class="risk-result-label">Wert:</span>
            <span class="risk-result-value">$${posSize.positionValue.toLocaleString('de-DE')}</span>
          </div>
          <div class="risk-result">
            <span class="risk-result-label">Risiko:</span>
            <span class="risk-result-value" style="color: var(--red);">$${posSize.riskAmount}</span>
          </div>
          <div class="risk-result">
            <span class="risk-result-label">Stop-Abstand:</span>
            <span class="risk-result-value">${posSize.stopDistancePercent}%</span>
          </div>
        </div>

        <button class="toggle-details" data-target="tp-${symbol}">Take-Profit Stufen anzeigen</button>
        <div class="details-content" id="tp-${symbol}">
          <div class="tp-levels" style="margin-top: 8px;">
            ${tpLevels.map(tp => `
              <div class="tp-level">
                <div class="tp-label">${tp.ratio} R:R</div>
                <div class="tp-price" style="color: var(--green);">$${formatPrice(tp.price)}</div>
                <div class="tp-label">+${tp.profitPercent}%</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ─── Render Strategy Details Tab ──────────────────────
  function renderStrategyDetails(results) {
    const container = document.getElementById('strategy-container');
    if (!container) return;

    if (!results || Object.keys(results).length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F50D;</div><p>Starte zuerst eine Analyse</p></div>';
      return;
    }

    let html = '';
    for (const [symbol, data] of Object.entries(results)) {
      if (!data.masterSignal) continue;

      html += `<h3 style="margin: 20px 0 12px; font-size: 18px;">${symbol} - Strategie-Details</h3>`;

      data.masterSignal.strategies.forEach(strat => {
        const borderClass = getStrategyBorderClass(strat.signal);
        html += `
          <div class="strategy-detail ${borderClass}">
            <div class="strategy-detail-header">
              <div>
                <div class="strategy-detail-name">${strat.name}</div>
                <div class="strategy-detail-desc">${strat.description}</div>
              </div>
              <div style="text-align: right;">
                <span class="strategy-signal ${getStrategySignalClass(strat.signal)}" style="font-size: 16px;">
                  ${strat.signal > 0 ? '+' : ''}${strat.signal}
                </span>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                  ${getSignalStrengthLabel(strat.signal)} | ${strat.confidence}% Konfidenz
                </div>
              </div>
            </div>

            <div class="confidence-bar" style="margin-bottom: 12px;">
              <div class="confidence-track">
                <div class="confidence-fill" style="width: ${strat.confidence}%;
                  background: ${strat.signal > 15 ? 'var(--green)' : strat.signal < -15 ? 'var(--red)' : 'var(--yellow)'};"></div>
              </div>
              <span class="confidence-label">${strat.confidence}%</span>
            </div>

            <div class="strategy-detail-grid">
              ${Object.entries(strat.details).map(([key, val]) => `
                <div class="strategy-detail-item">
                  <div class="strategy-detail-item-label">${key}</div>
                  <div class="strategy-detail-item-value">${val}</div>
                </div>
              `).join('')}
              <div class="strategy-detail-item">
                <div class="strategy-detail-item-label">Stop-Loss</div>
                <div class="strategy-detail-item-value" style="color: var(--red);">$${formatPrice(strat.stopLoss)}</div>
              </div>
              <div class="strategy-detail-item">
                <div class="strategy-detail-item-label">Take-Profit</div>
                <div class="strategy-detail-item-value" style="color: var(--green);">$${formatPrice(strat.takeProfit)}</div>
              </div>
              <div class="strategy-detail-item">
                <div class="strategy-detail-item-label">R:R Ratio</div>
                <div class="strategy-detail-item-value">${strat.riskReward.toFixed(2)}</div>
              </div>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  // ─── Render Risk Management Tab ───────────────────────
  function renderRiskTab(results) {
    const container = document.getElementById('risk-container');
    if (!container) return;

    // Build positions from current signals
    const positions = [];
    for (const [symbol, data] of Object.entries(results)) {
      if (!data.masterSignal || Math.abs(data.masterSignal.masterSignal) < 15) continue;
      const m = data.masterSignal;
      const direction = m.masterSignal > 0 ? 'long' : 'short';
      const posSize = RiskManager.calculatePositionSize({
        accountBalance,
        riskPerTrade: riskPercent,
        entryPrice: m.suggestedEntry,
        stopLossPrice: m.suggestedStopLoss
      });
      positions.push({
        symbol,
        direction,
        entry: m.suggestedEntry,
        stopLoss: m.suggestedStopLoss,
        size: posSize.positionValue,
        accountBalance
      });
    }

    const portfolio = RiskManager.analyzePortfolioRisk(positions);

    let html = `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div class="card-title">Portfolio-Risiko Analyse</div>
          <div class="card-badge" style="background: ${parseFloat(portfolio.totalRiskPercent) > 6 ? 'var(--red-bg); color: var(--red)' : 'var(--green-bg); color: var(--green)'};">
            ${portfolio.totalRiskPercent}% Gesamtrisiko
          </div>
        </div>

        ${portfolio.warnings.map(w => `<div class="${w.includes('KRITISCH') ? 'error-msg' : 'warning-box'}">${w}</div>`).join('')}

        <div class="grid-4" style="margin-bottom: 16px;">
          <div class="stat-box card">
            <div class="stat-value">${portfolio.positionCount}</div>
            <div class="stat-label">Positionen</div>
          </div>
          <div class="stat-box card">
            <div class="stat-value" style="color: var(--green);">${portfolio.longCount || 0}</div>
            <div class="stat-label">Long</div>
          </div>
          <div class="stat-box card">
            <div class="stat-value" style="color: var(--red);">${portfolio.shortCount || 0}</div>
            <div class="stat-label">Short</div>
          </div>
          <div class="stat-box card">
            <div class="stat-value">$${accountBalance.toLocaleString('de-DE')}</div>
            <div class="stat-label">Kontostand</div>
          </div>
        </div>

        ${positions.length > 0 ? `
          <table class="detail-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Richtung</th>
                <th>Einstieg</th>
                <th>Stop-Loss</th>
                <th>Risiko %</th>
                <th>Positions-Risiko</th>
              </tr>
            </thead>
            <tbody>
              ${portfolio.positions.map(p => `
                <tr>
                  <td style="font-weight: 700;">${p.symbol}</td>
                  <td><span style="color: ${p.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight: 600;">${p.direction.toUpperCase()}</span></td>
                  <td>$${formatPrice(p.entry)}</td>
                  <td style="color: var(--red);">$${formatPrice(p.stopLoss)}</td>
                  <td>${p.riskPercent}%</td>
                  <td style="font-weight: 700;">${p.positionRisk}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state"><p>Keine aktiven Signale (nur Assets mit Signal > 15 werden angezeigt)</p></div>'}
      </div>

      <!-- Position Size Calculator -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Positionsrechner</div>
        </div>
        <div class="risk-input-group">
          <div class="risk-input">
            <label>Kontostand ($)</label>
            <input type="number" id="calc-balance" value="${accountBalance}">
          </div>
          <div class="risk-input">
            <label>Risiko pro Trade (%)</label>
            <input type="number" id="calc-risk" value="${riskPercent}" step="0.5" min="0.5" max="10">
          </div>
          <div class="risk-input">
            <label>Einstiegspreis ($)</label>
            <input type="number" id="calc-entry" value="0" step="any">
          </div>
          <div class="risk-input">
            <label>Stop-Loss ($)</label>
            <input type="number" id="calc-stop" value="0" step="any">
          </div>
        </div>
        <button class="btn btn-primary" id="calc-button" style="width: 100%; margin-bottom: 16px;">Berechnen</button>
        <div id="calc-result"></div>
      </div>
    `;

    container.innerHTML = html;

    // Wire up calculator
    document.getElementById('calc-button')?.addEventListener('click', () => {
      const balance = parseFloat(document.getElementById('calc-balance').value);
      const risk = parseFloat(document.getElementById('calc-risk').value);
      const entry = parseFloat(document.getElementById('calc-entry').value);
      const stop = parseFloat(document.getElementById('calc-stop').value);

      if (!balance || !entry || !stop) {
        document.getElementById('calc-result').innerHTML = '<div class="error-msg">Bitte alle Felder ausfuellen.</div>';
        return;
      }

      const result = RiskManager.calculatePositionSize({
        accountBalance: balance,
        riskPerTrade: risk,
        entryPrice: entry,
        stopLossPrice: stop
      });

      const direction = entry > stop ? 'long' : 'short';
      const tpLevels = RiskManager.calculateTakeProfitLevels(entry, stop, direction);

      document.getElementById('calc-result').innerHTML = `
        <div class="risk-result"><span class="risk-result-label">Menge:</span><span class="risk-result-value">${result.units}</span></div>
        <div class="risk-result"><span class="risk-result-label">Positionswert:</span><span class="risk-result-value">$${result.positionValue.toLocaleString('de-DE')}</span></div>
        <div class="risk-result"><span class="risk-result-label">Risikoberag:</span><span class="risk-result-value" style="color: var(--red);">$${result.riskAmount}</span></div>
        <div class="risk-result"><span class="risk-result-label">Stop-Abstand:</span><span class="risk-result-value">${result.stopDistancePercent}%</span></div>
        <div class="risk-result"><span class="risk-result-label">Hebel:</span><span class="risk-result-value">${result.leverage}x</span></div>
        <div style="margin-top: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted);">TAKE-PROFIT STUFEN</div>
        <div class="tp-levels" style="margin-top: 8px;">
          ${tpLevels.map(tp => `
            <div class="tp-level">
              <div class="tp-label">${tp.ratio} R:R</div>
              <div class="tp-price" style="color: var(--green);">$${formatPrice(tp.price)}</div>
              <div class="tp-label">+${tp.profitPercent}%</div>
            </div>
          `).join('')}
        </div>
      `;
    });
  }

  // ─── Render Market Overview Tab ───────────────────────
  function renderMarketOverview(results, fearGreed) {
    const container = document.getElementById('market-container');
    if (!container) return;

    let html = '';

    // Fear & Greed
    if (fearGreed && fearGreed.length > 0) {
      const fg = fearGreed[0];
      const fgColor = fg.value < 25 ? 'var(--red)' : fg.value < 45 ? 'var(--orange)' : fg.value < 55 ? 'var(--yellow)' : fg.value < 75 ? 'var(--green-light)' : 'var(--green)';
      html += `
        <div class="card" style="margin-bottom: 20px;">
          <div class="card-header">
            <div class="card-title">Crypto Fear & Greed Index</div>
          </div>
          <div class="gauge-container">
            <div class="gauge-value" style="color: ${fgColor};">${fg.value}</div>
            <div class="gauge-label" style="color: ${fgColor};">${fg.classification}</div>
            <div class="gauge-bar">
              <div class="gauge-indicator" style="left: ${fg.value}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; margin-top: 8px; font-size: 11px; color: var(--text-muted);">
              <span>Extreme Fear</span>
              <span>Neutral</span>
              <span>Extreme Greed</span>
            </div>
          </div>
        </div>
      `;
    }

    // Market prices grid
    html += '<div class="grid-3" style="margin-bottom: 20px;">';
    for (const [symbol, data] of Object.entries(results)) {
      const price = data.currentPrice || (data.masterSignal ? data.masterSignal.suggestedEntry : 0);
      const change = data.change24h || 0;
      const volume = data.volume24h || 0;
      const marketCap = data.marketCap || 0;

      html += `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 18px; font-weight: 800;">${symbol}</div>
              <div style="font-size: 22px; font-weight: 700; margin-top: 4px;">$${formatPrice(price)}</div>
              <div class="signal-change ${change >= 0 ? 'positive' : 'negative'}" style="margin-top: 2px;">${formatChange(change)}</div>
            </div>
            ${data.masterSignal ? `
              <div class="signal-action ${getActionClass(data.masterSignal.action)}" style="font-size: 12px; padding: 4px 12px;">
                ${getActionLabel(data.masterSignal.action)}
              </div>
            ` : ''}
          </div>
          ${marketCap ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
              <div>
                <div style="color: var(--text-muted);">Marktkapitalisierung</div>
                <div style="font-weight: 700;">$${(marketCap / 1e9).toFixed(2)}B</div>
              </div>
              <div>
                <div style="color: var(--text-muted);">24h Volumen</div>
                <div style="font-weight: 700;">$${(volume / 1e9).toFixed(2)}B</div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }
    html += '</div>';

    container.innerHTML = html;
  }

  // ─── Render Technical Analysis Tab ────────────────────
  function renderTechnicalAnalysis(results) {
    const container = document.getElementById('ta-container');
    if (!container) return;

    if (!results || Object.keys(results).length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1F4C9;</div><p>Starte zuerst eine Analyse</p></div>';
      return;
    }

    let html = '';
    for (const [symbol, data] of Object.entries(results)) {
      if (!data.candles || data.candles.length < 30) continue;
      const closes = data.candles.map(c => c.close);
      const highs = data.candles.map(c => c.high);
      const lows = data.candles.map(c => c.low);
      const volumes = data.candles.map(c => c.volume || 1);
      const last = closes.length - 1;

      const rsiVal = TA.rsi(closes);
      const macdResult = TA.macd(closes);
      const bb = TA.bollingerBands(closes);
      const adxResult = TA.adx(highs, lows, closes);
      const stoch = TA.stochastic(highs, lows, closes);
      const atrVal = TA.atr(highs, lows, closes);
      const rocVal = TA.roc(closes);
      const cciVal = TA.cci(highs, lows, closes);
      const wrVal = TA.williamsR(highs, lows, closes);

      const indicators = [
        { name: 'RSI (14)', value: rsiVal[last]?.toFixed(1) || 'N/A', signal: rsiVal[last] < 30 ? 'Oversold' : rsiVal[last] > 70 ? 'Overbought' : 'Neutral' },
        { name: 'MACD Histogram', value: macdResult.histogram[last]?.toFixed(4) || 'N/A', signal: macdResult.histogram[last] > 0 ? 'Bullish' : 'Bearish' },
        { name: 'MACD Line', value: macdResult.macdLine[last]?.toFixed(4) || 'N/A', signal: macdResult.macdLine[last] > macdResult.signalLine[last] ? 'Bullish' : 'Bearish' },
        { name: 'Bollinger %B', value: bb.percentB[last]?.toFixed(3) || 'N/A', signal: bb.percentB[last] < 0.2 ? 'Oversold' : bb.percentB[last] > 0.8 ? 'Overbought' : 'Neutral' },
        { name: 'Bollinger Bandwidth', value: bb.bandwidth[last]?.toFixed(2) + '%' || 'N/A', signal: '' },
        { name: 'ADX', value: adxResult.adxLine[last]?.toFixed(1) || 'N/A', signal: adxResult.adxLine[last] > 25 ? 'Starker Trend' : 'Schwacher Trend' },
        { name: '+DI / -DI', value: `${adxResult.plusDI[last]?.toFixed(1)} / ${adxResult.minusDI[last]?.toFixed(1)}`, signal: adxResult.plusDI[last] > adxResult.minusDI[last] ? 'Bullish' : 'Bearish' },
        { name: 'Stochastic %K', value: stoch.k[last]?.toFixed(1) || 'N/A', signal: stoch.k[last] < 20 ? 'Oversold' : stoch.k[last] > 80 ? 'Overbought' : 'Neutral' },
        { name: 'ATR (14)', value: atrVal[last]?.toFixed(2) || 'N/A', signal: '' },
        { name: 'ROC (12)', value: rocVal[last]?.toFixed(2) + '%' || 'N/A', signal: rocVal[last] > 0 ? 'Bullish' : 'Bearish' },
        { name: 'CCI (20)', value: cciVal[last]?.toFixed(1) || 'N/A', signal: cciVal[last] > 100 ? 'Overbought' : cciVal[last] < -100 ? 'Oversold' : 'Neutral' },
        { name: 'Williams %R', value: wrVal[last]?.toFixed(1) || 'N/A', signal: wrVal[last] > -20 ? 'Overbought' : wrVal[last] < -80 ? 'Oversold' : 'Neutral' },
        { name: 'EMA 20', value: '$' + formatPrice(TA.ema(closes, 20)[last]), signal: closes[last] > TA.ema(closes, 20)[last] ? 'Preis darueber' : 'Preis darunter' },
        { name: 'EMA 50', value: '$' + formatPrice(TA.ema(closes, 50)[last]), signal: closes[last] > TA.ema(closes, 50)[last] ? 'Preis darueber' : 'Preis darunter' },
        { name: 'SMA 200', value: closes.length >= 200 ? '$' + formatPrice(TA.sma(closes, 200)[last]) : 'N/A', signal: closes.length >= 200 && closes[last] > TA.sma(closes, 200)[last] ? 'Bullish' : 'N/A' },
        { name: 'Bollinger Upper', value: '$' + formatPrice(bb.upper[last] || 0), signal: '' },
        { name: 'Bollinger Lower', value: '$' + formatPrice(bb.lower[last] || 0), signal: '' },
      ];

      // Pivot Points
      const pivots = TA.pivotPoints(highs[last], lows[last], closes[last]);

      html += `
        <div class="card" style="margin-bottom: 20px;">
          <div class="card-header">
            <div class="card-title">${symbol} - Technische Indikatoren</div>
            <span style="font-size: 18px; font-weight: 700;">$${formatPrice(closes[last])}</span>
          </div>
          <table class="detail-table">
            <thead>
              <tr><th>Indikator</th><th>Wert</th><th>Signal</th></tr>
            </thead>
            <tbody>
              ${indicators.map(ind => {
                const sigColor = ind.signal.includes('Bullish') || ind.signal.includes('darueber') ? 'var(--green)' :
                                 ind.signal.includes('Bearish') || ind.signal.includes('darunter') ? 'var(--red)' :
                                 ind.signal.includes('Oversold') ? 'var(--green)' :
                                 ind.signal.includes('Overbought') ? 'var(--red)' : 'var(--text-muted)';
                return `<tr>
                  <td style="font-weight: 600;">${ind.name}</td>
                  <td>${ind.value}</td>
                  <td style="color: ${sigColor}; font-weight: 600;">${ind.signal}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>

          <div style="margin-top: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">PIVOT PUNKTE</div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center;">
              ${['S3', 'S2', 'S1', 'PP', 'R1', 'R2', 'R3'].map((label, i) => {
                const vals = [pivots.s3, pivots.s2, pivots.s1, pivots.pp, pivots.r1, pivots.r2, pivots.r3];
                const color = i < 3 ? 'var(--red)' : i === 3 ? 'var(--yellow)' : 'var(--green)';
                return `<div class="tp-level">
                  <div class="tp-label">${label}</div>
                  <div class="tp-price" style="color: ${color}; font-size: 12px;">$${formatPrice(vals[i])}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // ─── Update timestamp ─────────────────────────────────
  function updateTimestamp() {
    const el = document.getElementById('last-update');
    if (el) {
      el.textContent = `Letztes Update: ${new Date().toLocaleString('de-DE')}`;
    }
  }

  // ─── Main Analysis Runner ─────────────────────────────
  async function runAnalysis() {
    if (isLoading) return;
    isLoading = true;

    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) refreshBtn.classList.add('loading-spin');

    const signalsContainer = document.getElementById('signals-container');
    if (signalsContainer) showLoading(signalsContainer);

    const results = {};

    try {
      // Fetch current prices
      const prices = await DataAPI.getCurrentPrices(selectedAssets);

      // Analyze each asset
      for (const symbol of selectedAssets) {
        try {
          const candles = await DataAPI.getMarketData(symbol, 100);
          if (!candles || candles.length < 30) {
            results[symbol] = { error: 'Nicht genug Daten' };
            continue;
          }

          const masterSignal = Strategies.generateMasterSignal(candles);
          const priceData = prices[symbol] || {};

          results[symbol] = {
            masterSignal,
            candles,
            currentPrice: priceData.price || candles[candles.length - 1].close,
            change24h: priceData.change24h || 0,
            volume24h: priceData.volume24h || 0,
            marketCap: priceData.marketCap || 0
          };
        } catch (e) {
          console.error(`Error analyzing ${symbol}:`, e);
          results[symbol] = { error: e.message };
        }
      }

      // Fetch Fear & Greed
      let fearGreed = null;
      try {
        fearGreed = await DataAPI.getFearGreedIndex();
      } catch (e) {
        console.warn('Fear & Greed fetch failed:', e);
      }

      // Cache results
      analysisCache = results;

      // Render all tabs
      renderSignals(results);
      renderStrategyDetails(results);
      renderRiskTab(results);
      renderMarketOverview(results, fearGreed);
      renderTechnicalAnalysis(results);
      updateTimestamp();

    } catch (e) {
      console.error('Analysis failed:', e);
      if (signalsContainer) showError(signalsContainer, `Analyse fehlgeschlagen: ${e.message}. Versuche es in 30 Sekunden erneut.`);
    } finally {
      isLoading = false;
      if (refreshBtn) refreshBtn.classList.remove('loading-spin');
    }
  }

  // ─── Initialize ───────────────────────────────────────
  function init() {
    initTabs();
    initAssetSelector();
    initAccountBar();

    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', runAnalysis);

    // Auto-start analysis
    runAnalysis();

    // Auto-refresh every 5 minutes
    setInterval(runAnalysis, 5 * 60 * 1000);
  }

  return { init, runAnalysis };
})();

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', UI.init);
