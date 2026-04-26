# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Podcast Assistant

A Next.js 16 app that discovers, stores, and summarizes health & longevity podcast episodes for a Persian podcast producer. The UI is RTL (Persian/Farsi).

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Type-check + production build
npm run start    # Start production server (run build first)
```

There is no lint script and no test suite.

## Stack

- **Next.js 16** (App Router) — `next dev` to run locally
- **AI SDK v6** (`ai`, `@ai-sdk/vercel`) — `streamText` with `gateway('anthropic/claude-sonnet-4.6')` for streaming summaries
- **Upstash Redis** (`@upstash/redis`) — episode and summary storage via sorted sets
- **Vercel Cron** — daily discovery job at 06:00 UTC (`vercel.json`)
- **Tailwind CSS v4** + shadcn/ui + `@base-ui/react`
- **TypeScript**, `rss-parser` for RSS feeds

## Architecture

### Data flow

1. **Discovery** (`/api/cron/discover`): Runs daily, calls `fetchYouTubeEpisodes` and `fetchRSSEpisodes` in parallel, deduplicates against Redis, and saves new episodes. Episodes are filtered by `HEALTH_KEYWORDS` match against title+description — episodes without any keyword match are dropped.
2. **Storage**: Episodes are stored as JSON blobs at `episode:<id>` and tracked in a sorted set `episodes:recent` (score = publish timestamp, capped at 200 via `zpopmin`). Summaries are stored at `summary:<episodeId>`.
3. **Listing** (`/api/episodes`): Fetches IDs from the sorted set in reverse order, then batch-fetches episode hashes via Redis pipeline.
4. **Summarization** (`/api/summarize`): Streams raw text from Claude. The `onFinish` callback parses the streamed text as JSON and writes the `Summary` object to Redis, then sets `episode.summarized = true`. On JSON parse failure, raw text is saved as `persianContent`.

### Next.js 16 specifics

- Dynamic route `params` is a **Promise** — always `await params` before accessing fields (see [app/episode/[id]/page.tsx](app/episode/%5Bid%5D/page.tsx:10)).
- Read `node_modules/next/dist/docs/` before changing routing or API conventions.

### Episode IDs

- YouTube: `youtube-<videoId>`
- RSS: `rss-<slugified-source-name>-<slugified-title>-<pubTimestamp>`

RSS IDs are not stable across re-fetches if the title changes. Deduplication relies on `episodeExists()` checking `EXISTS episode:<id>`.

### AI gateway

The model is accessed via Vercel AI Gateway: `gateway('anthropic/claude-sonnet-4.6')`. The `AI_GATEWAY_TOKEN` env var is required at runtime. The prompt instructs Claude to return **only valid JSON** with three keys; the fallback path in `onFinish` handles cases where the model wraps output in markdown code fences.

## Key Data Models

```ts
Episode { id, platform, channelName, title, description, publishedAt, durationSeconds, url, thumbnailUrl, topics, summarized }
Summary { episodeId, englishSummary, persianContent, podcastSuggestions, generatedAt }
```

Redis keys: `episode:<id>` (JSON), `episodes:recent` (sorted set, score = publish ms), `summary:<episodeId>` (JSON).

## Podcast Sources

8 health/longevity channels in [lib/sources/config.ts](lib/sources/config.ts): Huberman Lab, Peter Attia, Rhonda Patrick, Mark Hyman, ZOE, Mind Pump, David Sinclair, Thomas DeLauer. David Sinclair and Thomas DeLauer have no RSS feed — YouTube only.

## Environment Variables

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `CRON_SECRET` | Bearer token for cron endpoint |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway token |

## Development Notes

- All user-facing text is Persian/Farsi; the root `<html>` element has `lang="fa"` and all `<main>` elements use `dir="rtl"`. The English summary in `SummaryView` uses `dir="ltr"` explicitly.
- `maxDuration = 60` is set on both the cron and summarize routes — do not remove (Vercel serverless timeout).
- To manually trigger discovery locally: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/discover`
- `EpisodeTable` is a client component that fetches episodes from `/api/episodes` on mount. `SummarizeButton` streams the raw JSON text to the UI during generation, then calls `router.refresh()` after `onFinish` saves to Redis.
