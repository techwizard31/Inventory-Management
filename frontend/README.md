# 🍳 JIT Kitchen Controller — Frontend
 
> Real-time dashboard for restaurant owners to monitor financials, dictate AI-powered recipes, and autonomously manage their Swiggy Instamart supply chain.
 
---
 
## 🛠 Tech Stack
 
| Tool | Purpose |
|------|---------|
| **Next.js 16** (App Router) | Core framework |
| **Tailwind CSS** | Styling |
| **Lucide React** | Icons |
| **Fetch API** | Backend communication |
 
---
 
## ✅ Prerequisites
 
- **Node.js** v18 or higher
- **npm** (or yarn / pnpm)
- The **backend server** must be running at `http://127.0.0.1:8000`
---
 
## 🚀 Getting Started
 
### 1. Install Dependencies
 
```bash
cd frontend
npm install
```
 
### 2. Start the Dev Server
 
```bash
npm run dev
```
 
Then open **http://localhost:3000** in your browser.
 
---
 
## ✨ Features & How to Use Them
 
### 🔐 Secure Onboarding (OAuth 2.0)
Register a new kitchen from the home screen. You'll be redirected to the **Swiggy Partner Portal** to authenticate and grant AI access — no passwords are shared.
 
---
 
### 🎙 AI Recipe Dictation
Go to the **Inventory** tab and use the dictation box to speak or type a recipe in plain English:
 
```
"Paneer Tikka uses 200g paneer and 50g yogurt"
```
 
The backend AI parses this automatically and updates the **Bill of Materials (BOM)** in the database.
 
---
 
### ⚙️ Threshold Management
Click the **gear icon** next to any inventory item to configure:
- **Trigger Alert** level — when to raise a low-stock warning
- **Auto-Buy Quantity** — how much to reorder automatically
---
 
### 🔍 Instant Inventory Audits
Click **Run Audit** on the Dashboard to manually sweep your inventory. This triggers the background AI Agent to immediately restock any items that are running low.
 
---
 
## 📡 Backend Dependency
 
This frontend is stateless on its own — all data, AI logic, and Swiggy integration live in the FastAPI backend. Make sure it's running before you start the frontend.