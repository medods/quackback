import { useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { useIntl } from 'react-intl'

interface TimeAgoProps {
  date: Date | string
  className?: string
}

export function getDateFnsLocale(locale: string) {
  if (locale.toLowerCase().startsWith('ru')) return ru
  return enUS
}

export function getTimeAgo(date: Date | string | null | undefined, locale: string): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, { addSuffix: true, locale: getDateFnsLocale(locale) })
}

export function getTooltipDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const formatted = format(d, 'dd.MM.yyyy HH:mm')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `${formatted} (${timezone})`
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const { locale } = useIntl()
  const [timeAgo, setTimeAgo] = useState<string>(() => getTimeAgo(date, locale))

  useEffect(() => {
    setTimeAgo(getTimeAgo(date, locale))

    const interval = setInterval(() => {
      setTimeAgo(getTimeAgo(date, locale))
    }, 60000)

    return () => clearInterval(interval)
  }, [date, locale])

  return (
    <span className={className} title={getTooltipDate(date)}>
      {timeAgo}
    </span>
  )
}
