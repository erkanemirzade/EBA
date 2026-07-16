"""Iteration 4 — Security-audit remediation tests.
Covers SEC-001 (recurring caps), SEC-002 (regex escape), input length caps,
login throttle, register enumeration protection, CSV kind allowlist,
CSV formula injection prefix, PDF markup escape, JWT_SECRET fail-closed.
"""
import os
import io
import csv
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://eba-expense-hub.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _uemail(p="sec"):
    return f"TEST_{p}_{uuid.uuid4().hex[:8]}@example.com"


def _register(prefix="sec"):
    email = _uemail(prefix)
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "secret123", "name": f"Sec {prefix}"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "email": email,
        "headers": {"Authorization": f"Bearer {d['access_token']}"},
        "user": d["user"],
        "token": d["access_token"],
    }


@pytest.fixture(scope="module")
def user():
    return _register("sec_main")


# ---------------- SEC-001: Recurring caps ----------------
class TestRecurringCaps:
    def test_max_50_active_rules_per_user(self):
        """Create 50 rules OK, 51st returns 400."""
        u = _register("cap")
        h = u["headers"]
        future = "2099-12-31"
        payload_tpl = lambda i: {
            "name": f"Cap Rule {i}",
            "kind": "expense",
            "frequency": "monthly",
            "next_run": future,
            "active": True,
            "template": {
                "category": "Software",
                "vendor": "V",
                "description": "d",
                "amount": 1.0,
                "currency": "EUR",
                "paid_by": "Company",
            },
        }
        created = []
        for i in range(50):
            r = requests.post(f"{API}/recurring", json=payload_tpl(i), headers=h)
            assert r.status_code == 200, f"Rule #{i+1} failed: {r.status_code} {r.text}"
            created.append(r.json()["id"])
        # 51st should be rejected
        r = requests.post(f"{API}/recurring", json=payload_tpl(999), headers=h)
        assert r.status_code == 400, f"Expected 400 on 51st rule, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "").lower()
        assert "50" in detail or "at most" in detail
        # Cleanup
        for rid in created:
            requests.delete(f"{API}/recurring/{rid}", headers=h)

    def test_catchup_capped_at_200_records(self, user):
        """Rule with next_run 10 years ago (weekly) — per-invocation cap keeps posts <= 200."""
        h = user["headers"]
        very_old = "2016-01-01"
        payload = {
            "name": "TEST_CatchupCap",
            "kind": "expense",
            "frequency": "weekly",
            "next_run": very_old,
            "active": True,
            "template": {
                "category": "Software",
                "vendor": "TEST_CapVendor",
                "description": "TEST catchup cap",
                "amount": 1.0,
                "currency": "EUR",
                "paid_by": "Company",
            },
        }
        r = requests.post(f"{API}/recurring", json=payload, headers=h)
        assert r.status_code == 200, r.text
        rule = r.json()
        rid = rule["id"]
        # Per-rule cap is 60 and global cap is 200 → single invocation posts at most 60
        # (per-rule cap kicks in first for a single rule). posted_count should be <= 200.
        assert rule["posted_count"] <= 200, f"posted_count={rule['posted_count']} exceeds 200 cap"
        assert rule["posted_count"] >= 1
        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=h)
        exp = requests.get(f"{API}/expenses", headers=h).json()
        for e in [x for x in exp if x.get("vendor") == "TEST_CapVendor"]:
            requests.delete(f"{API}/expenses/{e['id']}", headers=h)


