import { getEpisode, saveSummary, markSummarized, cacheTranscript, getCachedTranscript } from '@/lib/redis'
import { Summary } from '@/lib/types'

export const maxDuration = 60

const CHUNK_SIZE = 35000   // chars per call (~9 min of speech)
const MAX_TOKENS = 2500    // output tokens per call — Haiku generates this in ~17s

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!pageRes.ok) return ''
    const html = await pageRes.text()

    const idx = html.indexOf('"captionTracks":')
    if (idx === -1) return ''

    const arrayStart = html.indexOf('[', idx)
    if (arrayStart === -1) return ''

    let depth = 0
    let arrayEnd = -1
    for (let i = arrayStart; i < Math.min(html.length, arrayStart + 50000); i++) {
      if (html[i] === '[') depth++
      else if (html[i] === ']') {
        depth--
        if (depth === 0) { arrayEnd = i; break }
      }
    }
    if (arrayEnd === -1) return ''

    const tracks = JSON.parse(html.slice(arrayStart, arrayEnd + 1))
    if (!Array.isArray(tracks) || !tracks.length) return ''

    const track =
      tracks.find((t: { languageCode?: string; kind?: string }) => t.languageCode === 'en' && !t.kind) ||
      tracks.find((t: { languageCode?: string }) => t.languageCode === 'en') ||
      tracks[0]

    if (!track?.baseUrl) return ''

    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3')
    if (!transcriptRes.ok) return ''

    const data = await transcriptRes.json()
    const text: string = (data.events as Array<{ segs?: Array<{ utf8: string }> }>)
      ?.filter(e => e.segs)
      .map(e => e.segs!.map(s => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() ?? ''

    return text
  } catch {
    return ''
  }
}

const SYSTEM_PROMPT = `You are a specialized assistant for summarizing and contextualizing health & longevity podcast episodes for a Persian podcast producer.

## Work Process
For each section or chapter:
1. Write a detailed English summary first (narrative prose, NOT bullet points)
2. Then translate it into fluent conversational Persian (گفتاری و طبیعی)

## Output Format

### Section 1: [Topic Name]
[ENGLISH SUMMARY - LTR]
(Detailed narrative English prose)

[PERSIAN TRANSLATION - فارسی]
(Fluent conversational Persian translation)

[Section 1 Complete]

(Repeat for each topic covered)

## Rules
1. Narrative continuous prose only — no bullet lists
2. Persian must be conversational, not formal
3. Cover every key point, argument, example, and detail
4. Only write [TRANSLATION COMPLETE ✓] when explicitly told this is the final portion`

export async function POST(request: Request) {
  const { episodeId, offset = 0, previousText = '' } = await request.json()
  if (!episodeId) return new Response('Missing episodeId', { status: 400 })

  const episode = await getEpisode(episodeId)
  if (!episode) return new Response('Episode not found', { status: 404 })

  // Fetch transcript — use Redis cache to avoid re-fetching on each chunk
  let transcript = ''
  if (episode.platform === 'youtube') {
    const cached = await getCachedTranscript(episodeId)
    if (cached) {
      transcript = cached
    } else {
      try {
        const videoId = new URL(episode.url).searchParams.get('v') ?? ''
        if (videoId) {
          transcript = await fetchYouTubeTranscript(videoId)
          if (transcript) await cacheTranscript(episodeId, transcript)
        }
      } catch {
        // fall through to description-only
      }
    }
  }

  // If this is a continuation chunk and the transcript is unavailable, abort rather than
  // silently saving a description-only summary as if the video were fully covered.
  if (offset > 0 && !transcript) {
    return new Response('Transcript unavailable for continuation — please try again', { status: 500 })
  }

  const transcriptChunk = transcript.slice(offset, offset + CHUNK_SIZE)
  const hasMore = transcript.length > offset + CHUNK_SIZE
  const isFirst = offset === 0

  // Last 300 chars of previous output — lets Claude resume mid-sentence instead of restarting.
  const tailContext = previousText
    ? `\n\nThe previous chunk was cut off mid-text ending with: "...${previousText.slice(-300)}"\nResume exactly from where it cut off — do not restart or repeat earlier sections.`
    : ''

  let chunkInstruction = ''
  if (transcript) {
    if (isFirst && hasMore) {
      chunkInstruction = '\n\nThis is the FIRST portion of a longer transcript. Summarize only what is covered here. Do NOT write [TRANSLATION COMPLETE ✓] — more content follows.'
    } else if (!isFirst && hasMore) {
      chunkInstruction = `${tailContext}\n\nThis is a CONTINUATION. Resume from exactly where the previous output was cut off. Do NOT write [TRANSLATION COMPLETE ✓] — more content follows.`
    } else if (!isFirst && !hasMore) {
      chunkInstruction = `${tailContext}\n\nThis is the FINAL portion. Resume and complete any section that was cut off, then cover remaining topics and write a conclusion. End with [TRANSLATION COMPLETE ✓].`
    }
    // isFirst && !hasMore: single chunk, use normal [TRANSLATION COMPLETE ✓] from system prompt
  }

  const userMessage = transcriptChunk
    ? `Episode: "${episode.title}" by ${episode.channelName} (${formatDuration(episode.durationSeconds)})

Transcript:
${transcriptChunk}${chunkInstruction}`
    : `Episode details:
- Title: ${episode.title}
- Channel: ${episode.channelName}
- Duration: ${formatDuration(episode.durationSeconds)}
- Topics: ${episode.topics.join(', ')}
- Description: ${episode.description}

Create a comprehensive structured summary. End with [TRANSLATION COMPLETE ✓].`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_TOKENS,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(`Anthropic error: ${err}`, { status: 500 })
  }

  const reader = anthropicRes.body!.getReader()
  const decoder = new TextDecoder()
  let chunkText = ''

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
  }
  if (hasMore) {
    responseHeaders['X-Next-Offset'] = String(offset + CHUNK_SIZE)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const raw = decoder.decode(value, { stream: true })
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                const text: string = parsed.delta.text
                chunkText += text
                controller.enqueue(encoder.encode(text))
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } finally {
        // Save to Redis only on the last chunk
        if (!hasMore) {
          const fullText = previousText + chunkText
          const summary: Summary = {
            episodeId,
            englishSummary: '',
            persianContent: fullText,
            podcastSuggestions: [],
            generatedAt: new Date().toISOString(),
          }
          try {
            await saveSummary(summary)
            await markSummarized(episodeId)
          } catch {
            // Redis failure should not break the response
          }
        }
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: responseHeaders })
}
