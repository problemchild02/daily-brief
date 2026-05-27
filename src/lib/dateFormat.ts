const IST_ZONE = 'Asia/Kolkata'

const ABS_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: IST_ZONE,
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST_ZONE,
})

export function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`

  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return ABS_FORMATTER.format(new Date(iso))
}

export function formatTimeIST(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return TIME_FORMATTER.format(d)
}

// Spec §7 alias
export const formatIST = formatTimeIST
