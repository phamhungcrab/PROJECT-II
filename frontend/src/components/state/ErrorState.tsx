interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <div>
        <p className="state-title">Unable to load data</p>
        <p className="state-message">{message}</p>
      </div>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