# ---------------- SEC-002: Regex search escape ----------------
class TestRegexEscape:
    @pytest.fixture(scope="class")
    def seeded(self):
        u = _register("regex")
        h = u["headers"]
        items = [
            {"date": "2026-01-15", "client_name": "Acme", "service_description": "s",
             "amount": 10, "currency": "EUR", "status": "paid"},
            {"date": "2026-01-16", "client_name": "Beta", "service_description": "s",
             "amount": 20, "currency": "EUR", "status": "paid"},
            {"date": "2026-01-17", "client_name": "literal.*match", "service_description": "s",
             "amount": 30, "currency": "EUR", "status": "paid"},
        ]
        ids = []
        for p in items:
            r = requests.post(f"{API}/income", json=p, headers=h)
            assert r.status_code == 200
            ids.append(r.json()["id"])
        yield {"headers": h, "ids": ids}
        for iid in ids:
            requests.delete(f"{API}/income/{iid}", headers=h)

    def test_dotstar_treated_as_literal(self, seeded):
        h = seeded["headers"]
        r = requests.get(f"{API}/income", params={"q": ".*"}, headers=h)
        assert r.status_code == 200
        rows = r.json()
        # Should only match the row containing literal ".*"
        assert len(rows) == 1, f"Expected 1 literal match, got {len(rows)}: {[i['client_name'] for i in rows]}"
        assert ".*" in rows[0]["client_name"]

    def test_expenses_dotstar_literal(self):
        u = _register("regexexp")
        h = u["headers"]
        p = {"date": "2026-01-15", "category": "Software", "vendor": "vendor.*special",
             "description": "d", "amount": 5, "currency": "EUR", "paid_by": "Company"}
        r = requests.post(f"{API}/expenses", json=p, headers=h)
        assert r.status_code == 200
        p2 = {**p, "vendor": "PlainVendor"}
        requests.post(f"{API}/expenses", json=p2, headers=h)
        r = requests.get(f"{API}/expenses", params={"q": ".*"}, headers=h)
        assert r.status_code == 200
        rows = r.json()
        # Only 1 record contains literal ".*" — the ".*special" one
        assert len(rows) == 1
        assert ".*" in rows[0]["vendor"]

    def test_long_q_truncated_no_crash(self, seeded):
        h = seeded["headers"]
        long_q = "x" * 5000
        r = requests.get(f"{API}/income", params={"q": long_q}, headers=h, timeout=10)
        assert r.status_code == 200, f"Long q crashed: {r.status_code} {r.text[:200]}"
        # Should return no matches (no client name contains 5000 x's)
        assert r.json() == []


# ---------------- Field length caps ----------------
class TestFieldLengthCaps:
    def test_income_client_name_over_120_rejected(self, user):
        p = {"date": "2026-01-15", "client_name": "A" * 200,
             "service_description": "s", "amount": 10, "currency": "EUR", "status": "paid"}
        r = requests.post(f"{API}/income", json=p, headers=user["headers"])
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_expense_description_over_500_rejected(self, user):
        p = {"date": "2026-01-15", "category": "Software", "vendor": "V",
             "description": "d" * 600, "amount": 10, "currency": "EUR", "paid_by": "Company"}
        r = requests.post(f"{API}/expenses", json=p, headers=user["headers"])
        assert r.status_code == 422

    def test_investment_zero_or_negative_amount_rejected(self, user):
        for bad in [0, -1, -100.5]:
            p = {"date": "2026-01-15", "amount": bad, "currency": "EUR"}
            r = requests.post(f"{API}/investments", json=p, headers=user["headers"])
            assert r.status_code == 422, f"amount={bad} accepted (status={r.status_code})"

    def test_income_valid_at_boundary(self, user):
        """Ensure exact max_length still passes (regression check)."""
        p = {"date": "2026-01-15", "client_name": "A" * 120,
             "service_description": "s", "amount": 10, "currency": "EUR", "status": "paid"}
        r = requests.post(f"{API}/income", json=p, headers=user["headers"])
        assert r.status_code == 200
        requests.delete(f"{API}/income/{r.json()['id']}", headers=user["headers"])


