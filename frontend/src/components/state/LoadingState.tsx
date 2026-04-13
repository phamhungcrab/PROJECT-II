type LoadingStateVariant =
  | 'default'
  | 'cards'
  | 'table'
  | 'list'
  | 'workspace'

interface LoadingStateProps {
  label?: string
  hint?: string
  variant?: LoadingStateVariant
}

function renderLoadingSkeleton(variant: LoadingStateVariant) {
  if (variant === 'cards') {
    return (
      <div className="state-skeleton-grid state-skeleton-grid--cards" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="state-skeleton-card">
            <span className="state-skeleton-line state-skeleton-line--short" />
            <span className="state-skeleton-line state-skeleton-line--headline" />
            <span className="state-skeleton-line state-skeleton-line--medium" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className="state-skeleton-table" aria-hidden="true">
        <div className="state-skeleton-table-row state-skeleton-table-row--header">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className="state-skeleton-line state-skeleton-line--short" />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="state-skeleton-table-row">
            <span className="state-skeleton-line state-skeleton-line--medium" />
            <span className="state-skeleton-line state-skeleton-line--short" />
            <span className="state-skeleton-line state-skeleton-line--medium" />
            <span className="state-skeleton-line state-skeleton-line--short" />
            <span className="state-skeleton-line state-skeleton-line--long" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className="state-skeleton-list" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="state-skeleton-list-item">
            <div className="state-skeleton-copy">
              <span className="state-skeleton-line state-skeleton-line--medium" />
              <span className="state-skeleton-line state-skeleton-line--long" />
            </div>
            <span className="state-skeleton-line state-skeleton-line--short" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'workspace') {
    return (
      <div className="state-skeleton-workspace" aria-hidden="true">
        <div className="state-skeleton-card state-skeleton-card--workspace">
          <span className="state-skeleton-line state-skeleton-line--short" />
          <span className="state-skeleton-line state-skeleton-line--headline" />
          <span className="state-skeleton-line state-skeleton-line--long" />
          <span className="state-skeleton-line state-skeleton-line--medium" />
        </div>
        <div className="state-skeleton-grid state-skeleton-grid--workspace">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="state-skeleton-card">
              <span className="state-skeleton-line state-skeleton-line--short" />
              <span className="state-skeleton-line state-skeleton-line--medium" />
              <span className="state-skeleton-line state-skeleton-line--long" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

export function LoadingState({
  label = 'Loading live SDN data...',
  hint,
  variant = 'default',
}: LoadingStateProps) {
  return (
    <div className={`loading-state loading-state--${variant}`}>
      <div className="state-shell">
        <div className="state-header">
          <div className="state-copy">
            <span className="state-eyebrow">Loading</span>
            <p className="state-title">{label}</p>
            {hint ? <p className="state-message">{hint}</p> : null}
          </div>
          <span className="loading-spinner" aria-hidden="true" />
        </div>
        {renderLoadingSkeleton(variant)}
      </div>
    </div>
  )
}
