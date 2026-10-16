# Watodo

Turn a WhatsApp group into a self-organising, AI-enriched Markdown knowledge base.

Watodo listens to a WhatsApp chat you nominate (typically a "note to self" group), classifies
everything you drop in it, enriches it with context pulled from the web, and writes the result
to disk as clean Markdown with YAML frontmatter. A React dashboard lets you browse, rate,
and triage the results.

Send yourself a link at midnight; wake up to a summarised, tagged, filed note.

## How it works

```
WhatsApp  ──▶  Classifier  ──▶  Enricher  ──▶  Markdown writer  ──▶  inbox/
(Baileys)      by content       per-source     YAML + body          + dashboard
               type            metadata
```

1. **Ingest** — connects to WhatsApp Web via [Baileys](https://github.com/WhiskeySockets/Baileys)
   and watches a single chat by name. Pair once by scanning a QR code.
2. **Classify** — each message is routed to a content type: `GITHUB_REPO`, `X_POST`,
   `WEB_ARTICLE`, `MEDIA`, or `TASK_NOTE`.
3. **Enrich** — GitHub repos get stars, language, and description via the REST API; articles
   are scraped and converted to Markdown; X posts get post metadata; voice notes are
   transcribed by Gemini; everything gets an AI summary and tags.
4. **Store** — one Markdown file per item in `inbox/items/`, plus category rollups and a
   master index. Frontmatter carries id, date, source, type, tags, status, and rating.
5. **Browse** — a React + Vite dashboard streams live activity over SSE and provides a
   knowledge-base browser with search, star ratings, and batch status/delete.

## Requirements

- Node.js 18+
- A WhatsApp account you can pair with WhatsApp Web
- A [Google Gemini API key](https://aistudio.google.com/apikey) (summarisation, tagging,
  voice transcription)
- Optionally a GitHub token, for higher REST API rate limits when enriching repo links

## Setup

```bash
npm install
```

```bash
cp .env.example .env
```

Then edit `.env` and set at minimum `GEMINI_API_KEY` and `TARGET_CHAT_NAME`.

```bash
npm run dev
```

Backend runs on `http://localhost:3001`, dashboard on `http://localhost:5173`. On first run
the dashboard shows a QR code — scan it from WhatsApp (Settings → Linked Devices) to pair.
The session is cached in `auth_info_baileys/`, so you only do this once.

## Configuration

Settings resolve in this order: `config.json` → environment variables → built-in defaults.

`config.json` is written by the app when you save settings in the dashboard UI. It holds your
API keys, so it is gitignored — copy `config.example.json` if you prefer to seed it by hand.

| Variable | Purpose | Default |
| --- | --- | --- |
| `TARGET_CHAT_NAME` | Chat to watch (exact or substring match) | `To Do` |
| `GEMINI_API_KEY` | Gemini key for summaries, tags, transcription | — |
| `GITHUB_TOKEN` | Optional, raises GitHub API rate limits | — |
| `OUTPUT_DIR` | Where Markdown is written | `./inbox` |
| `PORT` | Backend port | `3001` |
| `AUTH_DIR` | WhatsApp session cache | `./auth_info_baileys` |

## Importing an existing chat export

Already have months of history in the chat? Export it from WhatsApp
(Chat → Export chat → Without media, or with media for images) and either drop the `.zip`
into the dashboard importer, or run:

```bash
npm run parse:archive
```

## Docker Deployment

You can run Watodo entirely in Docker. Docker Compose handles building the multi-stage image, mounting persistent storage for your WhatsApp credentials and notes, and exposing the web dashboard.

### 1. Configure Environment
Ensure `.env` exists with your configuration (or copy from `.env.example`):
```bash
cp .env.example .env
```

### 2. Start with Docker Compose
```bash
# Start container in background
docker compose up -d

# Or using npm script
npm run docker:up
```

### 3. Pair WhatsApp
Open `http://localhost:3001` in your browser to view the QR code in the dashboard, or view the terminal QR code via logs:
```bash
docker compose logs -f
```
Scan the QR code from WhatsApp (**Settings** → **Linked Devices** → **Link a Device**).

### 4. Stopping the Container
```bash
docker compose down
```

> **Data Persistence**: WhatsApp auth credentials (`auth_info_baileys/`) and generated Markdown notes/media (`inbox/`) are mapped as host volumes and persist across container updates.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Backend + dashboard together |
| `npm run dev:server` | Backend only, with watch |
| `npm run dev:ui` | Dashboard only |
| `npm run build` | Compile TypeScript and build the dashboard |
| `npm start` | Run the compiled server |
| `npm run parse:archive` | Import a WhatsApp chat export from disk |
| `npm run docker:build` | Build the Docker container image |
| `npm run docker:up` | Launch Watodo in Docker in the background |
| `npm run docker:down` | Stop and remove Watodo Docker container |
| `npm run docker:logs` | Stream live Docker container logs |

## API

| Method | Route | Does |
| --- | --- | --- |
| `GET` | `/api/status` | Connection and pairing state |
| `GET` | `/api/qr` | Current pairing QR code |
| `POST` | `/api/whatsapp/reconnect` | Restart the listener. Body `{"reset": true}` also clears the stored session and issues a new pairing QR code |
| `GET` | `/api/stream` | SSE feed of live ingest events |
| `GET` | `/api/kb` | List knowledge base items |
| `GET` | `/api/kb/item/:slug` | Parsed single item |
| `GET` | `/api/kb/raw/:slug` | Raw Markdown |
| `DELETE` | `/api/kb/item/:slug` | Delete an item |
| `POST` | `/api/kb/batch-status` | Bulk status update |
| `POST` | `/api/kb/batch-delete` | Bulk delete |
| `POST` | `/api/import-zip` | Import a chat export |
| `GET` / `POST` | `/api/settings` | Read / persist settings |

## A note on your data

`inbox/` is gitignored on purpose. It contains your actual notes, media, and WhatsApp
identifiers — it is personal data, not sample data, and it should stay on your machine.
The same goes for `auth_info_baileys/`, which is a live credential for your WhatsApp
account. Never commit either.

## Stack

TypeScript, Express, Baileys, Google Generative AI, Octokit, Cheerio, Turndown, Zod on the
backend. React 18 and Vite on the front.

## Disclaimer

Watodo automates WhatsApp Web through an unofficial library. It is a personal-use tool;
use it with your own account and at your own risk.
