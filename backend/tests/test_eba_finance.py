"""EBA Finance Tracker - comprehensive backend API tests"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://eba-expense-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(prefix="test"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def user_a():
    email = _unique_email("a")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "User A"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["access_token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['access_token']}"}}


@pytest.fixture(scope="module")
def user_b():
    email = _unique_email("b")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "User B"})
    assert r.status_code == 200
    data = r.json()
    return {"email": email, "token": data["access_token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['access_token']}"}}


# ---------------- Health ----------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        j = r.json()
        assert j.get("status") == "ok"


# ---------------- Auth ----------------
class TestAuth:
    def test_register_duplicate(self, user_a):
        r = requests.post(f"{API}/auth/register", json={"email": user_a["email"], "password": "x"})
        assert r.status_code == 400

    def test_login_success(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "secret123"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "WRONG"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=user_a["headers"])
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == user_a["email"].lower()


# ---------------- Income CRUD ----------------
class TestIncome:
    def test_create_list_update_delete(self, user_a):
        payload = {
            "date": "2026-01-15", "client_name": "Acme Ltd",
            "service_description": "Consulting", "amount": 1500.00,
            "currency": "EUR", "status": "paid",
        }
        r = requests.post(f"{API}/income", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["client_name"] == "Acme Ltd"
        assert item["amount"] == 1500.00
        item_id = item["id"]

        r = requests.get(f"{API}/income", headers=user_a["headers"])
        assert r.status_code == 200
        assert any(i["id"] == item_id for i in r.json())

        payload["amount"] = 2000.00
        r = requests.put(f"{API}/income/{item_id}", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        assert r.json()["amount"] == 2000.00

        r = requests.delete(f"{API}/income/{item_id}", headers=user_a["headers"])
        assert r.status_code == 200

    def test_user_scoping(self, user_a, user_b):
        payload = {
            "date": "2026-01-10", "client_name": "PrivateCo",
            "service_description": "Job", "amount": 500, "currency": "GBP", "status": "pending",
        }
        r = requests.post(f"{API}/income", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        income_id = r.json()["id"]

        # User B lists their income - should NOT see user A's
        r = requests.get(f"{API}/income", headers=user_b["headers"])
        assert r.status_code == 200
        assert not any(i["id"] == income_id for i in r.json())

        # cleanup
        requests.delete(f"{API}/income/{income_id}", headers=user_a["headers"])


# ---------------- Expenses ----------------
class TestExpenses:
    def test_crud_and_paid_by(self, user_a):
        payload = {
            "date": "2026-01-05", "category": "Software", "vendor": "Adobe",
            "description": "Subscription", "amount": 50.0, "currency": "EUR", "paid_by": "Personal",
        }
        r = requests.post(f"{API}/expenses", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        exp = r.json()
        assert exp["paid_by"] == "Personal"
        assert exp["category"] == "Software"
        exp_id = exp["id"]

        r = requests.get(f"{API}/expenses", headers=user_a["headers"])
        assert r.status_code == 200

        payload["paid_by"] = "Bahar"
        r = requests.put(f"{API}/expenses/{exp_id}", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        assert r.json()["paid_by"] == "Bahar"

        r = requests.delete(f"{API}/expenses/{exp_id}", headers=user_a["headers"])
        assert r.status_code == 200

    def test_invalid_category_rejected(self, user_a):
        payload = {
            "date": "2026-01-05", "category": "NotACategory", "vendor": "x",
            "description": "y", "amount": 1, "currency": "EUR",
        }
        r = requests.post(f"{API}/expenses", json=payload, headers=user_a["headers"])
        assert r.status_code == 422


# ---------------- Startup ----------------
class TestStartup:
    def test_crud(self, user_a):
        payload = {
            "date": "2025-12-30", "category": "Company Registration", "vendor": "Notary",
            "description": "Incorporation", "amount": 800, "currency": "TRY", "paid_by": "Personal",
        }
        r = requests.post(f"{API}/startup-costs", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        item = r.json()
        item_id = item["id"]

        r = requests.get(f"{API}/startup-costs", headers=user_a["headers"])
        assert r.status_code == 200

        r = requests.delete(f"{API}/startup-costs/{item_id}", headers=user_a["headers"])
        assert r.status_code == 200


# ---------------- Investments ----------------
class TestInvestments:
    def test_crud(self, user_a):
        payload = {"date": "2026-01-01", "amount": 5000, "currency": "EUR", "description": "Seed"}
        r = requests.post(f"{API}/investments", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        inv_id = r.json()["id"]

        r = requests.get(f"{API}/investments", headers=user_a["headers"])
        assert r.status_code == 200

        r = requests.delete(f"{API}/investments/{inv_id}", headers=user_a["headers"])
        assert r.status_code == 200


# ---------------- Summary & Reports ----------------
class TestSummaryReports:
    @pytest.fixture(scope="class")
    def seeded(self, user_a):
        """Create data across currencies + types, yield ids for cleanup."""
        headers = user_a["headers"]
        ids = {"income": [], "expenses": [], "startup": [], "investments": []}

        # Income paid EUR 1000, pending TRY 500, paid GBP 200
        for p in [
            {"date": "2026-01-15", "client_name": "A", "service_description": "s",
             "amount": 1000, "currency": "EUR", "status": "paid"},
            {"date": "2026-01-15", "client_name": "B", "service_description": "s",
             "amount": 500, "currency": "TRY", "status": "pending"},
            {"date": "2025-12-15", "client_name": "C", "service_description": "s",
             "amount": 200, "currency": "GBP", "status": "paid"},
        ]:
            r = requests.post(f"{API}/income", json=p, headers=headers)
            assert r.status_code == 200
            ids["income"].append(r.json()["id"])

        # Expense EUR 100 Company, TRY 50 Personal
        for p in [
            {"date": "2026-01-10", "category": "Office", "vendor": "v", "description": "d",
             "amount": 100, "currency": "EUR", "paid_by": "Company"},
            {"date": "2026-01-10", "category": "Software", "vendor": "v", "description": "d",
             "amount": 50, "currency": "TRY", "paid_by": "Personal"},
        ]:
            r = requests.post(f"{API}/expenses", json=p, headers=headers)
            assert r.status_code == 200
            ids["expenses"].append(r.json()["id"])

        # Startup 300 EUR Company
        p = {"date": "2025-12-01", "category": "Lawyer", "description": "fees",
             "amount": 300, "currency": "EUR", "paid_by": "Company"}
        r = requests.post(f"{API}/startup-costs", json=p, headers=headers)
        assert r.status_code == 200
        ids["startup"].append(r.json()["id"])

        # Investment 5000 EUR
        p = {"date": "2025-11-01", "amount": 5000, "currency": "EUR"}
        r = requests.post(f"{API}/investments", json=p, headers=headers)
        assert r.status_code == 200
        ids["investments"].append(r.json()["id"])

        yield ids

        # teardown
        for iid in ids["income"]: requests.delete(f"{API}/income/{iid}", headers=headers)
        for iid in ids["expenses"]: requests.delete(f"{API}/expenses/{iid}", headers=headers)
        for iid in ids["startup"]: requests.delete(f"{API}/startup-costs/{iid}", headers=headers)
        for iid in ids["investments"]: requests.delete(f"{API}/investments/{iid}", headers=headers)

    def test_summary_totals(self, user_a, seeded):
        r = requests.get(f"{API}/summary", headers=user_a["headers"])
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_income"]["EUR"] >= 1000
        assert s["total_income"]["GBP"] >= 200
        assert s["pending_income"]["TRY"] >= 500
        assert s["total_expenses"]["EUR"] >= 100
        assert s["total_startup"]["EUR"] >= 300
        assert s["total_investments"]["EUR"] >= 5000
        # Available cash EUR = 5000 + 1000 - 100(Company exp) - 300(Company startup) = 5600
        assert s["available_cash"]["EUR"] >= 5600 - 0.01
        assert "counts" in s

    def test_monthly_report(self, user_a, seeded):
        r = requests.get(f"{API}/reports/monthly", headers=user_a["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        months = [row["month"] for row in rows]
        assert "2026-01" in months

    def test_category_report(self, user_a, seeded):
        r = requests.get(f"{API}/reports/category", headers=user_a["headers"])
        assert r.status_code == 200
        j = r.json()
        assert "expenses" in j and "startup" in j
        cats = {e["category"] for e in j["expenses"]}
        assert "Office" in cats or "Software" in cats


# ---------------- CSV Export ----------------
class TestExport:
    @pytest.mark.parametrize("kind", ["all", "income", "expenses", "startup", "investments"])
    def test_csv_export(self, user_a, kind):
        r = requests.get(f"{API}/export/csv", params={"kind": kind}, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".csv" in cd
