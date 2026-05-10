# JIT Kitchen Controller

> **An autonomous, AI-driven supply chain and inventory management system for restaurants.**
> Instead of chefs manually checking stock and placing orders, this system watches your Point-of-Sale in real time, calculates ingredient burn rates, and dispatches an AI agent to physically restock missing items on Swiggy Instamart — without human intervention.

---

## Table of Contents

- [The Problem We're Solving](#the-problem-were-solving)
- [System Architecture](#system-architecture)
- [The Core Data Flow](#the-core-data-flow)
- [Engineering Decisions & Why](#engineering-decisions--why)
  - [Next.js + FastAPI — Decoupled Frontend/Backend](#1-nextjs--fastapi--decoupled-frontenbackend)
  - [PostgreSQL — The Source of Truth](#2-postgresql--the-source-of-truth)
  - [Redis + Celery — Event-Driven Decoupling](#3-redis--celery--event-driven-decoupling)
  - [LangGraph + Google Gemini — The Brain](#4-langgraph--google-gemini--the-brain)
  - [Swiggy MCP via Streamable HTTP — The Hands](#5-swiggy-mcp-via-streamable-http--the-hands)
- [Robustness & Fault Tolerance](#robustness--fault-tolerance)
- [Repository Structure](#repository-structure)
- [Further Reading](#further-reading)

---

## The Problem We're Solving

Restaurant kitchens operate on thin margins with unpredictable demand. The traditional supply chain loop — chef notices low stock → chef places order → supplier delivers (maybe on time) — is slow, error-prone, and entirely dependent on human attention during the most chaotic hours of service.

**JIT Kitchen Controller collapses this loop into seconds.**

The moment a dish is sold, the system deducts its exact ingredient quantities from the live physical inventory, compares those quantities against chef-configured thresholds, and — if a restock is warranted — autonomously purchases the missing ingredients without a single manual action.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                         │
│   Dashboard · Recipe Dictation · Threshold Config · Audit Trigger   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP / REST
┌──────────────────────────────▼──────────────────────────────────────┐
│                         BACKEND (FastAPI)                           │
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │ POS Webhook │    │  AI Recipe   │    │   Inventory Auditor   │  │
│  │  Ingestor   │    │   Parser     │    │   (Manual Trigger)    │  │
│  └──────┬──────┘    └──────┬───────┘    └──────────┬────────────┘  │
│         │                  │                       │               │
│         └──────────────────▼───────────────────────┘               │
│                            │                                        │
│                    ┌───────▼────────┐                               │
│                    │  PostgreSQL DB  │                               │
│                    │  · Inventory   │                               │
│                    │  · Recipes/BOM │                               │
│                    │  · Ledger      │                               │
│                    └───────┬────────┘                               │
│                            │  Low-stock event                       │
│                    ┌───────▼────────┐                               │
│                    │  Redis Queue   │                               │
│                    └───────┬────────┘                               │
└────────────────────────────┼────────────────────────────────────────┘
                             │ Celery task dispatch
┌────────────────────────────▼────────────────────────────────────────┐
│                      CELERY WORKER POOL                             │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              LangGraph ReAct Agent (Gemini 2.5 Pro)         │   │
│   │                                                             │   │
│   │   Authenticate → Search → Handle Edge Cases → Checkout      │   │
│   └────────────────────────────┬────────────────────────────────┘   │
│                                │ MCP / Streamable HTTP              │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                    SWIGGY INSTAMART (External)                      │
│              OAuth 2.0 (PKCE) · 13 MCP Tools · Live Checkout        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Core Data Flow

The entire lifecycle of a restocking event — from a customer placing an order to Swiggy confirming a purchase — follows six discrete, auditable stages.

---

### Stage 1 — Recipe Ingestion
**Chef dictates a recipe. AI maps ingredients to the database.**

A chef speaks or types a recipe in natural language (e.g., *"Paneer Tikka uses 200g paneer, 50g yogurt, and 10g spice mix"*). The FastAPI backend forwards this to the Google Gemini model, which parses it into a structured Bill of Materials (BOM). Each parsed ingredient is linked to its canonical POS Item ID and stored in the `recipes` table. This establishes the authoritative mapping: **one POS sale event → a known set of raw ingredient deductions.**

---

### Stage 2 — The Trigger
**A POS webhook arrives. The system knows what was sold.**

When a customer orders Paneer Tikka, the POS system fires a webhook to the FastAPI `/webhook/order` endpoint. The payload contains the POS Item ID and the quantity sold. FastAPI validates and acknowledges this event with a `200 OK` in milliseconds — the POS system never waits.

---

### Stage 3 — The Math
**Backend calculates burn rate and deducts physical stock.**

Using the BOM established in Stage 1, the system computes the total ingredient deduction for the order batch (e.g., 5 orders × 200g paneer = 1,000g deducted). These deductions are written to the `inventory` table inside a **database transaction**. If any deduction fails — due to a constraint violation or a race condition — the entire transaction is rolled back, preserving inventory integrity.

---

### Stage 4 — The Queue
**Stock falls below threshold. A restock task enters Redis.**

After each deduction, the system compares updated stock levels against the chef-configured **Trigger Alert** thresholds. If any ingredient breaches its threshold, a structured restock task — containing the restaurant ID, ingredient ID, and required quantity — is serialised and pushed to the **Redis message broker**. FastAPI's responsibility ends here. The main API thread is fully unblocked.

---

### Stage 5 — The Agent
**Celery picks up the task. The LangGraph agent takes over.**

A Celery worker dequeues the restock task and initialises a **LangGraph ReAct agent** powered by Google Gemini 2.5 Pro. The agent is equipped with 13 tools provided by Swiggy's MCP server (search, cart management, address resolution, checkout, etc.) and operates in a reasoning loop — thinking, acting, observing — until the purchase is complete.

The agent handles real-world edge cases autonomously:
- **Item out of stock** → searches for an equivalent substitute
- **Cart quantity limits** → splits into multiple checkout sessions
- **Address ambiguity** → resolves the restaurant's registered delivery address via MCP
- **Authentication expiry** → re-authenticates via the stored OAuth token before retrying

---

### Stage 6 — The Ledger
**Swiggy confirms. The order ID is written to PostgreSQL.**

On successful checkout, Swiggy's MCP returns a confirmed Order ID. The Celery worker writes this ID, along with the purchased quantities and total cost, to the `transactions` table in PostgreSQL. This table serves as the system's **immutable financial ledger** — every automated purchase is auditable, timestamped, and tied to the triggering inventory event.

---

## Engineering Decisions & Why

### 1. Next.js + FastAPI — Decoupled Frontend/Backend

The frontend and backend are completely independent services with a clean REST boundary between them. This is a deliberate choice over a monolithic or BFF (Backend for Frontend) pattern.

- **Next.js** handles the real-time dashboard, recipe dictation UI, and threshold configuration. Its App Router enables granular caching and streaming, keeping the dashboard responsive even when backend agents are running long tasks.
- **FastAPI** was chosen over Django/Flask for its **native async support**, automatic OpenAPI schema generation, and Pydantic-powered request validation. Async endpoints are essential here because the system must handle simultaneous POS webhooks from multiple restaurant locations without thread starvation.

The decoupled boundary also means the frontend can be replaced (e.g., with a mobile app) without touching any business logic.

---

### 2. PostgreSQL — The Source of Truth

PostgreSQL enforces the most important conceptual separation in this system: the distinction between **Logical Recipes** and **Physical Inventory**.

| Concept | Table | What It Stores |
|---|---|---|
| **Logical Recipe** | `recipes` | The BOM — what *should* be used per dish |
| **Physical Inventory** | `inventory` | What *actually* exists in the kitchen right now |
| **Financial Ledger** | `transactions` | Every Swiggy order ID, cost, and quantity confirmed |

This separation prevents a common failure mode: a recipe change (e.g., chef increases paneer to 250g) should not retroactively corrupt historical stock deduction records. By treating them as separate entities, historical audit trails remain accurate.

PostgreSQL's **ACID transaction guarantees** are also the reason we chose it over a NoSQL store. Inventory deductions must be atomic — partial writes during a system crash would result in phantom stock that doesn't physically exist.

---

### 3. Redis + Celery — Event-Driven Decoupling

This is the most critical architectural decision in the system.

**The core tension:** A POS webhook must receive a `200 OK` response in milliseconds or the POS system will retry, causing duplicate deductions. But the downstream AI agent takes 30–60 seconds to negotiate with Swiggy, search for products, and complete checkout.

**The solution:** Treat the webhook handler and the AI agent as entirely separate concerns, connected only by a message queue.

```
POS Webhook → FastAPI (200 OK in <100ms) → Redis Queue → Celery Worker → LangGraph Agent
     ↑                                                                          ↓
 Unblocked                                                            Works asynchronously
```

- **Redis** acts as the durable message broker. If the Celery worker crashes mid-task, the task remains in the queue and is retried — no restock event is silently dropped.
- **Celery** provides the worker pool, retry logic with exponential backoff, and task state visibility. A failed agent run (e.g., Swiggy API timeout) is retried automatically up to a configurable limit before being moved to a dead-letter queue for manual inspection.

Without this decoupling, a slow Swiggy API response would block FastAPI threads, causing the POS webhook endpoint to time out and trigger a storm of retried webhooks — a cascading failure that would corrupt inventory counts.

---

### 4. LangGraph + Google Gemini — The Brain

Swiggy's Instamart checkout is not a simple REST call. It involves a multi-step, stateful process: search for an item, evaluate results, add to cart, resolve delivery address, apply any available discounts, and confirm the order. Each step has conditional branches (item not found, cart limit reached, address not set).

**We could have hard-coded this logic as a state machine.** We chose not to, for two reasons:

1. **Brittleness:** Hard-coded API sequences break the moment Swiggy changes a parameter name, introduces a new required step, or returns an unexpected response format.
2. **Edge case explosion:** The number of conditional branches grows combinatorially. An AI agent handles them through reasoning, not enumeration.

**LangGraph** provides the structured ReAct (Reason + Act) execution loop. At each step, Gemini 2.5 Pro reasons about the current state, selects the appropriate MCP tool, observes the result, and decides the next action. The graph enforces a maximum step count to prevent infinite loops, and every tool call and observation is logged for post-hoc debugging.

**Google Gemini 2.5 Pro** was selected specifically for its **large context window** (necessary to hold the full conversation history + 13 tool definitions + inventory context in a single prompt) and its strong performance on structured tool-use benchmarks.

---

### 5. Swiggy MCP via Streamable HTTP — The Hands

Rather than reverse-engineering Swiggy's internal APIs (which would be brittle and terms-of-service-violating), this system integrates via the official **Swiggy Model Context Protocol (MCP)** — a standardised interface that exposes Swiggy's Instamart capabilities as callable tools.

- **OAuth 2.0 with PKCE** is used for the initial authorisation flow, ensuring the system never stores raw Swiggy credentials. The access token is scoped exclusively to Instamart purchasing operations.
- **Streamable HTTP** (as opposed to a standard request/response pattern) keeps a persistent connection open during the agent's multi-step checkout process, reducing connection overhead and enabling real-time observation of tool call results as they stream back.
- The MCP interface provides **13 discrete tools** — search, filter, cart operations, address resolution, payment, checkout — giving the LangGraph agent a rich, well-defined action space to operate within.

---

## Robustness & Fault Tolerance

The system is designed to fail gracefully at every stage. Below is a summary of the key failure modes and how they are handled.

| Failure Point | Failure Mode | Mitigation |
|---|---|---|
| **POS Webhook** | Duplicate webhook delivery | Idempotency key on each webhook payload; duplicate IDs are rejected before deduction |
| **Inventory Deduction** | Race condition (concurrent orders) | PostgreSQL row-level locking (`SELECT FOR UPDATE`) during deduction |
| **Inventory Deduction** | Partial write on crash | Full ACID transaction; rolled back entirely on any error |
| **Redis Queue** | Broker temporarily unavailable | FastAPI retries the push with exponential backoff; webhook still returns `200 OK` |
| **Celery Worker** | Worker crash mid-task | Task remains `PENDING` in Redis; automatically re-queued on worker restart |
| **LangGraph Agent** | Swiggy API timeout | Celery retry policy with exponential backoff (max 3 attempts) |
| **LangGraph Agent** | Item out of stock on Swiggy | Agent autonomously searches for substitutes before failing |
| **LangGraph Agent** | Infinite reasoning loop | Maximum step count enforced at the graph level; task fails cleanly |
| **Swiggy Checkout** | Order confirmation not received | Transaction is not written to ledger; task is retried; no phantom financial records |
| **Task Result Parsing** | Celery group unwrapping error | Agent results are unwrapped with explicit type-checking before ledger write |

---

## Repository Structure

```
jit-kitchen-controller/
│
├── frontend/               # Next.js 16 App Router application
│   ├── app/                # Route segments and page components
│   ├── components/         # Shared UI components
│   └── README.md           # Frontend setup & feature guide
│
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── main.py         # FastAPI entry point & route registration
│   │   ├── models.py       # SQLAlchemy ORM models
│   │   ├── schemas.py      # Pydantic request/response schemas
│   │   ├── celery_app.py   # Celery application configuration
│   │   ├── tasks.py        # Celery task definitions (agent dispatch)
│   │   └── agent/          # LangGraph agent & MCP tool definitions
│   ├── alembic/            # Database migration scripts
│   ├── test_order.py       # POS webhook simulation script
│   └── README.md           # Backend setup, services & testing guide
│
└── README.md               # ← You are here
```

---

## Further Reading

- **Frontend README** — `frontend/README.md` — UI features, Next.js setup, and dashboard walkthrough
- **Backend README** — `backend/README.md` — Service startup, environment configuration, and end-to-end test instructions
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) — ReAct agent architecture
- [Swiggy MCP Reference](https://developer.swiggy.com/mcp) — Tool definitions and OAuth 2.0 flow
- [Celery Documentation](https://docs.celeryq.dev/) — Task queue configuration and retry policies