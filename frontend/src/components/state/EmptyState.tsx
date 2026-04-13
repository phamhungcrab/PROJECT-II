import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  eyebrow?: string
  action?: ReactNode
}

export function EmptyState({
  title,
  description,
  eyebrow = 'No data',
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="state-shell">
        <div className="state-header">
          <div className="state-copy">
            <span className="state-eyebrow">{eyebrow}</span>
            <p className="state-title">{title}</p>
            <p className="state-message">{description}</p>
            {action ? <div className="state-actions">{action}</div> : null}
          </div>
          <div className="state-emblem state-emblem--empty" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}
