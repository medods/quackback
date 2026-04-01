import { useEffect, useState } from 'react'
import type { Locale } from 'date-fns'
import { format, formatDistanceToNow } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TimeAgoProps {
  date: Date | string
  className?: string
  locale?: string
}

function resolveDateFnsLocale(locale?: string): Locale {
  const normalized = locale?.trim().toLowerCase()
  if (!normalized) return enUS
  if (normalized === 'ru' || normalized.startsWith('ru-')) return ru
  return enUS
}

function getTimeAgo(date: Date | string | null | undefined, locale?: string): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  // Check for invalid date
  if (isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: resolveDateFnsLocale(locale),
  })
}

function getAbsoluteDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  return format(d, 'dd.MM.yyyy HH:mm')
}

export function TimeAgo({ date, className, locale = 'en' }: TimeAgoProps) {
  // Initialize with computed value for SSR
  const [timeAgo, setTimeAgo] = useState<string>(() => getTimeAgo(date, locale))
  const absoluteDate = getAbsoluteDate(date)

  useEffect(() => {
    // Update immediately in case server/client time differs slightly
    setTimeAgo(getTimeAgo(date, locale))

    // Update every minute
    const interval = setInterval(() => {
      setTimeAgo(getTimeAgo(date, locale))
    }, 60000)

    return () => clearInterval(interval)
  }, [date, locale])

  if (!timeAgo || !absoluteDate) {
    return <span className={className}>{timeAgo}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{timeAgo}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{absoluteDate}</TooltipContent>
    </Tooltip>
  )
}
