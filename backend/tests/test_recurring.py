"""EBA Finance Tracker - Recurring transactions module tests (iteration 3)"""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://eba-expense-hub.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(prefix="rec"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def _register(prefix):
    email = _unique_email(prefix)
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "secret123", "name": f"User {prefix}"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "token": data["access_token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest.fixture(scope="module")
def user_a():
    return _register("reca")


@pytest.fixture(scope="module")
def user_b():
    return _register("recb")


# ---------------- CRUD ----------------
class TestRecurringCRUD:
    def test_create_future_rule_no_autopost(self, user_a):
        """Future next_run should NOT trigger auto-post immediately."""
        future = (date.today() + timedelta(days=15)).isoformat()
        payload = {
            "name": "Future Expense",
            "kind": "expense",
            "frequency": "monthly",
            "next_run": future,
            "active": True,
            "template": {
                "category": "Software",
                "vendor": "TestVendor",
                "description": "TEST monthly software",
                "amount": 20.0,
                "currency": "EUR",
                "paid_by": "Company",
            },
        }
        r = requests.post(f"{API}/recurring", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        rule = r.json()
        assert rule["name"] == "Future Expense"
        assert rule["kind"] == "expense"
        assert rule["frequency"] == "monthly"
        assert rule["active"] is True
        assert rule["posted_count"] == 0
        assert rule["next_run"] == future
        assert "id" in rule and "user_id" in rule
        # Verify no expense record was created
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        matches = [e for e in exp if e.get("recurring_id") == rule["id"]]
        assert len(matches) == 0
        # cleanup
        requests.delete(f"{API}/recurring/{rule['id']}", headers=user_a["headers"])

    def test_list_recurring(self, user_a):
        r = requests.get(f"{API}/recurring", headers=user_a["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_and_delete_rule(self, user_a):
        future = (date.today() + timedelta(days=10)).isoformat()
        create = requests.post(f"{API}/recurring", json={
            "name": "ToUpdate",
            "kind": "expense",
            "frequency": "monthly",
            "next_run": future,
            "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 10.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"])
        assert create.status_code == 200
        rid = create.json()["id"]

        upd = requests.put(f"{API}/recurring/{rid}", json={
            "name": "Updated",
            "kind": "expense",
            "frequency": "weekly",
            "next_run": future,
            "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 15.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"])
        assert upd.status_code == 200, upd.text
        assert upd.json()["name"] == "Updated"
        assert upd.json()["frequency"] == "weekly"
        assert upd.json()["template"]["amount"] == 15.0

        d = requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        assert d.status_code == 200
        # Verify gone
        listing = requests.get(f"{API}/recurring", headers=user_a["headers"]).json()
        assert all(x["id"] != rid for x in listing)

    def test_delete_nonexistent_returns_404(self, user_a):
        r = requests.delete(f"{API}/recurring/does-not-exist", headers=user_a["headers"])
        assert r.status_code == 404

    def test_requires_auth(self):
        r = requests.get(f"{API}/recurring")
        assert r.status_code in (401, 403)


# ---------------- Auto-post catch-up ----------------
class TestAutoPost:
    def test_past_monthly_catchup(self, user_a):
        """Rule with next_run 3 months ago (monthly) must produce ~3 expense records."""
        three_months_ago = (date.today() - timedelta(days=93)).isoformat()
        payload = {
            "name": "TEST_Notion_Catchup",
            "kind": "expense",
            "frequency": "monthly",
            "next_run": three_months_ago,
            "active": True,
            "template": {
                "category": "Software",
                "vendor": "Notion Labs",
                "description": "TEST catch-up",
                "amount": 12.0,
                "currency": "EUR",
                "paid_by": "Company",
            },
        }
        r = requests.post(f"{API}/recurring", json=payload, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        rule = r.json()
        rid = rule["id"]

        # Rule should have posted_count 3 or 4 (depends on day-of-month) and next_run in the future
        assert rule["posted_count"] >= 3, f"expected >=3 postings, got {rule['posted_count']}"
        assert rule["posted_count"] <= 5
        assert rule["next_run"] > date.today().isoformat(), "next_run must be advanced past today"

        # Verify expenses in collection (recurring_id NOT exposed in API response — see bug in report)
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        linked = [e for e in exp if e.get("vendor") == "Notion Labs" and e.get("description") == "TEST catch-up"]
        assert len(linked) == rule["posted_count"], f"linked={len(linked)} posted_count={rule['posted_count']}"
        for e in linked:
            assert e["amount"] == 12.0
            assert e["currency"] == "EUR"
            assert e["vendor"] == "Notion Labs"
            assert "date" in e
        # Dates ascend and first is the past next_run
        dates = sorted([e["date"] for e in linked])
        assert dates[0] == three_months_ago

        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        for e in linked:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])

    def test_weekly_income_catchup(self, user_a):
        """Weekly income rule: 3 weeks back → 3-4 postings in income collection."""
        weeks_ago = (date.today() - timedelta(days=21)).isoformat()
        payload = {
            "name": "TEST_WeeklyIncome",
            "kind": "income",
            "frequency": "weekly",
            "next_run": weeks_ago,
            "active": True,
            "template": {
                "client_name": "TEST Client",
                "service_description": "Weekly retainer",
                "amount": 100.0,
                "currency": "EUR",
                "status": "paid",
            },
        }
        r = requests.post(f"{API}/recurring", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        rule = r.json()
        rid = rule["id"]
        assert rule["posted_count"] >= 3
        income = requests.get(f"{API}/income", headers=user_a["headers"]).json()
        linked = [i for i in income if i.get("client_name") == "TEST Client" and i.get("service_description") == "Weekly retainer"]
        assert len(linked) == rule["posted_count"]
        for it in linked:
            assert it["amount"] == 100.0
            assert it["client_name"] == "TEST Client"
            assert it["status"] == "paid"
        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        for it in linked:
            requests.delete(f"{API}/income/{it['id']}", headers=user_a["headers"])

    def test_startup_catchup(self, user_a):
        """Startup kind auto-post writes to startup_costs collection."""
        past = (date.today() - timedelta(days=40)).isoformat()
        payload = {
            "name": "TEST_Startup",
            "kind": "startup",
            "frequency": "monthly",
            "next_run": past,
            "active": True,
            "template": {
                "category": "Accountant",
                "description": "TEST monthly retainer",
                "amount": 250.0,
                "currency": "EUR",
                "paid_by": "Company",
            },
        }
        r = requests.post(f"{API}/recurring", json=payload, headers=user_a["headers"])
        assert r.status_code == 200
        rule = r.json()
        rid = rule["id"]
        assert rule["posted_count"] >= 1
        startup = requests.get(f"{API}/startup-costs", headers=user_a["headers"]).json()
        linked = [s for s in startup if s.get("description") == "TEST monthly retainer"]
        assert len(linked) == rule["posted_count"]
        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        for s in linked:
            requests.delete(f"{API}/startup-costs/{s['id']}", headers=user_a["headers"])

    def test_process_endpoint_returns_posted_count(self, user_a):
        """POST /recurring/process manually processes due rules."""
        past = (date.today() - timedelta(days=8)).isoformat()
        rule = requests.post(f"{API}/recurring", json={
            "name": "TEST_Process",
            "kind": "expense",
            "frequency": "weekly",
            "next_run": past,
            "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 5.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"]).json()
        # After creation, it should already be posted. A second /process call posts 0.
        r = requests.post(f"{API}/recurring/process", headers=user_a["headers"])
        assert r.status_code == 200
        body = r.json()
        assert "posted" in body
        assert isinstance(body["posted"], int)
        # cleanup
        requests.delete(f"{API}/recurring/{rule['id']}", headers=user_a["headers"])
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        for e in [x for x in exp if x.get("recurring_id") == rule["id"]]:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])


# ---------------- Lazy auto-post via GET ----------------
class TestLazyAutoPost:
    def test_lazy_on_expenses_get(self, user_a):
        """Deactivate then reactivate & call GET /expenses — new postings should arrive."""
        past = (date.today() - timedelta(days=35)).isoformat()
        rule = requests.post(f"{API}/recurring", json={
            "name": "TEST_LazyExp",
            "kind": "expense",
            "frequency": "monthly",
            "next_run": past,
            "active": False,   # inactive → creation shouldn't post
            "template": {"category": "Software", "vendor": "Vend", "description": "TEST lazy",
                         "amount": 7.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"]).json()
        rid = rule["id"]
        assert rule["posted_count"] == 0
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        assert len([e for e in exp if e.get("recurring_id") == rid]) == 0

        # Activate; GET /expenses should trigger lazy processing
        upd = requests.put(f"{API}/recurring/{rid}", json={
            "name": rule["name"], "kind": "expense", "frequency": "monthly",
            "next_run": past, "active": True, "template": rule["template"],
        }, headers=user_a["headers"])
        assert upd.status_code == 200
        exp2 = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        linked = [e for e in exp2 if e.get("description") == "TEST lazy"]
        assert len(linked) >= 1, "Expected lazy auto-post on GET /expenses"

        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        for e in linked:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])

    def test_lazy_on_summary(self, user_a):
        past = (date.today() - timedelta(days=10)).isoformat()
        rule = requests.post(f"{API}/recurring", json={
            "name": "TEST_LazySummary",
            "kind": "expense", "frequency": "weekly",
            "next_run": (date.today() + timedelta(days=1)).isoformat(),  # future so no auto-post yet
            "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 3.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"]).json()
        rid = rule["id"]
        # Manually set next_run into the past by updating
        requests.put(f"{API}/recurring/{rid}", json={
            "name": rule["name"], "kind": "expense", "frequency": "weekly",
            "next_run": past, "active": True, "template": rule["template"],
        }, headers=user_a["headers"])
        # Trigger via /summary
        s = requests.get(f"{API}/summary", headers=user_a["headers"])
        assert s.status_code == 200
        # Verify posting happened
        rules = requests.get(f"{API}/recurring", headers=user_a["headers"]).json()
        this = next(r for r in rules if r["id"] == rid)
        assert this["posted_count"] >= 1
        assert this["next_run"] > date.today().isoformat()
        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        for e in [x for x in exp if x.get("recurring_id") == rid]:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])


# ---------------- User isolation ----------------
class TestUserScoping:
    def test_rules_are_user_scoped(self, user_a, user_b):
        past = (date.today() - timedelta(days=15)).isoformat()
        rule = requests.post(f"{API}/recurring", json={
            "name": "TEST_A_only",
            "kind": "expense", "frequency": "monthly",
            "next_run": past, "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 1.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"]).json()
        rid = rule["id"]

        # User B must NOT see the rule
        b_rules = requests.get(f"{API}/recurring", headers=user_b["headers"]).json()
        assert all(r["id"] != rid for r in b_rules), "User B should not see A's rule"

        # User B trying to delete A's rule → 404
        d = requests.delete(f"{API}/recurring/{rid}", headers=user_b["headers"])
        assert d.status_code == 404

        # User B's expenses must NOT include A's auto-posted expense
        b_exp = requests.get(f"{API}/expenses", headers=user_b["headers"]).json()
        assert all(e.get("recurring_id") != rid for e in b_exp)

        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        a_exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        for e in [x for x in a_exp if x.get("recurring_id") == rid]:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])


