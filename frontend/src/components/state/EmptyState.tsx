interface EmptyStateProps {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="state-title">{title}</p>
      <p className="state-message">{description}</p>
    </div>
  )
}
