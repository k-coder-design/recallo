export function formatDue(iso: string, now = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 45) return `in ${days} ${plural(days, 'day', 'days')}`
  const months = Math.round(days / 30)
  return `in ${months} ${plural(months, 'month', 'months')}`
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other
}
