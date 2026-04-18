import { Summary } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface Props {
  summary: Summary
}

export default function SummaryView({ summary }: Props) {
  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground flex items-center gap-2">
            📝 خلاصه انگلیسی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="ltr">{summary.englishSummary}</p>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            🔵 توضیحات جامع فارسی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-8 text-base whitespace-pre-wrap">{summary.persianContent}</p>
        </CardContent>
      </Card>

      {summary.podcastSuggestions.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                💡 پیشنهاد برای پادکست فارسی
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {summary.podcastSuggestions.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-bold text-primary min-w-5">{i + 1}.</span>
                    <span className="leading-7">{s}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground text-left">
        تولیدشده در {new Date(summary.generatedAt).toLocaleString('fa-IR')}
      </p>
    </div>
  )
}
