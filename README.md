# MoodleScout v2

Plateforme d'audit pédagogique des cours Moodle pour l'Université Numérique Cheikh Hamidou Kane (UN-CHK / DITSI).

Refonte de [MoodleScout v1](https://github.com/) (Python FastAPI + React Vite) en monolithe Next.js + worker BullMQ, avec authentification Keycloak SSO et persistance PostgreSQL.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions) + **TypeScript**
- **Prisma 7** + **PostgreSQL** via adapter `@prisma/adapter-pg`
- **BullMQ** + **Redis** pour la file d'audits asynchrone
- **NextAuth 5** + **Keycloak** OIDC pour le SSO
- **Pino** pour les logs structurés (avec redaction des secrets)
- **AES-256-GCM** pour le chiffrement au repos des tokens Moodle et clés LLM
- **Server-Sent Events** (SSE via Redis pub/sub) pour le suivi temps réel
- **ExcelJS** + **PDFKit** pour les exports

## Prérequis

- Node.js 20+
- pnpm 10+
- PostgreSQL 14+
- Redis 6+
- Une instance Keycloak avec un realm + client OIDC configurés
- (Optionnel) Une instance Ollama avec Bearer auth ou une clé API Anthropic

## Installation

```bash
git clone git@github.com:babandiaye/moodlescoutv2.git
cd moodlescoutv2
pnpm install

# Variables d'environnement
cp .env.example .env.local
# Remplir AUTH_SECRET, ENCRYPTION_KEY, DATABASE_URL, REDIS_URL,
# KEYCLOAK_*, NEXTAUTH_URL, etc.

# Génération des clés sensibles :
#   openssl rand -base64 32   # → AUTH_SECRET
#   openssl rand -hex 32      # → ENCRYPTION_KEY (64 hex chars)

# Schéma BD
pnpm prisma migrate deploy

# Build production
pnpm build
```

## Démarrage

Deux processus à lancer (séparément en dev, en parallèle en prod via systemd) :

```bash
# Web (port 3000)
pnpm start

# Worker BullMQ (en parallèle, jamais sur le même CLI)
pnpm worker
```

En dev :

```bash
pnpm dev
pnpm worker:dev   # avec --watch
```

## Architecture

```
            ┌─────────────────┐         ┌──────────────┐
   user →   │  Next.js 16     │ ←────→  │  PostgreSQL  │
            │  (web + API)    │         └──────────────┘
            └────────┬────────┘
                     │ enqueue
                     ▼
            ┌─────────────────┐         ┌──────────────┐
            │     Redis       │  ←────→ │  Worker      │
            │  (BullMQ + SSE) │         │  (audit job) │
            └─────────────────┘         └──────┬───────┘
                                               │
                                  axios/cheerio │  Moodle WS REST
                                               ▼
                                        ┌──────────────┐
                                        │   Moodle     │
                                        └──────────────┘
                                               │
                                       LLM (Ollama / Anthropic)
```

- **Web** : Next.js sert l'UI + les routes API. Fait le pont SSO Keycloak.
- **Worker** : process tsx séparé qui pull les jobs BullMQ et exécute `auditCourse` pour chaque cours d'une plateforme.
- **Redis** : double rôle — file BullMQ + canal pub/sub pour les événements SSE diffusés au navigateur.
- **PostgreSQL** : persistance Users, MoodlePlatform (tokens chiffrés), LlmConfig (clés chiffrées), AuditSession, CourseAudit.

## Modèles métiers (Prisma)

- `User` — synchronisé depuis Keycloak (kcSub unique). Rôle `admin` (DITSI) ou `auditeur`.
- `MoodlePlatform` — URL + token Moodle WS chiffré.
- `LlmConfig` — provider (ollama/anthropic) + URL + clé chiffrée + modèle.
- `AuditSession` — lance un audit, lié à un User, une MoodlePlatform, une LlmConfig.
- `CourseAudit` — résultat par cours d'un audit (JSON parsable, score, durée, erreur).
- `AnalysisJob` — pointeur vers le job BullMQ.

## Sécurité

- Tokens Moodle et clés LLM stockés chiffrés AES-256-GCM avec `ENCRYPTION_KEY`.
- Jamais ré-exposés via les API (champs `tokenEnc` / `apiKeyEnc` non dans les selects).
- `pino` redact `*.token`, `*.tokenEnc`, `*.apiKey`, `*.apiKeyEnc`, `*.client_secret`, `*.password`.
- Middleware vérifie l'authentification + statut `isActive` à chaque requête.
- Routes admin protégées par `requireAuth({ role: 'admin' })`.

## Déploiement (référence UN-CHK)

- 2 units systemd :
  - `moodlescoutv2.service` → `pnpm start` (port 3000)
  - `moodlescoutv2-worker.service` → `pnpm worker`
  - Les deux utilisent `EnvironmentFile=/var/www/html/moodlescoutv2/.env.local`
- Reverse proxy nginx avec TLS wildcard, location dédiée pour `/api/audits/*/stream` (SSE, `proxy_buffering off`).
- Redis et Postgres en local, partagés avec d'autres services UN-CHK.

## Scripts pnpm

| Script | Effet |
|---|---|
| `dev` | Next.js en mode dev (port 3000) |
| `build` | Next.js build production |
| `start` | Next.js prod |
| `worker` | Worker BullMQ (tsx) |
| `worker:dev` | Worker avec hot-reload |
| `prisma:generate` | Régénère le client Prisma |
| `prisma:migrate` | Applique les migrations en dev |
| `prisma:deploy` | Applique les migrations en prod |
| `lint` | ESLint |

## Licence

Projet interne UN-CHK / DITSI.
