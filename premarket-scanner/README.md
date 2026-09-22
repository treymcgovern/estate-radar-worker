# Premarket Stock Scanner v2

Standalone replacement for the old Google Apps Script scanner.

Screen: $0.10-$1.00, at least +5% premarket, at least 1,000,000 premarket shares.

Reliability: Yahoo/yfinance is primary and Nasdaq premarket market movers is fallback. If neither returns usable source records, the job sends DATA FEED FAILED instead of a misleading zero-result scan.

GitHub repository secrets required:
- SMTP_USERNAME
- SMTP_APP_PASSWORD
- EMAIL_TO

SMTP_APP_PASSWORD is a Google App Password, not the normal Gmail password. No market-data API key is required.

Keep the old Google Apps Script enabled until this replacement completes one successful live premarket run.
