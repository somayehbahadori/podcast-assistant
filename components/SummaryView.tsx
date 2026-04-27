import { Summary } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface Props {
  summary: Summary
}

interface ParsedSection {
  title: string
  english: string
  persian: string
}

function parseStructuredContent(raw: string): ParsedSection[] {
  const cleaned = raw
    .replace(/\[Section \d+ Complete\]/g, '')
    .replace(/\[Section Complete\]/g, '')
    .replace(/\[TRANSLATION COMPLETE ✓\]/g, '')
    .trim()

  const sections: ParsedSection[] = []
  const parts = cleaned.split(/(?=###\s)/g)

  for (const part of parts) {
    if (!part.trim()) continue

    const titleMatch = part.match(/###\s+(.+?)(?:\n|$)/)
    const title = titleMatch ? titleMatch[1].trim() : ''

    const englishMatch = part.match(/\[ENGLISH SUMMARY - LTR\]([\s\S]*?)(?=\[PERSIAN TRANSLATION|$)/)
    const english = englishMatch ? englishMatch[1].trim() : ''

    const persianMatch = part.match(/\[PERSIAN TRANSLATION[^\]]*\]([\s\S]*?)(?=###|\[Section|\[TRANSLATION|$)/)
    const persian = persianMatch ? persianMatch[1].trim() : ''

    if (title || english || persian) {
      sections.push({ title, english, persian })
    }
  }

  return sections
}

export default function SummaryView({ summary }: Props) {
  const isStructured = summary.persianContent.includes('[ENGLISH SUMMARY - LTR]')

  if (isStructured) {
    const sections = parseStructuredContent(summary.persianContent)
    return (
      <div className="space-y-8" dir="rtl">
        {sections.map((section, i) => (
          <div key={i} className="space-y-3">
            {section.title && (
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest px-1">
                {section.title}
              </h3>
            )}
            {section.english && (
              <Card className="border-blue-500/40 bg-blue-950/30">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-semibold text-blue-400">
                    English Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-blue-100" dir="ltr">
                    {section.english}
                  </p>
                </CardContent>
              </Card>
            )}
            {section.persian && (
              <Card className="border-blue-400/30 bg-blue-900/20">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-semibold text-blue-300">
                    ترجمه فارسی
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-8 text-base whitespace-pre-wrap text-blue-100">
                    {section.persian}
                  </p>
                </CardContent>
              </Card>
            )}
            {i < sections.length - 1 && <Separator className="bg-blue-500/20" />}
          </div>
        ))}
        <p className="text-xs text-blue-400/70 text-left">
          تولیدشده در {new Date(summary.generatedAt).toLocaleString('fa-IR')}
        </p>
      </div>
    )
  }

  // Legacy JSON format
  return (
    <div className="space-y-6" dir="rtl">
      <Card className="border-blue-500/40 bg-blue-950/30">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-blue-300 flex items-center gap-2">
            📝 خلاصه انگلیسی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-blue-100" dir="ltr">{summary.englishSummary}</p>
        </CardContent>
      </Card>

      <Separator className="bg-blue-500/30" />

      <Card className="border-blue-500/40 bg-blue-950/30">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-blue-300 flex items-center gap-2">
            🔵 توضیحات جامع فارسی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-8 text-base whitespace-pre-wrap text-blue-100">{summary.persianContent}</p>
        </CardContent>
      </Card>

      {summary.podcastSuggestions.length > 0 && (
        <>
          <Separator className="bg-blue-500/30" />
          <Card className="border-blue-500/40 bg-blue-950/30">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-blue-300 flex items-center gap-2">
                💡 پیشنهاد برای پادکست فارسی
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {summary.podcastSuggestions.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-bold text-blue-400 min-w-5">{i + 1}.</span>
                    <span className="leading-7 text-blue-100">{s}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-blue-400/70 text-left">
        تولیدشده در {new Date(summary.generatedAt).toLocaleString('fa-IR')}
      </p>
    </div>
  )
}
