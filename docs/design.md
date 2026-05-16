# ChronoTranslate — Design Document

## Project Overview

ChronoTranslate is a crowdsourced translation management platform for **ChronoCore**, a Minecraft plugin. It allows community translators to submit and review translations via a web UI, with first-class MiniMessage preview, then exports finished translations back to the ChronoCore repository as JSON files.

---

## ChronoCore Translation System — Key Findings

Understanding how ChronoCore loads translations is essential for correct import/export behavior.

### File Layout

```
src/main/resources/lang/
├── en/                   ← source language
│   ├── ui.json
│   ├── chat.json
│   ├── player.json
│   ├── auction_house.json
│   ├── minecraft.json    ← RESERVED — auto-managed, never touched by translators
│   ├── dialogue/
│   │   ├── mester.json
│   │   └── tutorial.json
│   └── ... (29 files total)
├── de/                   ← German translation
│   └── ... (same file names)
└── en_gb/                ← British English
    └── minecraft.json    ← also reserved; en_gb has no translator-managed files yet
```

Each locale is a folder. Files within a locale folder are **categories** (the filename is the category slug). Subdirectories are also supported (e.g. `dialogue/mester.json`).

**`minecraft.json` is reserved** — it is auto-generated and must never appear in ChronoTranslate. It is excluded on import and never included in exports managed by this tool.

### Key Flattening (`LangEntry.kt`)

The plugin flattens nested JSON to dot-notation keys at load time:

| JSON structure | Resulting key |
|---|---|
| `{ "ui": { "back": { "title": "..." } } }` | `ui.back.title` |
| `{ "key": ["line1", "line2"] }` | `key.0`, `key.1` |
| `{ "outer": { "": "value" } }` | `outer` (empty-string key uses parent path) |

Array elements are **always strings**. The array length can differ between locales — the runtime handles this via `expandComponent`.

### Argument System

Two injection syntaxes coexist:

**`<name>` — MiniMessage tag resolver** (most common)
```
<auction_prefix>Your auction for <item> has expired.
<party_prefix><primary><owner></primary> transferred to <primary><player></primary>!
```

**`{{name}}` — direct string replacement** (used in command strings and non-MiniMessage contexts)
```
<click:run_command:'/party join {{name}}'>[ACCEPT]</click>
<gray><name>: {{value}}<statchar:{{stat}}>
```

Both may appear in the same string.

**Argument types** (from `Argument.kt`):

| Type | Description | Injection |
|---|---|---|
| `literal` | Plain string | `<name>` tag + `{{name}}` |
| `numeric` | Number (int or float) | `<name>` tag + `{{name}}` |
| `component` | Serialized Adventure Component | `<name>` tag only |
| `item` | ItemStack (base64) with optional hover | `<name>` tag only |
| `date_formatter` | Epoch seconds → formatted date | `<name>` tag only |
| `target` | Player UUID (special — sets locale target) | N/A (no tag) |

### Custom MiniMessage Tags

ChronoCore uses several custom tags that must be accounted for in the preview system:

| Tag | Role |
|---|---|
| `<primary>` | Theme primary color |
| `<secondary>` | Theme secondary color |
| `<highlight>` | Highlight color |
| `<text_color>` | Body text color |
| `<error_color>` | Error/red color |
| `<dark_color>` | Dim/dark color |
| `<papi:placeholder>` | PlaceholderAPI (server-side only) |
| `<progress:{{cur}}:{{max}}>` | Progress bar component |
| `<statchar:{{stat}}>` | Stat icon character |
| `<newline>` | Line break |
| `<auction_prefix>`, `<party_prefix>`, etc. | Module-specific prefixes |

For preview purposes, theme color tags and prefix tags must resolve to sensible mock values/colors.

---

## Core Features

### 1. Translation Key Model

- Keys stored in flat dot-notation internally (`ui.back.title`)
- Arrays stored as sibling keys with numeric suffix (`lore.0`, `lore.1`, ...)
- The **source language is `en`**
- Keys grouped in the UI by file (category) and hierarchical prefix chain
- The `""` empty-key rule handled on import/export
- `minecraft.json` excluded entirely from all operations

### 2. User & Permission System

- **Discord OAuth** only — no passwords
- Four roles: **Translator**, **Reviewer/Moderator**, **Admin**, **Superadmin**
- Roles managed in-app (Discord is identity only, not role source)
- Translators submit translations; Reviewers approve/reject; Admins manage projects, locales, and users (up to reviewer); Superadmin has full bypass and is the only one who can assign the admin role
- **Superadmin** is designated by `SUPERADMIN_DISCORD_ID` env var — automatically granted on login, at most one at a time, cannot be managed via API

