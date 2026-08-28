import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type CommonProps = {
  children?: ReactNode
  className?: string
}

type SurfaceProps = CommonProps & HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'div'
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function BouquetWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <a className={cx('bouquet-wordmark', compact && 'is-compact')} href="/" aria-label="BloomBouquet 홈">
      <span className="bouquet-wordmark-mark" aria-hidden="true">✦</span>
      <span>
        <strong>BloomBouquet</strong>
        {!compact && <small>Curated projects · Senior Agent review</small>}
      </span>
    </a>
  )
}

export function Surface({ children, className = '', as = 'section', ...rest }: SurfaceProps) {
  const Component = as
  return <Component className={cx('bouquet-surface', className)} {...rest}>{children}</Component>
}

export function Metric({ value, label }: { value: ReactNode; label: string }) {
  return <div className="bouquet-metric"><strong>{value}</strong><span>{label}</span></div>
}

function statusTone(status: string | null) {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED': return 'success'
    case 'RUNNING': return 'info'
    case 'QUEUED': return 'warning'
    case 'FAILED': return 'danger'
    default: return 'neutral'
  }
}

export function StatusBadge({ status, children }: { status: string | null; children?: ReactNode }) {
  const text = children ?? (status ? status.replace(/_/g, ' ') : '미평가')
  return <span className={cx('bouquet-status-badge', `is-${statusTone(status)}`)}>{text}</span>
}

export function ScoreBadge({ score, stars }: { score: number | null; stars?: number | null }) {
  return (
    <div className="bouquet-score-badge" aria-label={score == null ? '평가 전' : `평가 점수 ${score}점`}>
      <strong>{score ?? '—'}</strong>
      <span>{score == null ? 'Pending' : stars == null ? '/ 100' : `★ ${stars.toFixed(1)}`}</span>
    </div>
  )
}

function ButtonContent({ children }: { children: ReactNode }) {
  return <><span>{children}</span><span aria-hidden="true">↗</span></>
}

type ActionProps = {
  children: ReactNode
  href?: string
  className?: string
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
  disabled?: boolean
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
}

function Action({ kind, ...props }: ActionProps & { kind: 'primary' | 'secondary' }) {
  const className = cx('bouquet-action', `is-${kind}`, props.className)
  if (props.href) return <a className={className} href={props.href}><ButtonContent>{props.children}</ButtonContent></a>
  return <button className={className} type={props.type ?? 'button'} disabled={props.disabled} onClick={props.onClick}><ButtonContent>{props.children}</ButtonContent></button>
}

export function PrimaryButton(props: ActionProps) {
  return <Action kind="primary" {...props} />
}

export function SecondaryButton(props: ActionProps) {
  return <Action kind="secondary" {...props} />
}

export function Field({ label, hint, children, className = '' }: CommonProps & { label: string; hint?: string }) {
  return (
    <label className={cx('bouquet-field', className)}>
      <span className="bouquet-field-label">{label}{hint && <small>{hint}</small>}</span>
      {children}
    </label>
  )
}

export function EmptyState({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <Surface className="bouquet-empty-state">
      {eyebrow && <p className="bouquet-kicker">{eyebrow}</p>}
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="bouquet-empty-action">{action}</div>}
    </Surface>
  )
}

export function ProjectVisual({ name, teamName, status, featured = false }: { name: string; teamName: string; status: string | null; featured?: boolean }) {
  return (
    <div className={cx('bouquet-project-visual', featured && 'is-featured')} aria-hidden="true">
      <span className="bouquet-project-orb bouquet-project-orb-a" />
      <span className="bouquet-project-orb bouquet-project-orb-b" />
      <span className="bouquet-project-line" />
      <div className="bouquet-project-visual-copy">
        <small>TEAM {teamName}</small>
        <strong>{name}</strong>
        <span>{status ? status.replace(/_/g, ' ') : 'CURATED BUILD'}</span>
      </div>
    </div>
  )
}
