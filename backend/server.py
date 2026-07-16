from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import io
import csv
import uuid
import logging
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors as rlcolors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get("JWT_SECRET", "eba-finance-tracker-super-secret-key-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 30

app = FastAPI(title="EBA Finance Tracker API", lifespan=None)  # lifespan set below
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ----------- Models -----------
Currency = Literal["EUR", "TRY", "GBP"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class IncomeIn(BaseModel):
    date: str  # ISO date YYYY-MM-DD
    client_name: str
    service_description: str
    invoice_number: Optional[str] = None
    amount: float
    currency: Currency
    status: Literal["paid", "pending"] = "paid"
    notes: Optional[str] = None


class Income(IncomeIn):
    id: str
    user_id: str
    created_at: str


class ExpenseIn(BaseModel):
    date: str
    category: Literal[
        "Office", "Software", "Internet", "Marketing", "Travel",
        "Education", "Equipment", "Professional Services", "Other"
    ]
    vendor: str
    description: str
    amount: float
    currency: Currency
    payment_method: Optional[str] = None
    paid_by: Literal["Personal", "Company", "Bahar", "Other"] = "Company"
    notes: Optional[str] = None


class Expense(ExpenseIn):
    id: str
    user_id: str
    created_at: str


class StartupCostIn(BaseModel):
    date: str
    category: Literal[
        "Company Registration", "Lawyer", "Accountant", "Government Fees",
        "Company Stamp", "Website", "Domain", "Logo", "Office Setup",
        "Initial Equipment", "Other"
    ]
    vendor: Optional[str] = None
    description: str
    amount: float
    currency: Currency
    paid_by: Literal["Personal", "Company", "Bahar", "Other"] = "Personal"
    notes: Optional[str] = None


class StartupCost(StartupCostIn):
    id: str
    user_id: str
    created_at: str


class InvestmentIn(BaseModel):
    date: str
    amount: float
    currency: Currency
    description: Optional[str] = None


class Investment(InvestmentIn):
    id: str
    user_id: str
    created_at: str


# ----------- Auth helpers -----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ----------- Auth routes -----------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: UserCreate):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": payload.email.lower(),
        "name": payload.name or payload.email.split("@")[0],
        "hashed_password": hash_password(payload.password),
        "created_at": _iso_now(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, doc["email"])
    return AuthResponse(
        access_token=token,
        user=UserPublic(id=user_id, email=doc["email"], name=doc["name"]),
    )


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["email"])
    return AuthResponse(
        access_token=token,
        user=UserPublic(id=user["id"], email=user["email"], name=user.get("name")),
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current=Depends(get_current_user)):
    return UserPublic(id=current["id"], email=current["email"], name=current.get("name"))


# ----------- Generic CRUD helpers -----------
async def _list(collection, user_id: str) -> list:
    items = await collection.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(2000)
    return items


async def _create(collection, user_id: str, data: dict) -> dict:
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "created_at": _iso_now(),
        **data,
    }
    await collection.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _delete(collection, user_id: str, item_id: str):
    res = await collection.delete_one({"id": item_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


async def _update(collection, user_id: str, item_id: str, data: dict) -> dict:
    res = await collection.find_one_and_update(
        {"id": item_id, "user_id": user_id},
        {"$set": data},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Item not found")
    return res


# ----------- Income routes -----------
def _apply_filters(query: dict, date_from: Optional[str], date_to: Optional[str], currency: Optional[str]):
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["date"] = rng
    if currency:
        query["currency"] = currency
    return query


@api_router.get("/income", response_model=List[Income])
async def list_income(
    current=Depends(get_current_user),
    q: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    query: dict = {"user_id": current["id"]}
    _apply_filters(query, date_from, date_to, currency)
    if status_filter in ("paid", "pending"):
        query["status"] = status_filter
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"client_name": rx}, {"service_description": rx}, {"invoice_number": rx}]
    return await db.income.find(query, {"_id": 0}).sort("date", -1).to_list(2000)


@api_router.post("/income", response_model=Income)
async def create_income(payload: IncomeIn, current=Depends(get_current_user)):
    return await _create(db.income, current["id"], payload.dict())


@api_router.put("/income/{item_id}", response_model=Income)
async def update_income(item_id: str, payload: IncomeIn, current=Depends(get_current_user)):
    return await _update(db.income, current["id"], item_id, payload.dict())


@api_router.delete("/income/{item_id}")
async def delete_income(item_id: str, current=Depends(get_current_user)):
    return await _delete(db.income, current["id"], item_id)


# ----------- Expense routes -----------
@api_router.get("/expenses", response_model=List[Expense])
async def list_expenses(
    current=Depends(get_current_user),
    q: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    query: dict = {"user_id": current["id"]}
    _apply_filters(query, date_from, date_to, currency)
    if category:
        query["category"] = category
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"vendor": rx}, {"description": rx}]
    return await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(2000)


@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseIn, current=Depends(get_current_user)):
    return await _create(db.expenses, current["id"], payload.dict())