### 3. Translation Editor

- Browse keys grouped by category → key hierarchy
- Source (`en`) value always shown alongside the editor
- Array entries shown as a vertically stacked list; translators may add/remove rows
- **MiniMessage preview** — first-class, inline below the editor, not a side panel
- **Argument mock values**: the system auto-detects `<name>` and `{{name}}` arguments from the source string; the translator fills in mock values once per session (or per key); preview re-renders live
- Per-key comment threads

### 4. MiniMessage Preview

The preview renders MiniMessage to styled HTML in the browser. It must handle:
- Standard named colors and hex colors (`<#aabbcc>`)
- Decorations: bold, italic, underline, strikethrough, obfuscated
- `<gradient:...>` and `<rainbow>`
- Custom theme tags (`<primary>`, `<secondary>`, etc.) resolved to configurable hex values per project
- `<click:...>` shown with a cursor icon but no actual action
- `<hover:...>` shown on mouse-over
- `<papi:x>` rendered as `{papi:x}` placeholder text in a distinct color
- `<progress:x:y>` rendered as a simple `▓▓▓░░` visual bar
- `{{name}}` arguments shown as highlighted placeholders when no mock value is set, substituted when one is provided

### 5. Export / GitHub Integration

- Export reconstructs the original multi-file structure: one JSON file per category per locale
- Arrays reconstructed from `key.0`, `key.1`, ... siblings
- Empty-key (`""`) entries reconstructed correctly
- `minecraft.json` never written
- GitHub App commits approved translations to `src/main/resources/lang/{locale}/{category}.json`
- Batch commits (debounced or manual trigger) to avoid noise
- Pre-validation before push

### 6. Project Management

- Multi-project support (ChronoCore is the first)
- Per-project: source locale, GitHub repo, theme color palette for preview
- Per-project language management: progress tracking (% approved keys per locale)

---

## Tech Stack

### Backend
- **Runtime**: Bun (latest stable)
- **Framework**: Fastify + TypeScript
- **Database**: PostgreSQL 16 via Bun's native SQL client (`Bun.sql`)
- **ORM**: Drizzle ORM (with `drizzle-orm/bun-sql` adapter)
- **Auth**: Discord OAuth 2.0 (manual flow, JWT sessions via `@fastify/jwt`)
- **GitHub**: Octokit (`@octokit/app`) for GitHub App integration

### Frontend
- **Framework**: React 19 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS v4
- **State**: Zustand (client state) + TanStack Query (server state)
- **MiniMessage renderer**: custom implementation (no suitable library exists)

### Repo Layout
```
ChronoTranslate/
├── packages/
│   ├── backend/          # Fastify API
│   └── frontend/         # React app
├── docs/
│   └── design.md
├── package.json          # Bun workspace root
└── .env.example
```

### Deployment
- Docker Compose for local dev (Postgres + both services)
- Target: Railway or Render (single repo, two services)

---

## Database Schema

```sql
users
  id             uuid PK
  discord_id     text UNIQUE
  username       text
  avatar_url     text
  role           enum(translator, reviewer, admin)
  created_at     timestamptz

projects
  id             uuid PK
  name           text
  github_owner   text
  github_repo    text
  github_app_installation_id  bigint
  source_locale  text DEFAULT 'en'
  theme_colors   jsonb          -- { primary: "#...", secondary: "#...", ... }
  created_by     uuid FK users
  created_at     timestamptz

locales
  id             uuid PK
  project_id     uuid FK projects
  locale_code    text            -- e.g. "de", "en_gb"
  display_name   text
  progress_pct   numeric(5,2)   -- updated via trigger / batch job

-- One entry per JSON file (category) within the source locale
translation_files
  id             uuid PK
  project_id     uuid FK projects
  file_path      text            -- e.g. "ui", "dialogue/mester" (no .json, no locale prefix)

-- Flat keys derived from the source language files
translation_keys
  id             uuid PK
  file_id        uuid FK translation_files
  key            text            -- dot-notation, e.g. "ui.back.title"
  source_value   text            -- value in source locale
  is_array_item  boolean         -- true if key ends in .N
  array_parent   text            -- parent key if is_array_item, else null
  detected_args  jsonb           -- [{ name: string, style: "tag"|"brace" }]

-- One row per key per non-source locale
translations
  id             uuid PK
  key_id         uuid FK translation_keys
  locale_id      uuid FK locales
  value          text
  status         enum(pending, approved, rejected)
  submitted_by   uuid FK users
  reviewed_by    uuid FK users NULL
  submitted_at   timestamptz
  reviewed_at    timestamptz NULL

comments
  id             uuid PK
  key_id         uuid FK translation_keys
  locale_id      uuid FK locales
  user_id        uuid FK users
  content        text
  created_at     timestamptz
```

