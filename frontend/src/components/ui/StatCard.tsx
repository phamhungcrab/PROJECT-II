import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  helper?: ReactNode
  tone?: 'default' | 'accent' | 'success'
}

export function StatCard({
  label,
  value,
  helper,
  tone = 'default',
}: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {helper ? <span className="stat-helper">{helper}</span> : null}
    </article>
  )
}
