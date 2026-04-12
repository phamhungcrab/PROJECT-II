import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({
  title,
  description,
  action,
  className,
  children,
}: PanelProps) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      <header className="panel-header">
        <div className="panel-title-block">
          <h3 className="panel-title">{title}</h3>
          {description ? <p className="panel-description">{description}</p> : null}
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