@api_router.put("/expenses/{item_id}", response_model=Expense)
async def update_expense(item_id: str, payload: ExpenseIn, current=Depends(get_current_user)):
    return await _update(db.expenses, current["id"], item_id, payload.dict())


@api_router.delete("/expenses/{item_id}")
async def delete_expense(item_id: str, current=Depends(get_current_user)):
    return await _delete(db.expenses, current["id"], item_id)


# ----------- Startup costs routes -----------
@api_router.get("/startup-costs", response_model=List[StartupCost])
async def list_startup(current=Depends(get_current_user)):
    return await _list(db.startup_costs, current["id"])


@api_router.post("/startup-costs", response_model=StartupCost)
async def create_startup(payload: StartupCostIn, current=Depends(get_current_user)):
    return await _create(db.startup_costs, current["id"], payload.dict())


@api_router.put("/startup-costs/{item_id}", response_model=StartupCost)
async def update_startup(item_id: str, payload: StartupCostIn, current=Depends(get_current_user)):
    return await _update(db.startup_costs, current["id"], item_id, payload.dict())


@api_router.delete("/startup-costs/{item_id}")
async def delete_startup(item_id: str, current=Depends(get_current_user)):
    return await _delete(db.startup_costs, current["id"], item_id)


# ----------- Investment routes -----------
@api_router.get("/investments", response_model=List[Investment])
async def list_investments(current=Depends(get_current_user)):
    return await _list(db.investments, current["id"])


@api_router.post("/investments", response_model=Investment)
async def create_investment(payload: InvestmentIn, current=Depends(get_current_user)):
    return await _create(db.investments, current["id"], payload.dict())


@api_router.delete("/investments/{item_id}")
async def delete_investment(item_id: str, current=Depends(get_current_user)):
    return await _delete(db.investments, current["id"], item_id)


# ----------- Summary / Reports -----------
def _sum_by_currency(rows: list, filter_fn=None) -> dict:
    totals = {"EUR": 0.0, "TRY": 0.0, "GBP": 0.0}
    for r in rows:
        if filter_fn and not filter_fn(r):
            continue
        cur = r.get("currency", "EUR")
        if cur in totals:
            totals[cur] += float(r.get("amount", 0))
    return totals