# ---------------- Deactivation ----------------
class TestDeactivation:
    def test_deactivate_stops_future_posting(self, user_a):
        past = (date.today() - timedelta(days=40)).isoformat()
        rule = requests.post(f"{API}/recurring", json={
            "name": "TEST_Deactivate",
            "kind": "expense", "frequency": "monthly",
            "next_run": past, "active": True,
            "template": {"category": "Software", "vendor": "V", "description": "d",
                         "amount": 2.0, "currency": "EUR", "paid_by": "Company"},
        }, headers=user_a["headers"]).json()
        rid = rule["id"]
        initial_count = rule["posted_count"]
        assert initial_count >= 1

        # Deactivate
        requests.put(f"{API}/recurring/{rid}", json={
            "name": rule["name"], "kind": "expense", "frequency": "monthly",
            "next_run": past,  # even set back to past
            "active": False, "template": rule["template"],
        }, headers=user_a["headers"])

        # Trigger process
        p = requests.post(f"{API}/recurring/process", headers=user_a["headers"]).json()
        assert p["posted"] == 0, "Deactivated rule must not auto-post"

        # cleanup
        requests.delete(f"{API}/recurring/{rid}", headers=user_a["headers"])
        exp = requests.get(f"{API}/expenses", headers=user_a["headers"]).json()
        for e in [x for x in exp if x.get("recurring_id") == rid]:
            requests.delete(f"{API}/expenses/{e['id']}", headers=user_a["headers"])
