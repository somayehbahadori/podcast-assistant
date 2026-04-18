export interface Episode {
  id: string
  platform: 'youtube' | 'rss'
  channelName: string
  title: string
  description: string
  publishedAt: string
  durationSeconds: number
  url: string
  thumbnailUrl?: string
  topics: string[]
  summarized: boolean
}

export interface Summary {
  episodeId: string
  englishSummary: string
  persianContent: string
  podcastSuggestions: string[]
  generatedAt: string
}

export interface PodcastSource {
  name: string
  youtubeChannelId?: string
  rssFeedUrl?: string
}
