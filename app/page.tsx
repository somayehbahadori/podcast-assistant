import EpisodeTable from '@/components/EpisodeTable'

export const metadata = {
  title: 'دستیار پادکست — اپیزودهای جدید',
  description: 'کشف و خلاصه‌سازی محتوای پادکست‌های سلامت و طول عمر',
}

export default function HomePage() {
  return (
    <main className="min-h-screen p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-bold tracking-tight">دستیار تحقیقاتی پادکست</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            اپیزودهای جدید سلامت، تغذیه و طول عمر از پادکسترهای معروف بین‌المللی
          </p>
        </div>
        <EpisodeTable />
      </div>
    </main>
  )
}
