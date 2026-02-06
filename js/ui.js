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

      // Regime and filter info
      const regime = master.regime || {};
      const filterResults = master.filterResults || {};
      const pipeline = master.pipeline || [];

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

          <!-- Regime + Quality Badge -->
          <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            ${regime.label ? `
              <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 700;
                background: ${regime.color}22; color: ${regime.color}; border: 1px solid ${regime.color}44;">
                ${regime.label} (${regime.confidence}%)
              </span>` : ''}
            ${filterResults.grade ? `
              <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 700;
                background: ${filterResults.gradeColor}22; color: ${filterResults.gradeColor}; border: 1px solid ${filterResults.gradeColor}44;">
                Qualitaet: ${filterResults.grade} (${filterResults.passRate}%)
              </span>` : ''}
          </div>

          <!-- Signal Pipeline -->
          ${pipeline.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">
              ${pipeline.map((p, i) => `
                <span style="padding: 2px 6px; border-radius: 4px; background: var(--bg-secondary);">
                  ${p.step}: <strong style="color: ${p.value > 0 ? 'var(--green)' : p.value < 0 ? 'var(--red)' : 'var(--yellow)'};">
                    ${p.value > 0 ? '+' : ''}${p.value}
                  </strong>
                </span>
                ${i < pipeline.length - 1 ? '<span style="color: var(--text-muted);">&#8594;</span>' : ''}
              `).join('')}
            </div>` : ''}

          <div class="score-meter">
            <div class="score-fill ${getScoreFillClass(master.masterSignal + 50)}"
                 style="width: ${Math.min(100, Math.max(0, master.masterSignal + 50))}%"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            <span>Konsens: ${master.consensus}%</span>
            <span>${master.bullishCount} Bullish / ${master.bearishCount} Bearish / ${master.neutralCount} Neutral</span>
          </div>

          <!-- Signal Filters -->
          ${filterResults.filters ? `
            <button class="toggle-details" data-target="filters-${symbol}">Signal-Filter anzeigen (${filterResults.passCount}/${filterResults.totalFilters} bestanden)</button>
            <div class="details-content" id="filters-${symbol}">
              ${filterResults.filters.map(f => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 12px; border-bottom: 1px solid rgba(42,58,78,0.3);">
                  <span style="color: ${f.pass ? 'var(--green)' : 'var(--red)'};">${f.pass ? '\u2713' : '\u2717'} ${f.name}</span>
                  <span style="color: var(--text-muted);">${f.value}</span>
                </div>
              `).join('')}
            </div>` : ''}

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

      const regime = data.masterSignal.regime || {};
      const adaptiveWeights = data.masterSignal.adaptiveWeights || {};
      html += `<h3 style="margin: 20px 0 12px; font-size: 18px;">${symbol} - Strategie-Details</h3>`;

      if (regime.label) {
        html += `
          <div class="strategy-detail" style="border-left-color: ${regime.color || 'var(--accent-blue)'}; margin-bottom: 16px;">
            <div class="strategy-detail-header">
              <div>
                <div class="strategy-detail-name">Markt-Regime: ${regime.label}</div>
                <div class="strategy-detail-desc">Konfidenz: ${regime.confidence}% | Strategie-Gewichte werden automatisch angepasst</div>
              </div>
            </div>
            ${Object.keys(regime.details || {}).length > 0 ? `
              <div class="strategy-detail-grid">
                ${Object.entries(regime.details).map(([k, v]) => `
                  <div class="strategy-detail-item">
                    <div class="strategy-detail-item-label">${k}</div>
                    <div class="strategy-detail-item-value">${v}</div>
                  </div>
                `).join('')}
              </div>` : ''}
            ${Object.keys(adaptiveWeights).length > 0 ? `
              <div style="margin-top: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted);">ADAPTIVE GEWICHTE</div>
              <div style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
                ${Object.entries(adaptiveWeights).map(([k, v]) => `
                  <span style="font-size: 11px; padding: 3px 8px; border-radius: 4px; background: var(--bg-primary);
                    color: ${v >= 30 ? 'var(--green)' : v >= 15 ? 'var(--yellow)' : 'var(--text-muted)'};">
                    ${k}: ${v}%
                  </span>
                `).join('')}
              </div>` : ''}
          </div>`;
      }

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

      // Analyze each asset with adaptive intelligence
      const allCandles = {};
      for (const symbol of selectedAssets) {
        try {
          const candles = await DataAPI.getMarketData(symbol, 100);
          if (!candles || candles.length < 30) {
            results[symbol] = { error: 'Nicht genug Daten' };
            continue;
          }

          allCandles[symbol] = candles;

          // Use enhanced signal pipeline (regime-aware + filtered)
          const enhancedSignal = Adaptive.generateEnhancedSignal(candles);
          const priceData = prices[symbol] || {};

          results[symbol] = {
            masterSignal: enhancedSignal,
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

      // Cross-asset correlation analysis
      let correlationMatrix = null;
      let correlationWarnings = null;
      if (Object.keys(allCandles).length >= 2) {
        try {
          correlationMatrix = Adaptive.buildCorrelationMatrix(allCandles);
          const signalMap = {};
          for (const [sym, data] of Object.entries(results)) {
            if (data.masterSignal) signalMap[sym] = data.masterSignal.masterSignal;
          }
          correlationWarnings = Adaptive.analyzePortfolioCorrelation(correlationMatrix, signalMap);
        } catch (e) {
          console.warn('Correlation analysis failed:', e);
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

  // ─── Draw Equity Chart (pure Canvas) ─────────────────
  function drawEquityChart(canvasId, equityCurve, drawdownSeries) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !equityCurve || equityCurve.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const padding = { top: 20, right: 12, bottom: 24, left: 60 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const minVal = Math.min(...equityCurve);
    const maxVal = Math.max(...equityCurve);
    const range = maxVal - minVal || 1;

    function x(i) { return padding.left + (i / (equityCurve.length - 1)) * chartW; }
    function y(v) { return padding.top + chartH - ((v - minVal) / range) * chartH; }

    // Grid lines
    ctx.strokeStyle = 'rgba(42, 58, 78, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const yPos = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(W - padding.right, yPos);
      ctx.stroke();

      const val = maxVal - (range / 4) * i;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('$' + val.toFixed(0), padding.left - 6, yPos + 4);
    }

    // Equity fill
    ctx.beginPath();
    ctx.moveTo(x(0), y(equityCurve[0]));
    for (let i = 1; i < equityCurve.length; i++) {
      ctx.lineTo(x(i), y(equityCurve[i]));
    }
    ctx.lineTo(x(equityCurve.length - 1), padding.top + chartH);
    ctx.lineTo(x(0), padding.top + chartH);
    ctx.closePath();

    const finalAboveStart = equityCurve[equityCurve.length - 1] >= equityCurve[0];
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    if (finalAboveStart) {
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    }
    ctx.fillStyle = gradient;
    ctx.fill();

    // Equity line
    ctx.beginPath();
    ctx.moveTo(x(0), y(equityCurve[0]));
    for (let i = 1; i < equityCurve.length; i++) {
      ctx.lineTo(x(i), y(equityCurve[i]));
    }
    ctx.strokeStyle = finalAboveStart ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Starting balance line
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(padding.left, y(equityCurve[0]));
    ctx.lineTo(W - padding.right, y(equityCurve[0]));
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Start', padding.left, padding.top + chartH + 16);
    ctx.textAlign = 'right';
    ctx.fillText('Ende', W - padding.right, padding.top + chartH + 16);
  }

  // ─── Render Backtest Results ────────────────────────────
  function renderBacktestResults(symbol, btResults, dateRange) {
    const container = document.getElementById('backtest-container');
    if (!container) return;

    if (!btResults || Object.keys(btResults).length === 0) {
      container.innerHTML = '<div class="error-msg">Backtest hat keine Ergebnisse geliefert.</div>';
      return;
    }

    let html = '';

    // Date range info
    if (dateRange) {
      html += `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
        ${symbol} | ${dateRange.from} bis ${dateRange.to}
      </div>`;
    }

    // Comparison table
    html += `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div class="card-title">Strategie-Vergleich: ${symbol}</div>
        </div>
        <div style="overflow-x: auto;">
          <table class="bt-comparison-table">
            <thead>
              <tr>
                <th>Strategie</th>
                <th>Rendite</th>
                <th>Win Rate</th>
                <th>Trades</th>
                <th>Profit Factor</th>
                <th>Max Drawdown</th>
                <th>Sharpe</th>
                <th>Endkapital</th>
              </tr>
            </thead>
            <tbody>
    `;

    // Find best/worst for highlighting
    const entries = Object.entries(btResults).filter(([_, r]) => r.stats && !r.error);
    const bestReturn = Math.max(...entries.map(([_, r]) => r.stats.totalReturn));
    const worstReturn = Math.min(...entries.map(([_, r]) => r.stats.totalReturn));

    for (const [name, result] of entries) {
      const s = result.stats;
      const isB = s.totalReturn === bestReturn && bestReturn > 0;
      const isW = s.totalReturn === worstReturn && worstReturn < 0;
      html += `
        <tr>
          <td>${name}<br><span style="font-size: 10px; color: var(--text-muted); font-weight: 400;">${result.description || ''}</span></td>
          <td class="${s.totalReturn >= 0 ? (isB ? 'bt-best' : '') : (isW ? 'bt-worst' : '')}"
              style="color: ${s.totalReturn >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight: 700;">
            ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%
          </td>
          <td style="font-weight: 600;">${s.winRate}%</td>
          <td>${s.totalTrades}</td>
          <td style="font-weight: 600; color: ${s.profitFactor >= 1 ? 'var(--green)' : 'var(--red)'};">${s.profitFactor}</td>
          <td style="color: var(--red);">-${s.maxDrawdownPercent}%</td>
          <td style="font-weight: 600; color: ${s.sharpeRatio >= 1 ? 'var(--green)' : s.sharpeRatio >= 0 ? 'var(--yellow)' : 'var(--red)'};">${s.sharpeRatio}</td>
          <td style="font-weight: 700;">$${s.finalEquity.toLocaleString('de-DE')}</td>
        </tr>
      `;
    }

    html += '</tbody></table></div></div>';

    // Detailed cards per strategy
    for (const [name, result] of entries) {
      const s = result.stats;
      const chartId = `chart-${name.replace(/\s+/g, '-').toLowerCase()}`;

      html += `
        <div class="bt-strategy-card fade-in">
          <div class="bt-strategy-header">
            <div>
              <div class="bt-strategy-name">${name}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${result.description || ''}</div>
            </div>
            <div class="bt-return ${s.totalReturn >= 0 ? 'positive' : 'negative'}">
              ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%
            </div>
          </div>

          <!-- Equity Chart -->
          <div class="equity-chart"><canvas id="${chartId}"></canvas></div>

          <!-- Stats Grid -->
          <div class="bt-stats-grid">
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: ${s.winRate >= 50 ? 'var(--green)' : 'var(--red)'};">${s.winRate}%</div>
              <div class="bt-stat-label">Win Rate</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value">${s.totalTrades}</div>
              <div class="bt-stat-label">Trades</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--green);">${s.wins}</div>
              <div class="bt-stat-label">Gewinner</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--red);">${s.losses}</div>
              <div class="bt-stat-label">Verlierer</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: ${s.profitFactor >= 1 ? 'var(--green)' : 'var(--red)'};">${s.profitFactor}</div>
              <div class="bt-stat-label">Profit Factor</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--red);">-${s.maxDrawdownPercent}%</div>
              <div class="bt-stat-label">Max Drawdown</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: ${s.sharpeRatio >= 1 ? 'var(--green)' : 'var(--yellow)'};">${s.sharpeRatio}</div>
              <div class="bt-stat-label">Sharpe Ratio</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value">${s.sortinoRatio}</div>
              <div class="bt-stat-label">Sortino Ratio</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--green);">+${s.avgWinPercent}%</div>
              <div class="bt-stat-label">Avg. Win</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--red);">${s.avgLossPercent}%</div>
              <div class="bt-stat-label">Avg. Loss</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--green);">${s.maxWinStreak}</div>
              <div class="bt-stat-label">Max Win Streak</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--red);">${s.maxLossStreak}</div>
              <div class="bt-stat-label">Max Loss Streak</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value">${s.avgHoldingPeriod}d</div>
              <div class="bt-stat-label">Avg. Haltezeit</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value" style="color: var(--red);">$${s.totalCommissions}</div>
              <div class="bt-stat-label">Gebuehren</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value">${s.expectancy >= 0 ? '+' : ''}$${s.expectancy}</div>
              <div class="bt-stat-label">Erwartungswert/Trade</div>
            </div>
            <div class="bt-stat">
              <div class="bt-stat-value">$${s.finalEquity.toLocaleString('de-DE')}</div>
              <div class="bt-stat-label">Endkapital</div>
            </div>
          </div>

          <!-- Trade History -->
          ${result.trades && result.trades.length > 0 ? `
            <div style="margin-top: 16px;">
              <button class="toggle-details" onclick="this.nextElementSibling.classList.toggle('open')">
                ${result.trades.length} Trades anzeigen
              </button>
              <div class="details-content">
                <div style="overflow-x: auto; margin-top: 8px;">
                  <div class="bt-trade-row header">
                    <span>#</span>
                    <span>Richtung</span>
                    <span>Einstieg</span>
                    <span>Ausstieg</span>
                    <span>Grund</span>
                    <span>P&L</span>
                    <span>P&L %</span>
                  </div>
                  ${result.trades.map((t, idx) => `
                    <div class="bt-trade-row">
                      <span>${idx + 1}</span>
                      <span style="color: ${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight: 600;">${t.direction.toUpperCase()}</span>
                      <span>$${formatPrice(t.entry)}</span>
                      <span>$${formatPrice(t.exit)}</span>
                      <span style="font-size: 11px;">${t.reason}</span>
                      <span style="color: ${t.pnl >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight: 700;">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</span>
                      <span style="color: ${t.pnlPercent >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight: 700;">${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = html;

    // Draw equity charts after DOM update
    requestAnimationFrame(() => {
      for (const [name, result] of entries) {
        if (result.equityCurve) {
          const chartId = `chart-${name.replace(/\s+/g, '-').toLowerCase()}`;
          drawEquityChart(chartId, result.equityCurve, result.drawdownSeries);
        }
      }
    });
  }

  // ─── Backtest Runner ──────────────────────────────────
  async function runBacktest(symbol, days, balance, risk) {
    const container = document.getElementById('backtest-container');
    showLoading(container);

    try {
      const candles = await DataAPI.getMarketData(symbol, days);
      if (!candles || candles.length < 60) {
        showError(container, `Nicht genug Daten fuer ${symbol}. Nur ${candles ? candles.length : 0} Kerzen verfuegbar (min. 60 benoetigt).`);
        return;
      }

      const results = Backtest.runAll(candles, {
        initialBalance: balance,
        riskPerTrade: risk
      });

      const dateRange = {
        from: new Date(candles[0].time).toLocaleDateString('de-DE'),
        to: new Date(candles[candles.length - 1].time).toLocaleDateString('de-DE')
      };

      renderBacktestResults(symbol, results, dateRange);
    } catch (e) {
      showError(container, `Backtest fehlgeschlagen: ${e.message}`);
    }
  }

  async function runBacktestAll(days, balance, risk) {
    const container = document.getElementById('backtest-container');
    showLoading(container);

    const symbols = ['BTC', 'ETH', 'SOL'];
    let allHtml = '';

    for (const symbol of symbols) {
      try {
        const candles = await DataAPI.getMarketData(symbol, days);
        if (!candles || candles.length < 60) continue;

        const results = Backtest.runAll(candles, { initialBalance: balance, riskPerTrade: risk });
        const masterResult = results['Master Signal'];

        if (masterResult && masterResult.stats) {
          const s = masterResult.stats;
          allHtml += `
            <div class="card" style="margin-bottom: 12px; cursor: pointer;" onclick="UI.runSingleBacktest('${symbol}')">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 18px; font-weight: 800;">${symbol}</div>
                  <div style="font-size: 12px; color: var(--text-muted);">${candles.length} Kerzen | Master Signal</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 20px; font-weight: 800; color: ${s.totalReturn >= 0 ? 'var(--green)' : 'var(--red)'};">
                    ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn}%
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted);">
                    ${s.totalTrades} Trades | WR: ${s.winRate}% | PF: ${s.profitFactor} | Sharpe: ${s.sharpeRatio}
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      } catch (e) {
        console.error(`Backtest failed for ${symbol}:`, e);
      }
    }

    if (allHtml) {
      container.innerHTML = `
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Klicke auf ein Asset fuer den vollstaendigen Backtest</div>
        ${allHtml}
      `;
    } else {
      showError(container, 'Keine Backtest-Ergebnisse verfuegbar.');
    }
  }

  function runSingleBacktest(symbol) {
    const days = parseInt(document.getElementById('bt-days').value) || 365;
    const balance = parseFloat(document.getElementById('bt-balance').value) || 10000;
    const risk = parseFloat(document.getElementById('bt-risk').value) || 2;
    runBacktest(symbol, days, balance, risk);
  }

  // ─── Initialize ───────────────────────────────────────
  function init() {
    initTabs();
    initAssetSelector();
    initAccountBar();

    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', runAnalysis);

    // Backtest buttons
    document.getElementById('btn-backtest')?.addEventListener('click', () => {
      const symbol = document.getElementById('bt-symbol').value;
      const days = parseInt(document.getElementById('bt-days').value) || 365;
      const balance = parseFloat(document.getElementById('bt-balance').value) || 10000;
      const risk = parseFloat(document.getElementById('bt-risk').value) || 2;
      runBacktest(symbol, days, balance, risk);
    });

    document.getElementById('btn-backtest-all')?.addEventListener('click', () => {
      const days = parseInt(document.getElementById('bt-days').value) || 365;
      const balance = parseFloat(document.getElementById('bt-balance').value) || 10000;
      const risk = parseFloat(document.getElementById('bt-risk').value) || 2;
      runBacktestAll(days, balance, risk);
    });

    // Auto-start analysis
    runAnalysis();

    // Auto-refresh every 5 minutes
    setInterval(runAnalysis, 5 * 60 * 1000);
  }

  return { init, runAnalysis, runSingleBacktest };
})();

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', UI.init);
