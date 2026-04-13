interface ErrorStateProps {
  message: string
  onRetry?: () => void
  title?: string
}

export function ErrorState({
  message,
  onRetry,
  title = 'Data unavailable',
}: ErrorStateProps) {
  return (
    <div className="error-state">
      <div className="state-shell">
        <div className="state-header">
          <div className="state-copy">
            <span className="state-eyebrow">Load issue</span>
            <p className="state-title">{title}</p>
            <p className="state-message">{message}</p>
            {onRetry ? (
              <div className="state-actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={onRetry}
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
          <div className="state-emblem state-emblem--error" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}
