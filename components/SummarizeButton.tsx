'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  episodeId: string
}

export default function SummarizeButton({ episodeId }: Props) {
  const [loading, setLoading] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [part, setPart] = useState(0)
  const router = useRouter()

  async function handleSummarize() {
    setLoading(true)
    setError('')
    setStreamedText('')
    setPart(0)

    let offset: number | null = 0
    let accumulated = ''
    let currentPart = 0

    try {
      while (offset !== null) {
        currentPart++
        setPart(currentPart)

        const res: Response = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId, offset, previousText: accumulated }),
        })

        if (!res.ok) throw new Error(`خطا: ${res.status}`)
        if (!res.body) throw new Error('پاسخی دریافت نشد')

        const nextOffsetHeader = res.headers.get('X-Next-Offset')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setStreamedText(accumulated)
        }

        offset = nextOffsetHeader ? parseInt(nextOffsetHeader) : null
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای ناشناخته')
    } finally {
      setLoading(false)
    }
  }

  if (streamedText) {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <div className="p-4 rounded-lg bg-muted/50 text-sm leading-7 whitespace-pre-wrap font-mono">
          {streamedText}
        </div>
        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse">
            در حال پردازش بخش {part}...
          </p>
        )}
        {!loading && (
          <p className="text-xs text-muted-foreground">صفحه به‌زودی به‌روزرسانی می‌شود</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 items-start" dir="rtl">
      <Button onClick={handleSummarize} disabled={loading} size="lg">
        {loading ? `در حال خلاصه‌سازی — بخش ${part}...` : '🔵 خلاصه‌سازی و ترجمه به فارسی'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">
          در حال تولید خلاصه با هوش مصنوعی...
        </p>
      )}
    </div>
  )
}
