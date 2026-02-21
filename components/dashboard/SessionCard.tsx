'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface SessionCardProps {
  session: {
    id: string
    title: string
    topic: string
    createdAt: string
    updatedAt: string
    _count?: { messages: number }
    messages?: Array<{ content: string; role: string }>
  }
}

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter()
  const lastMessage = session.messages?.[0]
  const msgCount = session._count?.messages || 0

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <Card
      hover
      className="p-4"
      onClick={() => router.push(`/session/${session.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-stone-900 text-sm truncate">{session.title}</h3>
          {session.topic && (
            <Badge variant="orange" className="mt-1">{session.topic}</Badge>
          )}
          {lastMessage && (
            <p className="text-xs text-stone-400 mt-2 line-clamp-2">{lastMessage.content}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-stone-400">{timeAgo(session.updatedAt)}</p>
          <p className="text-xs text-stone-400 mt-1">{msgCount} msg{msgCount !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </Card>
  )
}
