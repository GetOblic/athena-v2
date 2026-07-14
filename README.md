# Athena

> Institutional Intelligence Operating System

Athena transforms real-world market conversations into structured executive intelligence.

Rather than acting as a generic AI chatbot, Athena continuously analyzes discussions, identifies opportunities, synthesizes community intelligence, recommends production assets, and assists executives with evidence-based decision making.

---

# Current Status

**Version:** 1.0 RC1

Current capabilities include:

- Discussion Intelligence
- Community Intelligence
- Production Intelligence
- Executive Briefings
- Human Approval Workflow
- OpenRouter LLM integration
- Supabase persistence
- Executive Dashboard

---

# Vision

Athena is designed as an Institutional Intelligence Operating System.

Its objective is to transform fragmented online conversations into actionable business intelligence.

The long-term intelligence pipeline is:

```
Discussion
        │
        ▼
Discussion Analysis
        │
        ▼
Community Intelligence
        │
        ▼
Production Intelligence
        │
        ▼
Executive Briefings
        │
        ▼
Human Approval
        │
        ▼
Execution
```

Athena does not replace executive judgment.

Athena augments executive decision-making.

---

# Technology Stack

Frontend

- Next.js 16
- React
- TypeScript
- Tailwind CSS

Backend

- Supabase
- PostgreSQL

AI

- OpenRouter
- Structured JSON prompting
- Strategy Packs

Architecture

- Service Layer
- API Routes
- Institutional Intelligence Framework
- Executive-first UI

---

# Repository Structure

```
app/
    Dashboard
    Communities
    Discussions
    Opportunities
    Executive Briefings
    API Routes

components/
    Dashboard
    Discussions
    Communities
    Opportunities

services/
    AI Services
    Prompt Library
    Business Logic

architecture/
    Institutional Intelligence documentation

lib/
    OpenRouter
    Supabase
```

---

# Intelligence Pipeline

Current intelligence flow:

```
Discussion
        ↓
Discussion Analysis
        ↓
Community Intelligence
        ↓
Production Intelligence
        ↓
Executive Briefing
```

Every recommendation produced by Athena must be grounded in:

- Real market conversations
- Strategy Packs
- Institutional Memory
- Structured reasoning
- Human approval

---

# Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Production server:

```bash
npm run start
```

### V2 LLM routing (optional)

Role-based model selection is configured in `lib/llm/modelRouting.ts`. Optional overrides:

```bash
OPENROUTER_ANALYSIS_MODEL=google/gemini-2.5-flash
OPENROUTER_PREMIUM_MODEL=anthropic/claude-sonnet-4
OPENROUTER_ANALYSIS_REASONING_EFFORT=medium
OPENROUTER_PREMIUM_REASONING_EFFORT=high
```

Analysis stages (discussion analysis, briefings, community intelligence, deployment assets, etc.) use the analysis model. Strategic blueprint uses the premium model.

---

# Project Principles

Athena follows several core principles:

- Evidence before assumptions
- Structured intelligence over generic AI
- Human supervision
- Executive-first user experience
- Modular architecture
- Production-ready engineering

---

# Documentation

Project architecture is documented under:

```
architecture/
```

Current documents include:

- Knowledge & Intelligence Framework
- Cognitive Architecture
- Intelligence Profiles
- Market Intelligence
- Production Planning

---

# Roadmap

Near-term priorities:

- Executive Dashboard refinement
- Discussion Intelligence improvements
- Community Intelligence evolution
- Production Planning workflow
- Executive Briefings UX
- Deployment & monitoring
- Continuous institutional learning

---

# License

Private repository.

Copyright © Oblic Studio.

All rights reserved.
