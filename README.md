# Atib — PMM Intelligence Platform

> Sales calls go in, structured positioning intelligence comes out.

Atib is a multi-agent system that extracts PMM-grade positioning signals from sales call transcripts. Seven agents collaborate to turn raw conversations into actionable positioning intelligence — without the PMM ever losing control.

## Architecture

```
Transcript → Intake → SOAP (Claude Sonnet) → Signal Bank → Dashboard
                                                    ↓
                                              Positioning Engine
                                              (7 frameworks)
```

### Agent System

| Agent | Type | Owns |
|-------|------|------|
| Canonical Context | Deterministic | Company truth — positioning, pillars, ICP |
| Transcript Intake | Deterministic | Validation + persistence |
| SOAP | LLM (Sonnet) | Clinical intelligence extraction |
| Signal Bank | Deterministic | Signal lifecycle + tier state machine |
| Single-Call Dashboard | Deterministic | Per-call view (two framings) |
| Aggregate Dashboard | Hybrid | Drift score + cross-call analytics |
| Positioning Engine | LLM (Haiku) | 5C, Kindergarten, Need Gap, PoP/PoD, Laddering |

### Signal Lifecycle

```
Suggestion → Evolving → Concrete
     ↓            ↓
  Archived    Contested → Resolved
```

## Quick Start

```bash
# 1. Use Node 20+
nvm use 20

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local
# Fill in your DATABASE_URL and API keys

# 4. Push schema to database
npm run db:push

# 5. Start dev server
npm run dev
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `NEXTAUTH_URL` | Yes | Base URL for magic links |
| `NEXTAUTH_SECRET` | Yes | Session cookie signing |
| `ANTHROPIC_API_KEY` | For LLM | SOAP analysis (Sonnet) |
| `OPENAI_API_KEY` | For embeddings | Signal dedup |
| `RESEND_API_KEY` | For email | Magic link delivery |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Neon Postgres + Drizzle ORM + pgvector
- **Auth**: Cookie-based sessions with SHA-256 hashed tokens
- **LLM**: Claude Sonnet 4.6 (SOAP), Haiku (helpers), OpenAI (embeddings)
- **UI**: Tailwind CSS 4, glassmorphism dark theme

## Project Structure

```
src/
├── app/
│   ├── (admin)/       # PMM admin pages (sidebar layout)
│   ├── (rep)/         # Sales rep pages (top nav layout)
│   ├── api/           # 14 API endpoints
│   ├── login/         # Auth pages
│   └── setup/         # 5-step onboarding wizard
├── components/
│   └── layout/        # AdminSidebar, RepNav
└── lib/
    ├── agents/        # 7 agent modules
    ├── auth/          # Permissions + session management
    ├── db/            # Schema + client
    ├── llm/           # Anthropic + OpenAI + SOAP prompt
    └── utils/         # Types, constants, tier machine
```

## License

Proprietary — MUKHATIB
