# ⚙️ JIT Kitchen Controller — Backend

> FastAPI-powered backend for autonomous AI-driven supply chain management. Handles database ops, AI recipe parsing, POS webhook ingestion, and async background tasks via Celery + LangGraph agents on Swiggy Instamart.

---

## 🛠 Tech Stack

| Tool | Purpose |
|------|---------|
| **FastAPI** | REST API framework |
| **PostgreSQL + SQLAlchemy + Alembic** | Database & migrations |
| **Celery + Redis** | Async task queue |
| **LangGraph + Google Gemini** (`gemini-2.5-pro`) | AI agent |
| **Swiggy MCP** (Streamable HTTP) | Supply chain integration |

---

## ✅ Prerequisites

- **Python 3.10+**
- **PostgreSQL** — running locally or hosted
- **Redis** — required as the Celery message broker

---

## 🚀 Setup Guide

### 1. Create & Activate a Virtual Environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

---

### 3. Configure Environment Variables

Create a `.env` file inside the `backend/` folder:

```env
# Database & Redis
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/<database_name>
REDIS_URL=redis://localhost:6379/0

# Google Gemini (AI Parser & LangGraph Agent)
GOOGLE_API_KEY=your_gemini_api_key_here

# Swiggy MCP OAuth
SWIGGY_CLIENT_ID=mock_client_id
SWIGGY_CLIENT_SECRET=mock_secret
SWIGGY_REDIRECT_URI=http://localhost:3000/auth/callback
```

> ⚠️ **Never commit `.env` to version control.**

---

### 4. Run Database Migrations

Initialize the PostgreSQL schema (Restaurants, Transactions, Inventory, Recipes):

```bash
alembic upgrade head
```

---

## ▶️ Running the Services

This is an **event-driven architecture** — you need **3 terminals running simultaneously**. Make sure your virtual environment is activated in the backend terminals.

---

### Terminal 1 — Message Broker (Redis)

```bash
redis-server
```

---

### Terminal 2 — FastAPI Server

```bash
uvicorn app.main:app --reload
```

---

### Terminal 3 — Celery Worker (AI Agent)

```bash
celery -A app.celery_app worker --loglevel=info
```

> 🪟 **Windows users:** Add the `--pool=solo` flag:
> ```bash
> celery -A app.celery_app worker --loglevel=info --pool=solo
> ```

---

## 🧪 End-to-End Testing

Simulate a live POS order to trigger the full automated restock pipeline:

**Step 1** — Open `test_order.py`

**Step 2** — Update the `RESTAURANT_ID` variable with the UUID shown on your frontend dashboard

**Step 3** — Run the script:

```bash
python test_order.py
```

**What happens next:**
1. Webhook fires → inventory is deducted
2. Celery picks up the task
3. LangGraph AI Agent checks stock levels
4. Agent autonomously checks out low-stock items on Swiggy Instamart 🛒

---

## 🗂 Database Schema Overview

| Table | Description |
|-------|-------------|
| `Restaurants` | Registered kitchen profiles |
| `Inventory` | Live stock levels & thresholds |
| `Recipes` | Bill of Materials (BOM) per dish |
| `Transactions` | POS order history & audit log |