# Universal Trading Bot

Live Trading Signale mit technischer Analyse, 5 Strategien und Risikomanagement.

## Features

- **5 Trading-Strategien**: Trend Following, Mean Reversion, Momentum, Volatility Breakout, Multi-Timeframe
- **12+ Technische Indikatoren**: RSI, MACD, Bollinger Bands, EMA, ADX, Stochastic, ATR, ROC, CCI, Williams %R, Pivot Points, Fibonacci
- **Live-Daten**: Binance API + CoinGecko API
- **Risikomanagement**: Position Sizing, Stop-Loss/Take-Profit, Portfolio-Analyse
- **13 Crypto-Assets**: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, DOT, AVAX, LINK, MATIC, UNI, ATOM
- **Fear & Greed Index**: Crypto-Marktsentiment

## Architektur

```
js/ta.js         - Technische Analyse Engine
js/api.js        - Daten-Fetching (Binance, CoinGecko)
js/strategies.js - 5 Trading-Strategien + Master-Signal
js/risk.js       - Risikomanagement & Position Sizing
js/ui.js         - Dashboard UI Controller
css/dashboard.css - Styling
index.html       - Hauptseite
```

## Hinweis

Keine Anlageberatung. Kein Algorithmus kann den Markt mit 100% Sicherheit vorhersagen.
