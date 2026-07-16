# EBA Finance Tracker — PRD

## Product
Mobile-first financial tracking app for EBA Consulting Ltd. — a newly established consulting company. Primary user (Erkan) records daily income, expenses, startup costs, and personal investment to know the company's real cash position at a glance.

## Tech Stack
- **Backend**: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt. All routes prefixed `/api`.
- **Frontend**: Expo Router (React Native / SDK 54). Secure storage via `@/src/utils/storage` (SecureStore on native, localStorage on web).
- **Auth**: JWT (30-day expiry), email/password login and registration.

## Screens
1. **Auth** — sign-in / sign-up with hero image + navy gradient scrim.
2. **Dashboard** — 6 summary cards (Total Income, Operating Expenses, Startup Costs, Net Cash, Personal Investment, Available Cash) per currency (EUR/TRY/GBP), Income vs Expenses bar chart, recent transactions.
3. **Income** — list + FAB + form modal. Fields: date, client_name, service_description, invoice_number, amount, currency, status (paid/pending), notes.
4. **Expenses** — list with category icons + FAB + form modal. Category, vendor, description, amount, currency, payment_method, paid_by (Personal/Company/Bahar/Other).
5. **Startup Costs** — separate section with total hero card + list + FAB + form modal.
6. **Reports** — Monthly / Category / Cash Flow tabs + CSV export (all/income/expenses/startup).
7. **Settings** — Profile card, dark mode toggle, system-theme option, personal investment link, sign out.
8. **Personal Investment (`/investments`)** — inline form + list, accessible from Dashboard and Settings.

## Multi-currency
Every amount stored with its currency (EUR / TRY / GBP). Dashboard and reports show totals **separately per currency** — no conversion.

## Design
Navy blue (`#003366`) accents on white background, iOS-native rhythm (8pt grid), Ionicons, rounded 12px cards, 44pt tap targets, dark mode with automatic system detection.

## Environment fixes applied
- Installed Watchman 2024.02.05.00 + libssl1.1 to enable Metro's file watching within the constrained inotify limit (12288 watches).
- Added `.watchmanconfig` to ignore `.git/.expo/.metro-cache/android/ios`.
- Set `JWT_SECRET` in `/app/backend/.env`.

## Future (deferred per spec)
Invoice generation, VAT/tax reports, bank integration, OCR receipt scanning, client management, project profitability, recurring expenses, budgets.
