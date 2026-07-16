"""Iteration 2 - Tests for new features: search, filters, PDF export, PUT endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://eba-expense-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _uemail(p="new"):
    return f"TEST_{p}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def user():
    email = _uemail("newfeat")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "NF"})
    assert r.status_code == 200
    d = r.json()
    return {"email": email, "headers": {"Authorization": f"Bearer {d['access_token']}"}}


@pytest.fixture(scope="module")
def seeded_income(user):
    h = user["headers"]
    items = [
        {"date": "2026-01-15", "client_name": "Acme Ltd", "service_description": "Consulting", "invoice_number": "INV-001", "amount": 1500, "currency": "EUR", "status": "paid"},
        {"date": "2026-01-05", "client_name": "Beta Co", "service_description": "Advisory", "invoice_number": "INV-002", "amount": 800, "currency": "TRY", "status": "pending"},
        {"date": "2025-12-20", "client_name": "Gamma Inc", "service_description": "Training", "invoice_number": "INV-003", "amount": 500, "currency": "GBP", "status": "paid"},
    ]
    ids = []
    for p in items:
        r = requests.post(f"{API}/income", json=p, headers=h)
        assert r.status_code == 200
        ids.append(r.json()["id"])
    yield ids
    for iid in ids:
        requests.delete(f"{API}/income/{iid}", headers=h)


@pytest.fixture(scope="module")
def seeded_expenses(user):
    h = user["headers"]
    items = [
        {"date": "2026-01-14", "category": "Software", "vendor": "Adobe", "description": "Photoshop", "amount": 50, "currency": "EUR", "paid_by": "Company"},
        {"date": "2026-01-08", "category": "Office", "vendor": "IKEA", "description": "Desk chair", "amount": 200, "currency": "TRY", "paid_by": "Personal"},
        {"date": "2025-12-11", "category": "Travel", "vendor": "British Airways", "description": "London flight", "amount": 300, "currency": "GBP", "paid_by": "Company"},
    ]
    ids = []
    for p in items:
        r = requests.post(f"{API}/expenses", json=p, headers=h)
        assert r.status_code == 200
        ids.append(r.json()["id"])
    yield ids
    for iid in ids:
        requests.delete(f"{API}/expenses/{iid}", headers=h)


# ---------------- Income filters/search ----------------
class TestIncomeSearchFilter:
    def test_search_by_client(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"q": "acme"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert all("acme" in i["client_name"].lower() or "acme" in (i.get("service_description") or "").lower() or "acme" in (i.get("invoice_number") or "").lower() for i in rows)

    def test_search_by_invoice(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"q": "INV-002"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert any(i.get("invoice_number") == "INV-002" for i in rows)

    def test_search_case_insensitive(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"q": "TRAINING"}, headers=user["headers"])
        assert r.status_code == 200
        assert any("training" in i["service_description"].lower() for i in r.json())

    def test_filter_status_paid(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"status": "paid"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2
        assert all(i["status"] == "paid" for i in rows)

    def test_filter_status_pending(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"status": "pending"}, headers=user["headers"])
        assert r.status_code == 200
        assert all(i["status"] == "pending" for i in r.json())

    def test_filter_currency_eur(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"currency": "EUR"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert all(i["currency"] == "EUR" for i in rows)
        assert len(rows) >= 1

    def test_filter_date_range(self, user, seeded_income):
        r = requests.get(f"{API}/income", params={"date_from": "2026-01-01", "date_to": "2026-01-31"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert all("2026-01" in i["date"] for i in rows)
        assert len(rows) >= 2


# ---------------- Expense filters/search ----------------
class TestExpenseSearchFilter:
    def test_search_vendor(self, user, seeded_expenses):
        r = requests.get(f"{API}/expenses", params={"q": "adobe"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert any("adobe" in e["vendor"].lower() for e in rows)

    def test_search_description(self, user, seeded_expenses):
        r = requests.get(f"{API}/expenses", params={"q": "flight"}, headers=user["headers"])
        assert r.status_code == 200
        assert any("flight" in e["description"].lower() for e in r.json())

    def test_filter_currency(self, user, seeded_expenses):
        r = requests.get(f"{API}/expenses", params={"currency": "GBP"}, headers=user["headers"])
        assert r.status_code == 200
        assert all(e["currency"] == "GBP" for e in r.json())

    def test_filter_category(self, user, seeded_expenses):
        r = requests.get(f"{API}/expenses", params={"category": "Software"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert all(e["category"] == "Software" for e in rows)
        assert len(rows) >= 1

    def test_filter_date_range(self, user, seeded_expenses):
        r = requests.get(f"{API}/expenses", params={"date_from": "2025-12-01", "date_to": "2025-12-31"}, headers=user["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert all("2025-12" in e["date"] for e in rows)


# ---------------- PUT endpoints for edit-in-place ----------------
class TestUpdateEndpoints:
    def test_update_income(self, user):
        p = {"date": "2026-01-01", "client_name": "OrigCo", "service_description": "S", "amount": 100, "currency": "EUR", "status": "pending"}
        r = requests.post(f"{API}/income", json=p, headers=user["headers"])
        assert r.status_code == 200
        iid = r.json()["id"]
        p2 = {**p, "client_name": "UpdatedCo", "amount": 250, "status": "paid"}
        r = requests.put(f"{API}/income/{iid}", json=p2, headers=user["headers"])
        assert r.status_code == 200
        j = r.json()
        assert j["client_name"] == "UpdatedCo"
        assert j["amount"] == 250
        assert j["status"] == "paid"
        # verify GET reflects
        r = requests.get(f"{API}/income", headers=user["headers"])
        got = next(i for i in r.json() if i["id"] == iid)
        assert got["client_name"] == "UpdatedCo"
        requests.delete(f"{API}/income/{iid}", headers=user["headers"])

    def test_update_expense(self, user):
        p = {"date": "2026-01-01", "category": "Office", "vendor": "V1", "description": "d", "amount": 10, "currency": "EUR", "paid_by": "Company"}
        r = requests.post(f"{API}/expenses", json=p, headers=user["headers"])
        assert r.status_code == 200
        eid = r.json()["id"]
        p2 = {**p, "vendor": "V2", "amount": 42}
        r = requests.put(f"{API}/expenses/{eid}", json=p2, headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["vendor"] == "V2"
        assert r.json()["amount"] == 42
        requests.delete(f"{API}/expenses/{eid}", headers=user["headers"])

    def test_update_startup(self, user):
        p = {"date": "2025-12-01", "category": "Lawyer", "description": "fees", "amount": 100, "currency": "EUR", "paid_by": "Personal"}
        r = requests.post(f"{API}/startup-costs", json=p, headers=user["headers"])
        assert r.status_code == 200
        sid = r.json()["id"]
        p2 = {**p, "amount": 250}
        r = requests.put(f"{API}/startup-costs/{sid}", json=p2, headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["amount"] == 250
        requests.delete(f"{API}/startup-costs/{sid}", headers=user["headers"])

    def test_update_nonexistent_returns_404(self, user):
        p = {"date": "2026-01-01", "client_name": "X", "service_description": "Y", "amount": 1, "currency": "EUR", "status": "paid"}
        r = requests.put(f"{API}/income/nonexistent-id-xyz", json=p, headers=user["headers"])
        assert r.status_code == 404


# ---------------- PDF export ----------------
class TestPDFExport:
    def test_pdf_export_content_type_and_disposition(self, user, seeded_income, seeded_expenses):
        r = requests.get(f"{API}/export/pdf", headers=user["headers"])
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".pdf" in cd.lower()
        # PDF magic bytes
        assert r.content[:4] == b"%PDF", f"Not a PDF, got: {r.content[:20]}"
        assert len(r.content) > 1000  # non-trivial size

    def test_pdf_requires_auth(self):
        r = requests.get(f"{API}/export/pdf")
        assert r.status_code in (401, 403)