---

## API Endpoints

### Auth
```
GET  /auth/discord             → redirect to Discord
GET  /auth/discord/callback    → exchange code, set JWT cookie
GET  /auth/me                  → current user
POST /auth/logout
```

### Projects
```
GET  /projects                          → list projects
POST /projects                          → create (admin)
GET  /projects/:id                      → project details + locales
```

### Keys & Translations
```
GET  /projects/:id/files                          → list translation files
GET  /projects/:id/files/:fileId/keys             → list keys with source + translation per locale
GET  /projects/:id/keys/:keyId                    → single key detail
POST /projects/:id/keys/:keyId/translations/:locale           → submit translation
POST /projects/:id/keys/:keyId/translations/:locale/approve   → approve (reviewer)
POST /projects/:id/keys/:keyId/translations/:locale/reject    → reject (reviewer)
```

### Comments
```
GET  /projects/:id/keys/:keyId/comments   → list comments
POST /projects/:id/keys/:keyId/comments   → add comment
```

### Admin
```
GET  /admin/users                    → list users
PATCH /admin/users/:id/role          → change role
POST /projects/:id/import            → import source files (seed keys)
POST /projects/:id/sync/:locale      → trigger GitHub commit
GET  /projects/:id/export/:locale    → download reconstructed JSON archive
```

---

## Roadmap

### ✅ Milestone 3 — Moderation & Admin Dashboard

- Reviewer dashboard: queue of all pending translations, filter by project/locale, approve/reject inline
- Approve/reject endpoints on backend with `reviewedBy`/`reviewedAt` tracking
- `progressPct` updated automatically on every approve, reject, or resubmit
- Admin dashboard: user management with role assignment, project management (create, add locale, import), progress bars per locale
- **Superadmin role**: single designated user via `SUPERADMIN_DISCORD_ID` env var; granted automatically on login; only they can assign admin role; cannot be modified via API; demoted automatically if Discord ID changes
- Approve/reject buttons in the editor panel for reviewer+ roles (inline, no need to go to review queue)

---

### ✅ Milestone 1 — Foundation & Read-Only Browser

Goal: A usable tool where translators can **browse** all translation keys with live MiniMessage preview, even before editing is enabled.

**Steps:**
1. **Repo scaffolding** — Bun workspace, backend (Fastify + TypeScript), frontend (Vite + React + Tailwind v4), Docker Compose for Postgres
2. **Database** — Drizzle schema + migrations for all tables above
3. **Discord OAuth** — login/logout flow, JWT cookie session, `/auth/me`
4. **JSON importer** — reads `src/main/resources/lang/en/**/*.json` from a local path, skips `minecraft.json`, flattens to dot-notation matching `LangEntry.kt` exactly (array expansion, empty-key rule), populates `translation_files` + `translation_keys`, detects arguments
5. **Translation browser** — React UI: project → file list → key list grouped by category + hierarchy; shows source value per key; no editing yet
6. **MiniMessage preview component** — inline preview below each key; renders all tag types listed above; configurable theme palette; mock `<papi:x>` and `<progress:...>`
7. **Argument mock values** — auto-detect args from source string; UI lets user set mock values (persisted in localStorage); preview re-renders live

**Done when**: a logged-in user can browse all ChronoCore `en` keys, see a live MiniMessage preview with mock arguments, and the stack runs via `docker compose up`.

---

### Milestone 2 — Translation Editing

- Submit translations (Translator role)
- Per-key status badge (untranslated / pending / approved / rejected)
- Array editor: add/remove lines, drag to reorder
- Comment threads per key

---

### Milestone 3 — Moderation

- Reviewer dashboard: queue of pending translations
- Approve/reject with optional comment
- Progress tracking per locale (% approved)
- Language-level permission management by Admins

---

### Milestone 4 — GitHub Export

- GitHub App integration (Octokit)
- Reconstruct nested JSON from flat keys (inverse of importer)
- Batch commit approved translations to `src/main/resources/lang/{locale}/{file}.json`
- Manual trigger + optional scheduled sync
- Pre-commit JSON validation

---

## Open Questions

- **Fallback locale**: Should untranslated keys fall back to `en` in export (per `getCompatibleLocale` in Translator.kt)? Recommended: yes — only export keys that have an approved translation.
- **Theme color source**: Hardcode a default palette or let admin customize per project via UI? Recommended: default palette with UI override.
- **`<papi:x>` mocks**: Optional — let admins define project-wide mock values per PAPI placeholder name.
- **`<statchar:x>` rendering**: Use Unicode block characters or a custom font? TBD.
