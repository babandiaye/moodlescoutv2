# MoodleScout v2

Plateforme d'audit pédagogique des cours Moodle pour l'Université Numérique Cheikh Hamidou Kane (UN-CHK / DITSI).

Refonte de MoodleScout v1 (Python FastAPI + React) en monolithe **Next.js 16 + worker BullMQ**, avec authentification **Keycloak SSO**, persistance **PostgreSQL**, file **Redis / BullMQ** et scoring **Ollama** (gemma3:12b auto-hébergé) ou **Anthropic Claude**.

---

## Sommaire

- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Déploiement pas-à-pas](#déploiement-pas-à-pas)
  - [1. Cloner le dépôt](#1-cloner-le-dépôt)
  - [2. Installer les dépendances](#2-installer-les-dépendances)
  - [3. Base PostgreSQL dédiée](#3-base-postgresql-dédiée)
  - [4. Redis avec mot de passe](#4-redis-avec-mot-de-passe)
  - [5. Client OIDC Keycloak](#5-client-oidc-keycloak)
  - [6. Fichier `.env.local`](#6-fichier-envlocal)
  - [7. Appliquer les migrations Prisma](#7-appliquer-les-migrations-prisma)
  - [8. Build production](#8-build-production)
  - [9. Services systemd (web + worker + timer)](#9-services-systemd-web--worker--timer)
  - [10. Reverse proxy nginx + TLS](#10-reverse-proxy-nginx--tls)
  - [11. Premier login + promotion admin](#11-premier-login--promotion-admin)
  - [12. Vérifier que tout tourne](#12-vérifier-que-tout-tourne)
- [Architecture](#architecture)
- [Sécurité](#sécurité)
- [Opérations courantes](#opérations-courantes)
- [Dépannage](#dépannage)
- [Scripts pnpm](#scripts-pnpm)
- [Licence](#licence)

---

## Stack technique

- **Next.js 16** (App Router, Server Components, Server Actions) · **TypeScript** · **React 19**
- **Prisma 7** + **PostgreSQL 14+** via `@prisma/adapter-pg`
- **BullMQ 5** + **Redis 6+** — file d'audits asynchrones + pub/sub SSE
- **NextAuth 5** + **Keycloak** OIDC
- **Pino** logs structurés avec redaction automatique des secrets
- **AES-256-GCM** chiffrement au repos des tokens Moodle et clés LLM (`ENCRYPTION_KEY`)
- **Server-Sent Events** (SSE via Redis pub/sub) pour suivi temps réel
- **ExcelJS** + **PDFKit** pour exports XLSX/PDF
- **Cheerio** pour parsing HTML côté worker

---

## Prérequis

Sur la machine cible (Debian/Ubuntu 22+ recommandé) :

| Composant | Version | Notes |
|---|---|---|
| **Node.js** | 20+ | LTS recommandé |
| **pnpm** | 10+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| **PostgreSQL** | 14+ | Base dédiée, pas partagée |
| **Redis** | 6+ | Doit avoir un mot de passe (requirepass) |
| **nginx** | 1.20+ | Reverse proxy TLS + SSE |
| **Keycloak** | 22+ | Realm + client OIDC configurable |
| **ImageMagick** | (optionnel) | Régénération favicons — `apt install imagemagick` |
| **Ollama** ou clé Anthropic | — | Au moins un des deux pour le scoring LLM |

Accès :
- Un utilisateur système (habituellement `root` ou `www-data`) qui lira `.env.local` et lancera les 2 processus Node.
- Un enregistrement DNS pointant vers ton serveur (`moodlescout.unchk.sn`).
- Un certificat TLS valide pour ce domaine (Let's Encrypt ou wildcard).

---

## Déploiement pas-à-pas

### 1. Cloner le dépôt

```bash
sudo mkdir -p /var/www/html
cd /var/www/html
sudo git clone git@github.com:babandiaye/moodlescoutv2.git
sudo chown -R $USER:$USER moodlescoutv2
cd moodlescoutv2
git checkout DEV        # ou main, selon ta cible
```

### 2. Installer les dépendances

```bash
# Une seule fois si pas déjà fait :
corepack enable
corepack prepare pnpm@latest --activate

# Installation avec build des extensions natives (Prisma, sharp, esbuild)
pnpm install
```

Le hook `pnpm.onlyBuiltDependencies` du `package.json` autorise explicitement la compilation de `@prisma/client`, `esbuild`, `sharp`, etc. La 1re install prend ~2-3 min.

### 3. Base PostgreSQL dédiée

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE moodlescoutv2 WITH LOGIN PASSWORD 'CHOISIS_UN_MDP_FORT';
CREATE DATABASE moodlescoutv2 OWNER moodlescoutv2;
\c moodlescoutv2
GRANT ALL ON SCHEMA public TO moodlescoutv2;
SQL
```

**Vérifier** que Postgres écoute bien sur `127.0.0.1:5432` (par défaut sur Debian/Ubuntu). Sinon éditer `/etc/postgresql/*/main/postgresql.conf` puis `sudo systemctl restart postgresql`.

⚠️ **Ne jamais** faire pointer `--shadow-database-url` de Prisma sur la vraie base — Prisma la reset (`DROP + CREATE`) pour valider une migration. Incident réel documenté sur un autre projet UN-CHK le 2026-07-08.

### 4. Redis avec mot de passe

`/etc/redis/redis.conf` (Debian) — décommenter/ajouter :

```conf
requirepass CHOISIS_UN_MDP_REDIS
maxmemory 512mb
maxmemory-policy allkeys-lru
```

Puis :

```bash
sudo systemctl restart redis
redis-cli -a CHOISIS_UN_MDP_REDIS ping   # → PONG
```

MoodleScout utilise la **DB 2** de Redis (`redis://:PWD@127.0.0.1:6379/2`) — la DB 0 reste libre pour d'autres services partagés.

### 5. Client OIDC Keycloak

Dans ton Keycloak, realm dédié (ex: `unchk`) :

1. **Créer un client** :
   - Client ID : `moodlescoutv2`
   - Access Type : **Confidential**
   - Standard flow : **On**
   - Root URL : `https://moodlescout.unchk.sn`
   - Valid redirect URIs : `https://moodlescout.unchk.sn/api/auth/callback/keycloak`
   - Web origins : `https://moodlescout.unchk.sn`

2. **Récupérer le secret** dans l'onglet `Credentials` du client → sera `KEYCLOAK_CLIENT_SECRET`.

3. **Mapper les attributs custom** dans le token :
   - `preferred_username` (par défaut)
   - `direction` — attribut custom LDAP/BD que tu veux utiliser pour promotion admin (voir `ADMIN_DIRECTION`)
   - `fullName` — nom complet (`${firstName} ${lastName}` typiquement)

4. **Provider config** : noter `KEYCLOAK_ISSUER = https://senid.unchk.sn/realms/UNCHK`

### 6. Fichier `.env.local`

```bash
cp .env.example .env.local
chmod 600 .env.local          # lecture seulement par l'user qui lance systemd
```

**Générer les secrets** :

```bash
# AUTH_SECRET (32 octets base64, pour signer les JWT NextAuth)
openssl rand -base64 32

# ENCRYPTION_KEY (32 octets hex, pour chiffrer tokens/clés en BD)
openssl rand -hex 32
```

⚠️ **Si `ENCRYPTION_KEY` change plus tard, tous les tokens Moodle et clés LLM déjà stockés deviennent illisibles**. Sauvegarde-la ailleurs (coffre secrets).

**Remplir** `.env.local` (extrait) :

```bash
NEXTAUTH_URL=https://moodlescout.unchk.sn
AUTH_URL=https://moodlescout.unchk.sn
AUTH_TRUST_HOST=true
AUTH_SECRET=<sortie openssl rand -base64 32>

DATABASE_URL=postgresql://moodlescoutv2:MDP_PG@127.0.0.1:5432/moodlescoutv2
REDIS_URL=redis://:MDP_REDIS@127.0.0.1:6379/2

KEYCLOAK_ISSUER=https://senid.unchk.sn/realms/UNCHK
KEYCLOAK_CLIENT_ID=moodlescoutv2
KEYCLOAK_CLIENT_SECRET=<secret onglet Credentials>

# Direction Keycloak dont les membres reçoivent automatiquement le rôle admin
# à leur premier login (les autres = auditeur par défaut).
ADMIN_DIRECTION=DITSI

ENCRYPTION_KEY=<sortie openssl rand -hex 32>

# LLM par défaut (une seule instance à la fois — les autres se déclarent dans /configuration)
OLLAMA_DEFAULT_URL=https://fromager.unchk.sn
OLLAMA_API_KEY=<bearer si présent, sinon vide>
OLLAMA_DEFAULT_MODEL=gemma3:12b

# Concurrence (voir section Opérations)
BULLMQ_CONCURRENCY=3
AUDIT_INTRA_JOB_CONCURRENCY=2
LLM_MAX_CONCURRENT=1

LOG_LEVEL=info
```

### 7. Appliquer les migrations Prisma

```bash
set -a; source .env.local; set +a
pnpm prisma migrate deploy
```

`migrate deploy` applique les migrations SQL sans jamais toucher au shadow database — c'est le mode sûr pour la prod. Le schéma est ensuite verrouillé sur les fichiers dans `prisma/migrations/`.

Régénérer le client :

```bash
pnpm prisma generate
```

### 8. Build production

```bash
pnpm build
```

Compile Next.js en mode standalone. Nécessite ~2 Go de RAM libre. La sortie va dans `.next/`.

### 9. Services systemd (web + worker + timer)

Copier ces 3 unités dans `/etc/systemd/system/` :

**`/etc/systemd/system/moodlescoutv2.service`** — appli Next.js (port 3000)

```ini
[Unit]
Description=MoodleScout v2 (Next.js)
After=network.target postgresql.service redis.service

[Service]
User=root
Group=root
WorkingDirectory=/var/www/html/moodlescoutv2
EnvironmentFile=/var/www/html/moodlescoutv2/.env.local
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=3
LimitNOFILE=50000
StandardOutput=append:/var/log/moodlescoutv2_output.log
StandardError=append:/var/log/moodlescoutv2_error.log

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/moodlescoutv2-worker.service`** — worker BullMQ

```ini
[Unit]
Description=MoodleScout v2 Worker (BullMQ)
After=network.target redis.service postgresql.service

[Service]
User=root
Group=root
WorkingDirectory=/var/www/html/moodlescoutv2
EnvironmentFile=/var/www/html/moodlescoutv2/.env.local
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pnpm worker
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=3
LimitNOFILE=50000
StandardOutput=append:/var/log/moodlescoutv2-worker_output.log
StandardError=append:/var/log/moodlescoutv2-worker_error.log

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/moodlescoutv2-refresh-users.service`** — refresh cache utilisateurs

```ini
[Unit]
Description=MoodleScout v2 — Rafraîchit nb_users des plateformes
After=network.target postgresql.service redis.service

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/var/www/html/moodlescoutv2
EnvironmentFile=/var/www/html/moodlescoutv2/.env.local
Environment="NODE_ENV=production"
TimeoutStartSec=1800
ExecStart=/usr/bin/env npx tsx /var/www/html/moodlescoutv2/scripts/refresh-platform-users.ts
StandardOutput=append:/var/log/moodlescoutv2-refresh-users.log
StandardError=append:/var/log/moodlescoutv2-refresh-users.log
```

**`/etc/systemd/system/moodlescoutv2-refresh-users.timer`** — trigger nocturne 3h

```ini
[Unit]
Description=Timer nocturne pour rafraîchir nb_users des plateformes MoodleScout
Requires=moodlescoutv2-refresh-users.service

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
Unit=moodlescoutv2-refresh-users.service

[Install]
WantedBy=timers.target
```

Activation :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moodlescoutv2 moodlescoutv2-worker moodlescoutv2-refresh-users.timer
sudo systemctl status moodlescoutv2 moodlescoutv2-worker
```

### 10. Reverse proxy nginx + TLS

**`/etc/nginx/sites-available/moodlescoutv2.conf`** :

```nginx
server {
    listen 80;
    server_name moodlescout.unchk.sn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name moodlescout.unchk.sn;

    ssl_certificate     /etc/nginx/ssl/unchk.sn_cert.pem;
    ssl_certificate_key /etc/nginx/ssl/star_unchk.sn.key;

    # ─── TLS hardening (Mozilla intermediate) ───────────
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:MS2SSL:10m;

    # ─── En-têtes de sécurité ───────────────────────────
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "SAMEORIGIN" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;

    server_tokens off;
    client_max_body_size 50M;

    # ─── SSE : suivi temps réel des audits ──────────────
    # DOIT être avant location /api/ pour être matché en priorité
    location ~ ^/api/audits/[^/]+/stream$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection        '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        chunked_transfer_encoding on;
    }

    # ─── API (exports, admin) ───────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # ─── Pages Next.js ──────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Activer :

```bash
sudo ln -s /etc/nginx/sites-available/moodlescoutv2.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 11. Premier login + promotion admin

1. Naviguer sur `https://moodlescout.unchk.sn` → redirection Keycloak
2. Se connecter avec un compte dont l'attribut `direction` = valeur de `ADMIN_DIRECTION` (`DITSI` par défaut) → **rôle admin auto-appliqué**
3. Les autres users se connectant reçoivent `role=auditeur` par défaut. Un admin peut promouvoir dans `/users` (modal Détails → dropdown Rôle).

⚠️ Si aucun compte Keycloak n'a `direction=DITSI`, tu peux promouvoir manuellement :

```bash
set -a; source /var/www/html/moodlescoutv2/.env.local; set +a
psql "$DATABASE_URL" -c "UPDATE users SET role='admin' WHERE email='ton@email.tld';"
```

### 12. Vérifier que tout tourne

```bash
sudo systemctl status moodlescoutv2 moodlescoutv2-worker
sudo systemctl list-timers | grep moodlescout

# HTTP direct : doit renvoyer 200 (page login)
curl -sI https://moodlescout.unchk.sn/login

# Logs live
sudo journalctl -u moodlescoutv2 -f
sudo journalctl -u moodlescoutv2-worker -f

# BullMQ jobs en attente
redis-cli -a "$REDIS_PW" -n 2 llen bull:audit-jobs:waiting
```

Sur `/configuration/plateformes`, ajouter une plateforme Moodle (URL + token WS) → cliquer **Tester** → doit répondre en 200 ms. Ensuite lancer un audit test sur 1-2 cours.

---

## Architecture

```
            ┌─────────────────┐         ┌──────────────┐
   user →   │  Next.js 16     │ ←────→  │  PostgreSQL  │
            │  (web + API)    │         └──────────────┘
            └────────┬────────┘
                     │ enqueue via BullMQ
                     ▼
            ┌─────────────────┐         ┌──────────────┐
            │     Redis       │ ←────→  │   Worker     │
            │  (queue + SSE)  │         │  (audit job) │
            └─────────────────┘         └──────┬───────┘
                                               │
                              axios/cheerio    │  Moodle WS REST
                                               ▼
                                        ┌──────────────┐
                                        │   Moodle     │
                                        └──────────────┘
                                               │
                                       LLM (Ollama / Anthropic)
```

- **Web** : Next.js sert l'UI + les routes API. Pont SSO Keycloak.
- **Worker** : process `tsx` séparé qui pull les jobs BullMQ et exécute `auditCourse` pour chaque cours d'une plateforme.
- **Redis** : double rôle — file BullMQ + canal pub/sub pour les événements SSE diffusés au navigateur.
- **PostgreSQL** : Users, MoodlePlatform (tokens chiffrés), LlmConfig (clés chiffrées), AuditSession, CourseAudit.

### Modèles Prisma clés

- `User` — synchronisé depuis Keycloak (`kcSub` unique). Rôles : `admin`, `auditeur`, `lecteur`.
- `MoodlePlatform` — URL + token Moodle WS chiffré + cache `nbUsers` (peuplé par cron nocturne).
- `LlmConfig` — provider (`ollama`/`anthropic`) + URL + clé chiffrée + modèle.
- `AuditSession` — un audit lancé (User + Platform + LlmConfig). Statuts : `pending`/`running`/`completed`/`failed`/`cancelled`.
- `CourseAudit` — résultat par cours (JSON parsable, score, durée, erreur).

---

## Sécurité

- **Chiffrement au repos** : tokens Moodle et clés LLM en AES-256-GCM avec `ENCRYPTION_KEY`. Champs `tokenEnc` / `apiKeyEnc` **jamais** ré-exposés via API (exclus des `select` Prisma).
- **Redaction pino** : `*.token`, `*.tokenEnc`, `*.apiKey`, `*.apiKeyEnc`, `*.client_secret`, `*.password` sont masqués dans les logs.
- **Middleware** : vérifie authentification + `isActive` à chaque requête. Routes admin protégées par `requireAuth({ role: 'admin' })`.
- **Guard plateforme désactivée** : les audits et cours associés à une plateforme `isActive=false` sont invisibles aux non-admins (audits, `/me/courses`, `/audits/new`, `/audits/course`).
- **Cache LLM par empreinte** : SHA-256 du prompt (`provider + model + content + hash(images)`). Un ré-audit d'un cours inchangé = cache-hit ≈ 1 ms au lieu de ~45 s LLM. TTL 7 jours.

---

## Opérations courantes

### Refresh cache utilisateurs (déjà automatique via timer)

Manuel :

```bash
sudo systemctl start moodlescoutv2-refresh-users.service
sudo journalctl -u moodlescoutv2-refresh-users -f
```

Ou pour une plateforme unique : clic **Détails** dans `/configuration/plateformes` (déclenche `/api/moodle-platforms/[id]/stats` qui persiste en BD).

### Migration nouvelle version

```bash
git pull
pnpm install
pnpm prisma migrate deploy
pnpm build
sudo systemctl restart moodlescoutv2 moodlescoutv2-worker
```

### Régénérer le favicon depuis un nouveau logo SVG

```bash
cd public
convert -background transparent -density 600 <nouveau-logo>.svg -fuzz 8% -trim +repage /tmp/tight.png
convert /tmp/tight.png -crop 100%x62%+0+0 +repage -fuzz 8% -trim +repage /tmp/icon.png
convert /tmp/icon.png -background transparent -gravity center -resize 480x480 -extent 512x512 /tmp/src.png
convert /tmp/src.png -define icon:auto-resize=16,32,48,64,128,256 favicon.ico
convert /tmp/src.png -resize 180x180 apple-touch-icon.png
convert /tmp/src.png -resize 192x192 icon-192.png
convert /tmp/src.png -resize 512x512 icon-512.png
rm -f /tmp/tight.png /tmp/icon.png /tmp/src.png
```

Le crop `100%x62%+0+0` retire le texte du bas de la marque — ajuste le pourcentage selon ton logo.

### Rotation des logs

`/etc/logrotate.d/moodlescoutv2` :

```
/var/log/moodlescoutv2*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        systemctl kill --signal=USR1 moodlescoutv2 moodlescoutv2-worker
    endscript
}
```

### Réglage concurrence LLM

- `LLM_MAX_CONCURRENT=1` — Ollama mono-GPU (gemma3:12b tient à peine sur 1×24 Go VRAM)
- `LLM_MAX_CONCURRENT=5` — Anthropic Cloud (limite du tier)
- `AUDIT_INTRA_JOB_CONCURRENCY=2` — 2 cours par audit en parallèle (Moodle WS parallélisable, LLM sérialisé en aval par le sémaphore Redis)
- `BULLMQ_CONCURRENCY=3` — 3 audits simultanés au niveau worker

Bench observé sur P13 LSHE (57 cours) : **Claude 14 s/cours** vs **gemma3:12b 88 s/cours** en solo, batch effectif ~44 s/cours grâce à `intraConcurrency=2`.

---

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Login boucle sur Keycloak | `NEXTAUTH_URL` ≠ URL réelle du reverse proxy | Vérifier `AUTH_URL` + `NEXTAUTH_URL` alignés + `AUTH_TRUST_HOST=true` |
| `Erreur IA: connect ECONNREFUSED` | Ollama down, port bloqué, DNS pété | `curl <OLLAMA_URL>/api/tags` avec le Bearer |
| Audit reste bloqué en `running` | Worker crashé, session supprimée en cours | `journalctl -u moodlescoutv2-worker` + `redis-cli llen bull:audit-jobs:active` |
| `504 Gateway Timeout` sur `/api/moodle-platforms/[id]/stats` | Moodle très lent sur `core_user_get_users` (grosse plateforme) | Normal jusqu'à ~50 s, ensuite fallback enrolment se déclenche |
| `nb_users` toujours à `—` | Cron nocturne pas encore passé + jamais cliqué "Détails" | `sudo systemctl start moodlescoutv2-refresh-users.service` |
| `PrismaClientKnownRequestError P2003` | Contrainte FK violée (souvent : session supprimée pendant audit en cours) | Bénin — le worker skip avec un WARN |
| Favicon reste petit | Cache navigateur agressif | Ouvrir `/favicon.ico` en direct + Ctrl+Shift+R sur la page |

Logs à consulter :

```bash
sudo journalctl -u moodlescoutv2 -n 200 --no-pager
sudo tail -f /var/log/moodlescoutv2-worker_output.log
```

---

## Scripts pnpm

| Script | Effet |
|---|---|
| `dev` | Next.js en mode dev (port 3000) |
| `build` | Next.js build production |
| `start` | Next.js prod |
| `worker` | Worker BullMQ (tsx) |
| `worker:dev` | Worker avec hot-reload |
| `prisma:generate` | Régénère le client Prisma |
| `prisma:migrate` | Applique les migrations en dev (interactif, avec shadow DB) |
| `prisma:deploy` | Applique les migrations en prod (sûr, pas de shadow DB) |
| `backfill:scores` | Recalcule tous les `score_ia` / `score_struct` (utile après changement de formule hybride) |
| `lint` | ESLint |

Scripts one-shot dans `/scripts/` — à lancer avec `npx tsx scripts/<nom>.ts` après `set -a; source .env.local; set +a` :

- `refresh-platform-users.ts` — refresh manuel du cache `nb_users`
- `audit-platforms.ts` — audit CLI sans passer par la file BullMQ
- `probe-users.ts` / `trace-users-count.ts` — diagnostiquer un comptage users lent

---

## Licence

Projet interne UN-CHK / DITSI.
