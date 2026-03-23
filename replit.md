# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── youtube-analyzer/   # YouTube Channel Analyzer React app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Features

### YouTube Channel Analyzer (`artifacts/youtube-analyzer`)

A web app that converts the original Python/tkinter YouTube Channel Analyzer to a modern React web app.

**Features:**
- Enter a YouTube Data API v3 key
- Paste any YouTube channel URL, video URL, or `/@handle` URL
- Choose how many videos to fetch (5, 10, 25, 50, 100, or All)
- Optionally fetch transcripts (fetched from YouTube's internal caption API)
- Sortable table with: Title, Duration, Views, Likes, Comments, Published Date, Transcript, Video ID
- Transcript cells are truncated with "Show more" toggle per row
- Export to CSV (download file)
- Copy to clipboard as TSV
- Click video titles to open on YouTube

**API routes** (in `artifacts/api-server/src/routes/youtube.ts`):
- `POST /api/youtube/channel-id` — resolve channel ID from any URL type
- `POST /api/youtube/videos` — fetch video list with details (and optional transcripts)
- `GET /api/youtube/transcript/:videoId` — fetch transcript for a single video

Transcript fetching uses YouTube's internal InnerTube API with web page fallback (no external package dependency).

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /healthz`; `src/routes/youtube.ts` exposes YouTube analysis endpoints
- Depends on: `@workspace/api-zod`, `googleapis`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Currently no schema tables defined (not needed for YouTube Analyzer).

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config. Running codegen produces output into two sibling packages.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by `api-server` for request/response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.
