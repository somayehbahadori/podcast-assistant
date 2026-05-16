import { Summary } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface Props {
  summary: Summary
}

// Renders Persian content — converts **[تیتر]** markers into styled section headers
// and the 📌 glossary box into a highlighted block.
function renderPersianContent(text: string): React.ReactNode[] {
  const cleaned = text
    .replace(/\[TRANSLATION COMPLETE ✓\]/g, '')
    .replace(/\[Section \d+ Complete\]/g, '')
    .trim()

  const parts = cleaned.split(/(\*\*\[.+?\]\*\*)/g)
  return parts.map((part, i) => {
    const headerMatch = part.match(/^\*\*\[(.+?)\]\*\*$/)
    if (headerMatch) {
      return (
        <span key={i} className="block text-blue-300 font-bold text-sm mt-6 mb-1 border-b border-blue-500/30 pb-1">
          {headerMatch[1]}
        </span>
      )
    }
    if (part.includes('📌') || part.includes('⏱')) {
      return (
        <span key={i} className="block mt-6 p-4 rounded-lg bg-blue-950/60 border border-blue-500/30 text-blue-200 text-sm whitespace-pre-wrap leading-7">
          {part.trim()}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function SummaryView({ summary }: Props) {
  // Legacy English+Persian paired format (old summaries)
  if (summary.persianContent.includes('[ENGLISH SUMMARY - LTR]')) {
    const cleaned = summary.persianContent
      .replace(/\[ENGLISH SUMMARY - LTR\]/g, '')
      .replace(/\[PERSIAN TRANSLATION[^\]]*\]/g, '')
      .replace(/\[Section \d+ Complete\]/g, '')
      .replace(/\[TRANSLATION COMPLETE ✓\]/g, '')
      .replace(/###\s*/g, '')
      .trim()
    return (
      <div className="space-y-4" dir="rtl">
        <Card className="border-blue-500/40 bg-blue-950/30">
          <CardContent className="pt-6">
            <p className="leading-8 text-base whitespace-pre-wrap text-blue-100">{cleaned}</p>
          </CardContent>
        </Card>
        <p className="text-xs text-blue-400/70 text-left">
          تولیدشده در {new Date(summary.generatedAt).toLocaleString('fa-IR')}
        </p>
      </div>
    )
  }

  // Current Persian-only format
  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-blue-500/40 bg-blue-950/30">
        <CardContent className="pt-6">
          <div className="leading-8 text-base text-blue-100 whitespace-pre-wrap">
            {renderPersianContent(summary.persianContent)}
          </div>
        </CardContent>
      </Card>
      <Separator className="bg-blue-500/20" />
      <p className="text-xs text-blue-400/70 text-left">
        تولیدشده در {new Date(summary.generatedAt).toLocaleString('fa-IR')}
      </p>
    </div>
  )
}
