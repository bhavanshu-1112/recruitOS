# RecruiterOS 🚀

> **AI-Powered Recruiting Operations Platform**
> Built for the Microsoft Build AI Hackathon — *"AI at Work: Productivity & Teamwork Reimagined"*

[![CI](https://github.com/your-org/recruiter-os/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/recruiter-os/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎯 What is RecruiterOS?

RecruiterOS transforms job searching from a manual, tedious process into an **autonomous AI-powered workflow**. A user inputs their job search goal (e.g., *"Backend SDE2 roles in Gurugram, Node.js stack, 15-25 LPA"*), and the system autonomously:

1. **🔍 Discovers** relevant job listings via intelligent web scraping
2. **📊 Scores** resume-JD fit using AI-powered semantic analysis
3. **✨ Optimizes** resumes for ATS (Applicant Tracking Systems)
4. **📝 Drafts** personalized outreach messages and cover letters

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │ Landing  │ │Dashboard │ │Job Search │ │Resume & Outreach │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
│         TailwindCSS │ Framer Motion │ React Query              │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API (JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Express)                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Middleware Layer                     │    │
│  │  Helmet │ CORS │ Rate Limiter │ Auth │ Validator │ Logger│   │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Controller Layer                      │    │
│  │  Auth │ Jobs │ Resume │ Analysis │ Optimize │ Outreach  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Service Layer                       │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ Job         │  │ Resume       │  │ Scoring       │  │    │
│  │  │ Discovery   │  │ Parser       │  │ Engine        │  │    │
│  │  │ (Playwright)│  │              │  │ (Gemini AI)   │  │    │
│  │  └─────────────┘  └──────────────┘  └───────────────┘  │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ ATS         │  │ Outreach     │  │ Embedding     │  │    │
│  │  │ Optimizer   │  │ Generator    │  │ Service       │  │    │
│  │  │ (Gemini AI) │  │ (Gemini AI)  │  │ (pgvector)    │  │    │
│  │  └─────────────┘  └──────────────┘  └───────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────┬───────────────────┬─────────────────┬───────────────┘
            │                   │                 │
            ▼                   ▼                 ▼
  ┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐
  │   PostgreSQL     │ │    Redis     │ │   Google Cloud       │
  │   + pgvector     │ │    Cache     │ │   Storage (GCS)      │
  │                  │ │              │ │                      │
  │  • Users         │ │ • JD cache   │ │  • Resumes (PDF)     │
  │  • Jobs          │ │ • Session    │ │  • Generated docs    │
  │  • Resumes       │ │ • Rate limit │ │                      │
  │  • Analyses      │ │              │ │                      │
  │  • Embeddings    │ │              │ │                      │
  └──────────────────┘ └──────────────┘ └──────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI framework |
| **Styling** | TailwindCSS + Framer Motion | Design system + animations |
| **Bundler** | Vite | Fast dev server & optimized builds |
| **Backend** | Node.js + Express + TypeScript | REST API server |
| **Database** | PostgreSQL 16 + pgvector | Relational data + vector embeddings |
| **Cache** | Redis 7 | JD caching, sessions, rate limiting |
| **AI** | Google Gemini API | Scoring, optimization, generation |
| **Auth** | Google OAuth 2.0 + Passport.js | Authentication |
| **Storage** | Google Cloud Storage | Resume & document storage |
| **Scraping** | Playwright | Job listing discovery |
| **Deployment** | Google Cloud Run | Serverless container hosting |
| **CI/CD** | GitHub Actions | Automated testing & deployment |
| **Monorepo** | npm Workspaces + Turborepo | Build orchestration |

---

## 📁 Project Structure

```
recuiterOS/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── config/           # External service configurations
│   │   ├── controllers/      # HTTP request handlers
│   │   ├── services/         # Business logic layer
│   │   ├── models/           # Database models & queries
│   │   ├── routes/           # Express route definitions
│   │   ├── middleware/       # Auth, validation, rate limiting
│   │   ├── utils/            # Shared utilities
│   │   ├── types/            # TypeScript type definitions
│   │   ├── db/               # Migrations & seed data
│   │   ├── app.ts            # Express app setup
│   │   └── server.ts         # Server entry point
│   └── tests/                # Unit, integration & e2e tests
│
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route-level pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── context/          # React context providers
│   │   ├── services/         # API client layer
│   │   ├── utils/            # Frontend utilities
│   │   ├── types/            # Frontend type definitions
│   │   └── styles/           # Global CSS + TailwindCSS
│   └── index.html
│
├── docker-compose.yml        # Local dev environment
├── .env.example              # Required environment variables
├── .eslintrc.json            # Shared ESLint config
├── .prettierrc               # Shared Prettier config
└── package.json              # Root workspace config
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** & **Docker Compose** (for PostgreSQL & Redis)
- **Google Cloud** account (for OAuth, Gemini API, GCS)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/recruiter-os.git
cd recruiter-os
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and secrets
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL (with pgvector) and Redis
docker-compose up -d postgres redis
```

### 4. Run Database Migrations

```bash
npm run db:migrate --workspace=backend
```

### 5. Start Development Servers

```bash
# Start both backend (port 8000) and frontend (port 5173)
npm run dev

# Or start individually:
npm run dev:backend
npm run dev:frontend
```

### 6. Open in Browser

Navigate to [http://localhost:5173](http://localhost:5173)

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Backend tests with coverage
npm run test:backend

# End-to-end tests
npm run test:e2e --workspace=backend

# Linting
npm run lint

# Format check
npm run format:check
```

---

## 🔑 Google Services Setup

### Gemini API
1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Set `GEMINI_API_KEY` in `.env`

### Google OAuth 2.0
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID
3. Add `http://localhost:8000/api/auth/google/callback` as authorized redirect URI
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

### Google Cloud Storage
1. Create a GCS bucket in your Google Cloud project
2. Create a service account with Storage Object Admin permissions
3. Download the JSON key and set `GOOGLE_APPLICATION_CREDENTIALS` path in `.env`

### Google Cloud Run (Deployment)
1. Install [gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. Deploy via GitHub Actions (see `.github/workflows/deploy.yml`) or manually:
```bash
gcloud run deploy recruiter-os-api --source ./backend
gcloud run deploy recruiter-os-ui --source ./frontend
```

---

## 🛡️ Security

- **Helmet.js** — HTTP security headers
- **CORS** — Configured allowed origins
- **Rate Limiting** — express-rate-limit on all API endpoints
- **Input Sanitization** — express-validator on all inputs
- **No Secrets in Code** — All credentials via environment variables
- **JWT** — Stateless authentication tokens
- **HTTPS** — Enforced in production (Cloud Run)

---

## ♿ Accessibility

- WCAG 2.1 AA compliance on all UI components
- Semantic HTML5 elements
- ARIA labels and roles
- Keyboard navigation support
- Skip-to-content links
- Focus management
- Color contrast ratios ≥ 4.5:1

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ for the <strong>Microsoft Build AI Hackathon 2026</strong>
</p>
