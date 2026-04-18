'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Episode } from '@/lib/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function formatDuration(s: number): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function EpisodeTable() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'youtube' | 'rss' | 'summarized'>('all')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/episodes')
      .then(r => r.json())
      .then(data => { setEpisodes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = episodes.filter(ep => {
    if (filter === 'youtube') return ep.platform === 'youtube'
    if (filter === 'rss') return ep.platform === 'rss'
    if (filter === 'summarized') return ep.summarized
    return true
  })

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <p className="text-lg">هنوز اپیزودی یافت نشده</p>
        <p className="text-sm">برای دریافت محتوای جدید، endpoint کرون را اجرا کنید</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['all', 'youtube', 'rss', 'summarized'] as const).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'همه' : f === 'youtube' ? 'یوتیوب' : f === 'rss' ? 'پادکست' : 'خلاصه‌شده'}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground self-center mr-2">
          {filtered.length} اپیزود
        </span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead className="text-right">عنوان</TableHead>
              <TableHead className="text-right hidden md:table-cell">کانال</TableHead>
              <TableHead className="text-right hidden sm:table-cell">پلتفرم</TableHead>
              <TableHead className="text-right hidden lg:table-cell">تاریخ</TableHead>
              <TableHead className="text-right hidden lg:table-cell">مدت</TableHead>
              <TableHead className="text-right hidden xl:table-cell">موضوع</TableHead>
              <TableHead className="text-right w-24">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((ep, i) => (
              <TableRow key={ep.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/episode/${encodeURIComponent(ep.id)}`)}>
                <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                <TableCell className="font-medium max-w-xs">
                  <div className="truncate" title={ep.title}>{ep.title}</div>
                  {ep.summarized && <Badge variant="secondary" className="mt-1 text-xs">خلاصه‌شده</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{ep.channelName}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={ep.platform === 'youtube' ? 'default' : 'outline'} className="text-xs">
                    {ep.platform === 'youtube' ? 'یوتیوب' : 'RSS'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{formatDate(ep.publishedAt)}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{formatDuration(ep.durationSeconds)}</TableCell>
                <TableCell className="hidden xl:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {ep.topics.slice(0, 2).map(t => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                    {ep.topics.length > 2 && <span className="text-xs text-muted-foreground">+{ep.topics.length - 2}</span>}
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/episode/${encodeURIComponent(ep.id)}`)}>
                    {ep.summarized ? 'مشاهده' : 'خلاصه‌سازی'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