@api_router.get("/summary")
async def summary(current=Depends(get_current_user)):
    uid = current["id"]
    income = await db.income.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    startup = await db.startup_costs.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    investments = await db.investments.find({"user_id": uid}, {"_id": 0}).to_list(5000)

    total_income = _sum_by_currency(income, lambda r: r.get("status") == "paid")
    pending_income = _sum_by_currency(income, lambda r: r.get("status") == "pending")
    total_expenses = _sum_by_currency(expenses)
    company_expenses = _sum_by_currency(expenses, lambda r: r.get("paid_by") == "Company")
    total_startup = _sum_by_currency(startup)
    total_investments = _sum_by_currency(investments)

    # Available cash = Investments + received income - company-paid expenses - company-paid startup
    company_startup = _sum_by_currency(startup, lambda r: r.get("paid_by") == "Company")
    net_cash = {}
    available_cash = {}
    for c in ["EUR", "TRY", "GBP"]:
        net_cash[c] = total_income[c] - total_expenses[c] - total_startup[c]
        available_cash[c] = (
            total_investments[c] + total_income[c]
            - company_expenses[c] - company_startup[c]
        )

    return {
        "total_income": total_income,
        "pending_income": pending_income,
        "total_expenses": total_expenses,
        "total_startup": total_startup,
        "total_investments": total_investments,
        "net_cash": net_cash,
        "available_cash": available_cash,
        "counts": {
            "income": len(income),
            "expenses": len(expenses),
            "startup": len(startup),
            "investments": len(investments),
        },
    }


@api_router.get("/reports/monthly")
async def monthly_report(current=Depends(get_current_user)):
    uid = current["id"]
    income = await db.income.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    startup = await db.startup_costs.find({"user_id": uid}, {"_id": 0}).to_list(5000)

    buckets: dict = {}

    def _key(iso_date: str) -> str:
        return (iso_date or "")[:7]  # YYYY-MM

    def _add(row, kind):
        k = _key(row.get("date", ""))
        if not k:
            return
        b = buckets.setdefault(k, {
            "month": k,
            "income": {"EUR": 0.0, "TRY": 0.0, "GBP": 0.0},
            "expenses": {"EUR": 0.0, "TRY": 0.0, "GBP": 0.0},
            "startup": {"EUR": 0.0, "TRY": 0.0, "GBP": 0.0},
        })
        cur = row.get("currency", "EUR")
        if cur in b[kind]:
            b[kind][cur] += float(row.get("amount", 0))

    for r in income:
        if r.get("status") == "paid":
            _add(r, "income")
    for r in expenses:
        _add(r, "expenses")
    for r in startup:
        _add(r, "startup")

    result = sorted(buckets.values(), key=lambda x: x["month"], reverse=True)
    return result


@api_router.get("/reports/category")
async def category_report(current=Depends(get_current_user)):
    uid = current["id"]
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    startup = await db.startup_costs.find({"user_id": uid}, {"_id": 0}).to_list(5000)

    def group(rows):
        out = {}
        for r in rows:
            cat = r.get("category", "Other")
            b = out.setdefault(cat, {"EUR": 0.0, "TRY": 0.0, "GBP": 0.0})
            cur = r.get("currency", "EUR")
            if cur in b:
                b[cur] += float(r.get("amount", 0))
        return [{"category": k, **v} for k, v in out.items()]

    return {"expenses": group(expenses), "startup": group(startup)}


# ----------- CSV Export -----------
@api_router.get("/export/csv")
async def export_csv(kind: str = "all", current=Depends(get_current_user)):
    uid = current["id"]
    output = io.StringIO()
    writer = csv.writer(output)

    async def write_section(title, cursor_coll, fields):
        writer.writerow([f"# {title}"])
        writer.writerow(fields)
        rows = await cursor_coll.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(5000)
        for r in rows:
            writer.writerow([r.get(f, "") for f in fields])
        writer.writerow([])

    if kind in ("all", "income"):
        await write_section("Income", db.income,
            ["date", "client_name", "service_description", "invoice_number", "amount", "currency", "status", "notes"])
    if kind in ("all", "expenses"):
        await write_section("Expenses", db.expenses,
            ["date", "category", "vendor", "description", "amount", "currency", "payment_method", "paid_by", "notes"])
    if kind in ("all", "startup"):
        await write_section("Startup Costs", db.startup_costs,
            ["date", "category", "vendor", "description", "amount", "currency", "paid_by", "notes"])
    if kind in ("all", "investments"):
        await write_section("Personal Investments", db.investments,
            ["date", "amount", "currency", "description"])

    output.seek(0)
    filename = f"eba-finance-{kind}-{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----------- PDF Summary Export -----------
