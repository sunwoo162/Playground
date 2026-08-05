# Mock Invest Product Definition

## User

Students and beginner investors who want to practice portfolio decisions without using real money.

## Product Job

Provide a safe trading simulator where users can inspect live-like quotes, place virtual orders, review holdings, write investment journals, and compare rankings.

## MVP Workflow

1. Sign in through Playground.
2. Review virtual cash and total assets.
3. Search or select a supported stock.
4. Inspect quote, range chart, and basic market data.
5. Buy or sell virtual shares after order validation.
6. Review order history and write a journal entry.
7. Compare rankings by total asset or return rate.

## Current Stack

- React + TypeScript + Vite
- Playground Express proxy to backend APIs
- Server-side portfolio, watchlist, order, journal, ranking, and admin APIs
- External market data through the backend

## Why This Stack

Trading simulation needs a server ledger. Portfolio cash, holdings, and order history cannot safely live only in the browser because rankings and account balances must be consistent across sessions.

## Production Requirements

- Stable backend routes under `/api/mock-invest`
- Market data provider API key and rate-limit policy
- Server-side order validation for cash, holdings, and quote availability
- Audit trail for admin cash grants
- Clear educational disclaimer on every trading surface
- Data reset policy for test seasons or competitions

## Required User Inputs For Production

- Starting virtual cash rules
- Supported stock universe
- Whether rankings are global, class-based, or private
- Market data provider and quota budget
- Terms/disclaimer text if released beyond personal use

## Verification

Use:

```powershell
npm run build --prefix apps/mock-invest
npm run harness
```
