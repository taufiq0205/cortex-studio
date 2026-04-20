You are a senior full-stack AI engineer tasked with building a production-quality portfolio project.

Your goal is to generate a complete, working, and cleanly structured full-stack GenAI application called:

# 🧠 Cortex Studio

---

## 🎯 Project Objective

Build a full-stack AI platform that demonstrates:

* LLM integration (local model via LM Studio)
* Full-stack architecture (Next.js + FastAPI)
* Structured outputs (JSON schema enforcement)
* Lightweight agent-style workflows (tool routing)
* Clean, production-style code organization

This project is intended for a **portfolio targeting Full-Stack AI Engineer roles**.

---

## 🧱 Tech Stack

### Frontend

* Next.js (App Router)
* TypeScript
* Tailwind CSS (minimal styling only)

### Backend

* Python
* FastAPI

### AI Model

* LM Studio running locally
* Model: Gemma (or any available local model)
* Endpoint: http://localhost:1234/v1/chat/completions
* Use OpenAI-compatible API format

---

## ⚙️ Core Features (MVP)

### 1. Chat Interface

* Textarea input
* Send button
* Display response
* Maintain minimal chat state

---

### 2. Mode Toggle

User can select:

* "Chat Mode"
* "JSON Mode"

Behavior:

* Chat Mode → normal response
* JSON Mode → structured output ONLY

JSON schema:
{
"summary": "...",
"keywords": ["..."]
}

---

### 3. Backend API

Create a FastAPI server with:

#### POST /chat

Request:
{
"message": string,
"mode": "chat" | "json" (optional)
}

Behavior:

* If mode = chat → send message directly to LLM
* If mode = json → wrap prompt to enforce structured JSON output
* If mode not provided → use agent routing logic

---

### 4. Agent-like Tool Routing (IMPORTANT)

Implement simple rule-based routing:

* If message contains "summarize" → use JSON mode
* Otherwise → use Chat mode

This simulates a lightweight agent system.

---

### 5. LLM Integration

Use Python `requests` to call LM Studio API:

* model: "gemma"
* messages: OpenAI format
* temperature: 0.7

---

### 6. Prompt Engineering

For JSON mode, enforce:

"Return ONLY valid JSON. No explanations."

Ensure output is machine-readable.

---

## 🎨 UI Requirements

Simple UI with:

* Title: "Cortex Studio"
* Text input (textarea)
* Mode dropdown
* Send button
* Response display using `<pre>`
* Optional: basic loading state

No complex design needed.

---

## 🏗️ Project Structure

Generate a clean repo:

cortex-studio/
│
├── backend/
│   └── main.py
│
├── frontend/
│   ├── app/
│   └── components/
│
├── docs/
│   └── architecture.md
│
├── README.md
├── .gitignore

---

## 📄 README Requirements (VERY IMPORTANT)

Generate a professional README that includes:

* Project title + description
* Features
* Architecture diagram (text-based)
* Example input/output
* Setup instructions (backend + frontend + LM Studio)
* API documentation
* Design philosophy
* Future improvements
* Author section

Tone: professional, portfolio-ready

---

## 📡 API Example

Include this example:

POST /chat

{
"message": "Summarize AI in e-commerce",
"mode": "json"
}

---

## ⚠️ Constraints

* DO NOT use LangChain or heavy frameworks
* DO NOT over-engineer agent systems
* Keep implementation minimal but clean
* Focus on clarity and functionality
* Ensure code is runnable

---

## 🎯 Expected Output

You must generate:

1. Full backend code (FastAPI)
2. Full frontend code (Next.js page)
3. Folder structure
4. README.md (high quality)
5. Setup instructions
6. Example usage

---

## 💡 Intent of This Project

This project is meant to demonstrate:

* Full-stack AI engineering capability
* Understanding of LLM systems
* Ability to build real AI products
* Clean system design without over-reliance on frameworks

---

Now generate the complete implementation.