def _fmt_money(amount: float, currency: str) -> str:
    sym = {"EUR": "€", "TRY": "₺", "GBP": "£"}.get(currency, "")
    return f"{sym}{amount:,.2f}"


@api_router.get("/export/pdf")
async def export_pdf(current=Depends(get_current_user)):
    uid = current["id"]
    income = await db.income.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(5000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(5000)
    startup = await db.startup_costs.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(5000)
    investments = await db.investments.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(5000)

    total_income = _sum_by_currency(income, lambda r: r.get("status") == "paid")
    total_expenses = _sum_by_currency(expenses)
    total_startup = _sum_by_currency(startup)
    total_investments = _sum_by_currency(investments)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    navy = rlcolors.HexColor("#003366")
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=navy, fontSize=20, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=navy, fontSize=13, spaceBefore=10, spaceAfter=6)
    meta = ParagraphStyle("meta", parent=styles["Normal"], textColor=rlcolors.grey, fontSize=9, spaceAfter=14)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10)

    story = []
    story.append(Paragraph("EBA Consulting Ltd.", h1))
    story.append(Paragraph(
        f"Financial Summary — generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", meta))
    story.append(Paragraph(f"Account: {current.get('name') or current['email']}", body))

    # Totals table
    story.append(Paragraph("Totals by Currency", h2))
    totals_rows = [["Metric", "EUR", "TRY", "GBP"]]
    for label, values in [
        ("Total Income (paid)", total_income),
        ("Operating Expenses", total_expenses),
        ("Startup Costs", total_startup),
        ("Personal Investment", total_investments),
    ]:
        totals_rows.append([label] + [_fmt_money(values[c], c) for c in ("EUR", "TRY", "GBP")])
    t = Table(totals_rows, colWidths=[65 * mm, 35 * mm, 35 * mm, 35 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), rlcolors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlcolors.HexColor("#F9FAFB"), rlcolors.white]),
        ("GRID", (0, 0), (-1, -1), 0.3, rlcolors.HexColor("#EAECF0")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    def _section_table(title: str, rows: list, headers: list, fields: list):
        story.append(Paragraph(title, h2))
        if not rows:
            story.append(Paragraph("<i>No entries.</i>", body))
            return
        data = [headers]
        for r in rows[:100]:
            data.append([str(r.get(f, "") or "-") for f in fields])
        tbl = Table(data, hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR", (0, 0), (-1, 0), rlcolors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlcolors.HexColor("#F9FAFB"), rlcolors.white]),
            ("GRID", (0, 0), (-1, -1), 0.3, rlcolors.HexColor("#EAECF0")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    _section_table(
        "Income", income,
        ["Date", "Client", "Service", "Amount", "Cur", "Status"],
        ["date", "client_name", "service_description", "amount", "currency", "status"],
    )
    _section_table(
        "Operating Expenses", expenses,
        ["Date", "Category", "Vendor", "Amount", "Cur", "Paid By"],
        ["date", "category", "vendor", "amount", "currency", "paid_by"],
    )
    _section_table(
        "Startup Costs", startup,
        ["Date", "Category", "Description", "Amount", "Cur", "Paid By"],
        ["date", "category", "description", "amount", "currency", "paid_by"],
    )
    _section_table(
        "Personal Investment", investments,
        ["Date", "Amount", "Cur", "Description"],
        ["date", "amount", "currency", "description"],
    )

    doc.build(story)
    buf.seek(0)
    filename = f"eba-finance-summary-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/")
async def root():
    return {"app": "EBA Finance Tracker", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def app_root():
    return {"app": "EBA Finance Tracker", "status": "ok"}

async def shutdown_db_client():
    client.close()
