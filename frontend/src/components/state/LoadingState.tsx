interface LoadingStateProps {
  label?: string
}

export function LoadingState({
  label = 'Loading live SDN data...',
}: LoadingStateProps) {
  return (
    <div className="loading-state">
      <span className="loading-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}