# ---------------- Login throttle ----------------
class TestLoginThrottle:
    def test_9th_wrong_password_returns_429(self):
        u = _register("throttle")
        email = u["email"]
        # 8 wrong attempts allowed, 9th blocked
        last_status = None
        for i in range(8):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
            last_status = r.status_code
            assert r.status_code == 401, f"attempt {i+1} unexpected: {r.status_code}"
        # 9th should be 429
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
        assert r.status_code == 429, f"Expected 429 on 9th, got {r.status_code}: {r.text}"

    def test_successful_login_clears_counter(self):
        u = _register("throttle_clear")
        email = u["email"]
        # 4 wrong
        for _ in range(4):
            requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
        # correct login clears
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert r.status_code == 200
        # now 4 more wrong should NOT trigger 429 (counter reset)
        for i in range(4):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
            assert r.status_code == 401, f"Post-reset attempt {i+1} got {r.status_code}"


# ---------------- Register enumeration protection ----------------
class TestRegisterEnumeration:
    def test_duplicate_returns_generic_message(self, user):
        r = requests.post(
            f"{API}/auth/register",
            json={"email": user["email"], "password": "anythingelse", "name": "X"},
        )
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert detail == "Unable to register with the provided credentials", \
            f"Non-generic message leaks enumeration: {detail!r}"
        assert "already" not in detail.lower()
        assert "exist" not in detail.lower()


# ---------------- CSV kind allowlist ----------------
class TestCSVKindAllowlist:
    def test_path_traversal_kind_rejected(self, user):
        r = requests.get(f"{API}/export/csv",
                         params={"kind": "../../etc/passwd"}, headers=user["headers"])
        assert r.status_code == 400

    def test_random_kind_rejected(self, user):
        r = requests.get(f"{API}/export/csv",
                         params={"kind": "hacker"}, headers=user["headers"])
        assert r.status_code == 400

    @pytest.mark.parametrize("kind", ["all", "income", "expenses", "startup", "investments"])
    def test_allowed_kinds_still_work(self, user, kind):
        r = requests.get(f"{API}/export/csv", params={"kind": kind}, headers=user["headers"])
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")


# ---------------- CSV injection protection ----------------
class TestCSVInjection:
    def test_formula_prefix_neutralized(self):
        u = _register("csvinj")
        h = u["headers"]
        p = {"date": "2026-01-15", "client_name": "=1+1",
             "service_description": "=SUM(A1:A9)", "amount": 10,
             "currency": "EUR", "status": "paid"}
        r = requests.post(f"{API}/income", json=p, headers=h)
        assert r.status_code == 200
        r = requests.get(f"{API}/export/csv", params={"kind": "income"}, headers=h)
        assert r.status_code == 200
        text = r.text
        # The raw value should NOT appear un-prefixed as a cell start
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        # Find data row(s) - client_name is column index 1 (after date)
        found = False
        for row in rows:
            if len(row) >= 2 and row[1].endswith("1+1"):
                # Must start with single quote to neutralize formula
                assert row[1].startswith("'="), f"CSV cell not neutralized: {row[1]!r}"
                found = True
                # service_description in column 2 also
                assert row[2].startswith("'="), f"service_description not neutralized: {row[2]!r}"
        assert found, "Injected row not found in CSV output"


# ---------------- PDF markup escape ----------------
class TestPDFMarkup:
    def test_pdf_with_bracketed_name(self):
        u_email = _uemail("pdf")
        r = requests.post(
            f"{API}/auth/register",
            json={"email": u_email, "password": "secret123", "name": "<b>hack</b>&<i>x</i>"},
        )
        assert r.status_code == 200
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/export/pdf", headers=h)
        assert r.status_code == 200, f"PDF broken by markup name: {r.status_code} {r.text[:300]}"
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000


# ---------------- JWT_SECRET fail-closed (code-path check) ----------------
class TestJWTSecretFailClosed:
    def test_server_up_with_jwt_secret(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200

    def test_source_refuses_missing_jwt_secret(self):
        """Static assertion: server.py raises RuntimeError if JWT_SECRET missing."""
        with open("/app/backend/server.py") as f:
            src = f.read()
        assert 'if not JWT_SECRET:' in src
        assert 'RuntimeError' in src
        # Also assert no fallback default
        assert 'JWT_SECRET", "' not in src  # no default env fallback
