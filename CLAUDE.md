@AGENTS.md

# Podcast Assistant

A Next.js 16 app that discovers, stores, and summarizes health & longevity podcast episodes for a Persian podcast producer. The UI is RTL (Persian/Farsi).

## Stack

- **Next.js 16** (App Router) — `next dev` to run locally
- **AI SDK v6** (`ai`, `@ai-sdk/vercel`) — `streamText` with `gateway('anthropic/claude-sonnet-4.6')` for streaming summaries
- **Upstash Redis** (`@upstash/redis`) — episode and summary storage via sorted sets
- **Vercel Cron** — daily discovery job at 06:00 UTC
- **Tailwind CSS v4** + shadcn/ui + `@base-ui/react`
- **TypeScript**, `rss-parser` for RSS feeds

## Project Structure

```
app/
  page.tsx                     # Home: RTL episode table
  layout.tsx                   # Root layout, Vercel Analytics
  api/
    episodes/route.ts          # GET /api/episodes?limit&offset — paginated list
    summarize/route.ts         # POST /api/summarize — streaming AI summary
    cron/discover/route.ts     # GET /api/cron/discover — daily RSS+YouTube fetch (Bearer auth)
  episode/[id]/                # Episode detail page with summary view
lib/
  types.ts                     # Episode, Summary, PodcastSource interfaces
  redis.ts                     # All Redis helpers (saveEpisode, getEpisodes, saveSummary, …)
  utils.ts                     # cn() helper
  sources/
    config.ts                  # PODCAST_SOURCES list + HEALTH_KEYWORDS
    youtube.ts                 # YouTube Data API fetcher
    rss.ts                     # RSS feed fetcher
components/
  EpisodeTable.tsx             # Main episode listing
  SummarizeButton.tsx          # Triggers POST /api/summarize
  SummaryView.tsx              # Renders streamed summary (English + Persian)
  ui/                          # shadcn/ui primitives
```

## Key Data Models

```ts
Episode { id, platform, channelName, title, description, publishedAt, durationSeconds, url, thumbnailUrl, topics, summarized }
Summary { episodeId, englishSummary, persianContent, podcastSuggestions, generatedAt }
```

Redis keys: `episode:<id>` (hash), `episodes:recent` (sorted set by publish timestamp, capped at 200), `summary:<episodeId>`.

## Podcast Sources

8 health/longevity channels configured in `lib/sources/config.ts`: Huberman Lab, Peter Attia, Rhonda Patrick, Mark Hyman, ZOE, Mind Pump, David Sinclair, Thomas DeLauer. Sources have both YouTube channel IDs and RSS feed URLs where available.

## Cron Job

`/api/cron/discover` runs daily at 06:00 UTC (`vercel.json`). It fetches episodes published in the last 72 hours from all sources, deduplicates against Redis, and saves new ones. Protected by `Authorization: Bearer <CRON_SECRET>`.

## AI Summary

`POST /api/summarize` streams a JSON response via `streamText`. The model produces three fields: `englishSummary`, `persianContent` (flowing paragraphs, no bullet points, conversational Persian), and `podcastSuggestions` (2–3 angles for the host). `maxDuration = 60`.

## Environment Variables

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `CRON_SECRET` | Bearer token for cron endpoint |
| `AI_GATEWAY_TOKEN` | Vercel AI Gateway token |

## Development Notes

- All user-facing text is Persian/Farsi; the root `<html>` element has `lang="fa"` and layouts use `dir="rtl"`.
- The summary prompt explicitly requests JSON output — parse failures fall back to saving raw text as `persianContent`.
- Redis pipeline batching is used for bulk episode fetches.
- `maxDuration = 60` on both the cron and summarize routes — do not remove.
