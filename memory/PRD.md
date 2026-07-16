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

## Iteration 3 additions (Feb 2026)
- **Recurring transactions with auto-post scheduler**: new `recurring` collection with template + frequency (`weekly` / `monthly` / `yearly`).
- Endpoints: `POST /api/recurring`, `GET /api/recurring`, `PUT /api/recurring/{id}`, `DELETE /api/recurring/{id}`, `POST /api/recurring/process`.
- **Lazy scheduler**: `_process_due_recurring(user_id)` is invoked on `GET /api/summary`, `/api/income`, `/api/expenses`, `/api/startup-costs`, `/api/recurring`, and immediately after `POST /api/recurring`. It catches up any missed cycles (safety cap 60 per pass), advances `next_run`, tracks `posted_count` and `last_posted`.
- Every auto-posted record stores a `recurring_id` foreign key back to its rule (visible in list responses).
- Frontend: new `/recurring` screen accessible from Settings → *Recurring Transactions*. Inline form supports Income / Expense / Startup rules; list shows kind/frequency/amount, next post date, posted count, and an active toggle switch. Tap-to-edit + delete supported.

## Iteration 4 additions (Feb 2026) — Security hardening

Security audit findings addressed. **74/74 backend tests passing** (23 new security tests + 51 prior).

- **DoS protection**:
  - `MAX_RECURRING_RULES_PER_USER = 50` — rejects further rules with 400.
  - `MAX_CATCHUP_POSTS_PER_INVOCATION = 200` — global cap on records posted in a single `_process_due_recurring` call.
- **Regex-injection guard**: `$regex` search terms in `/api/income?q=` and `/api/expenses?q=` are escaped with `re.escape()` and truncated to `MAX_SEARCH_LEN = 100` chars.
- **Input validation**: Pydantic `Field(...)` `max_length` on every user string (`client_name`, `service_description`, `vendor`, `description`, `notes`, `invoice_number`, recurring `name`), and `gt=0, le=1_000_000_000` on every amount.
- **Auth hardening**:
  - `JWT_SECRET` required (no guessable fallback) — backend refuses to start otherwise.
  - In-memory login throttle: 8 failures per email per 60s → 429; success resets.
  - Registration returns a generic error on duplicate email to prevent enumeration.
- **Export safety**:
  - `/api/export/csv?kind=…` allowlisted (`all|income|expenses|startup|investments`); other values return 400.
  - CSV cells starting with `= + - @` are prefixed with `'` to neutralize Excel/Sheets formula injection.
  - PDF (`reportlab`) escapes any user-supplied name via `xml.sax.saxutils.escape` before templating.
- **`.env`** patterns added to `/app/.gitignore`.

## Future (deferred per spec)
Invoice generation, VAT/tax reports, bank integration, OCR receipt scanning, client management, project profitability, budgets.

## Iteration 2 additions (Feb 2026)
- **Edit-in-place**: tap any income/expense/startup row → form opens pre-filled → PUT to update. Save button reads `Update`.
- **Search & filter**: `/api/income` and `/api/expenses` accept `q`, `date_from`, `date_to`, `currency`, `status`/`category`. Frontend adds search bar + existing chips already handle currency/status/category.
- **PDF summary export**: `/api/export/pdf` via reportlab renders a full statement (totals table + income/expenses/startup/investments sections) with navy branding. Reports tab has a prominent "PDF Summary" CTA + secondary CSV file buttons. On native, downloads to cache and opens the native share sheet via `expo-sharing`.
- **Smart currency-risk card**: Dashboard shows a contextual insight (`currency-insight-card`) — concentration warning if >80% of income in one currency, FX-exposure warning if income vs expense currency mismatch, pending-receivables warning if pending > received, or healthy state when balanced.
- **Modernization**: RN `shadow*` styles migrated to `boxShadow`; FastAPI `on_event('shutdown')` migrated to `lifespan` context manager.
