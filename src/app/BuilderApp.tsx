import { useEffect, useMemo, useState, type FormEvent } from 'react'

import './builder.css'
import './builder-projects.css'

type Platform = 'web' | 'mobile' | 'both'
type FeatureKey = 'auth' | 'search' | 'notifications' | 'admin' | 'payments' | 'maps' | 'uploads'

type Template = {
  id: string
  title: string
  description: string
  prompt: string
  platform: Platform
  features: FeatureKey[]
}

type BuilderUser = {
  id: string
  login: string
  name?: string
  avatar_url?: string
}

type BuilderProject = {
  id: number
  title: string
  brief: string
  platform: Platform
  features: FeatureKey[]
  status: string
  authRequired: boolean
  templateId?: string | null
  repositoryFullName?: string | null
  previewUrl?: string | null
  createdAt: string
  updatedAt: string
}

const templates: Template[] = [
  {
    id: 'community',
    title: '커뮤니티',
    description: '회원, 게시글, 댓글, 검색이 있는 커뮤니티',
    prompt: '관심사가 비슷한 사람들이 게시글과 댓글로 소통하는 커뮤니티 서비스를 만들어줘.',
    platform: 'web',
    features: ['auth', 'search', 'notifications', 'admin'],
  },
  {
    id: 'booking',
    title: '예약 서비스',
    description: '시간 선택, 예약 관리, 알림이 있는 서비스',
    prompt: '사용자가 가능한 시간을 확인하고 예약을 생성·변경·취소할 수 있는 예약 서비스를 만들어줘.',
    platform: 'web',
    features: ['auth', 'notifications', 'admin'],
  },
  {
    id: 'dashboard',
    title: '대시보드',
    description: '데이터 요약, 필터, 관리 화면 중심',
    prompt: '운영 데이터를 한눈에 보고 필터링하며 관리할 수 있는 대시보드를 만들어줘.',
    platform: 'web',
    features: ['auth', 'search', 'admin'],
  },
  {
    id: 'commerce',
    title: '커머스',
    description: '상품 탐색부터 주문 흐름까지',
    prompt: '상품을 탐색하고 상세 정보를 본 뒤 주문까지 진행할 수 있는 커머스 서비스를 만들어줘.',
    platform: 'web',
    features: ['auth', 'search', 'payments', 'admin', 'uploads'],
  },
  {
    id: 'saas',
    title: 'SaaS',
    description: '계정, 워크스페이스, 관리 기능이 있는 제품',
    prompt: '팀이 워크스페이스를 만들고 구성원을 초대해 함께 사용하는 SaaS 제품을 만들어줘.',
    platform: 'web',
    features: ['auth', 'notifications', 'admin'],
  },
  {
    id: 'mobile',
    title: '모바일 앱',
    description: '모바일 우선 사용 흐름으로 시작',
    prompt: '매일 반복해서 사용할 수 있는 모바일 앱을 기획하고 만들어줘.',
    platform: 'mobile',
    features: ['auth', 'notifications'],
  },
]

const featureOptions: Array<{ key: FeatureKey; label: string; description: string }> = [
  { key: 'auth', label: '로그인 / 회원가입', description: '꽃다발 공용 인증 사용' },
  { key: 'search', label: '검색', description: '사용자 데이터 탐색' },
  { key: 'notifications', label: '알림', description: '앱 내·푸시 알림 고려' },
  { key: 'admin', label: '관리자', description: '운영 및 관리 화면' },
  { key: 'payments', label: '결제', description: '결제 공급자 연동 필요' },
  { key: 'maps', label: '지도', description: '위치 기반 화면과 데이터' },
  { key: 'uploads', label: '파일 업로드', description: '이미지·첨부파일 저장' },
]

const pipeline = [
  ['Intake', '아이디어와 요구사항 분석'],
  ['PM', '기능·기술 결정과 Task DAG'],
  ['Design', '디자인 시스템과 화면 설계'],
  ['Frontend', '사용자 화면 구현'],
  ['Backend', 'API·데이터·서버 기능 구현'],
  ['Review', '코드 리뷰와 독립 검증'],
  ['QA', '빌드·테스트·사용 흐름 검증'],
  ['Release', '배포 준비와 릴리즈 evidence'],
] as const

const platformLabel: Record<Platform, string> = {
  web: 'Web',
  mobile: 'Mobile',
  both: 'Web + Mobile',
}

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function readError(response: Response) {
  const text = await response.text()
  return text || `요청에 실패했습니다. (${response.status})`
}

export default function BuilderApp() {
  const [brief, setBrief] = useState('')
  const [platform, setPlatform] = useState<Platform>('web')
  const [features, setFeatures] = useState<FeatureKey[]>(['auth'])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [project, setProject] = useState<BuilderProject | null>(null)
  const [projects, setProjects] = useState<BuilderProject[]>([])
  const [user, setUser] = useState<BuilderUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('')

  const selectedFeatureDetails = useMemo(
    () => featureOptions.filter((feature) => (project?.features ?? features).includes(feature.key)),
    [features, project],
  )

  const loadProjects = async () => {
    setProjectsLoading(true)
    try {
      const response = await fetch('/api/builder/projects', { credentials: 'include' })
      if (response.status === 401) {
        setUser(null)
        setProjects([])
        return
      }
      if (!response.ok) throw new Error(await readError(response))
      const data = await response.json()
      setProjects(Array.isArray(data) ? data : [])
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : '프로젝트 목록을 불러오지 못했습니다.')
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        const currentUser = data?.user ?? null
        setUser(currentUser)
        if (currentUser) void loadProjects()
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const handleLogin = () => {
    window.location.href = `/auth/github?returnTo=${encodeURIComponent(window.location.pathname)}`
  }

  const toggleFeature = (key: FeatureKey) => {
    setFeatures((current) => (
      current.includes(key)
        ? current.filter((feature) => feature !== key)
        : [...current, key]
    ))
  }

  const applyTemplate = (template: Template) => {
    setSelectedTemplate(template.id)
    setBrief(template.prompt)
    setPlatform(template.platform)
    setFeatures(template.features)
    setProject(null)
    setSubmitStatus('')
  }

  const submitProject = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = brief.trim()
    if (!normalized || submitting) return

    if (!user) {
      handleLogin()
      return
    }

    setSubmitting(true)
    setSubmitStatus('')
    try {
      const response = await fetch('/api/builder/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: normalized,
          platform,
          features,
          templateId: selectedTemplate,
        }),
      })

      if (response.status === 401) {
        handleLogin()
        return
      }
      if (!response.ok) throw new Error(await readError(response))

      const created: BuilderProject = await response.json()
      setProject(created)
      setProjects((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setSubmitStatus('프로젝트가 서버에 저장되었습니다.')
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : '프로젝트를 만들지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="builder-shell">
      <header className="builder-topbar">
        <div className="builder-brand" aria-label="Project Builder">
          <span className="builder-brand-mark">B</span>
          <div>
            <strong>Project Builder</strong>
            <span>working title</span>
          </div>
        </div>

        <nav className="builder-nav" aria-label="Builder navigation">
          <button className="is-active" type="button">새 프로젝트</button>
          <button type="button">프로젝트</button>
          <button type="button">Agent</button>
        </nav>

        <button
          className="builder-account"
          type="button"
          onClick={user ? undefined : handleLogin}
          title={user ? '플랫폼 꽃다발 인증 전환 예정' : '현재 GitHub 로그인 사용 · 꽃다발 전환 예정'}
        >
          {authLoading ? '확인 중' : user ? user.login : '로그인'}
        </button>
      </header>

      <main className="builder-main">
        <section className="builder-hero">
          <div className="builder-hero-copy">
            <span className="builder-kicker">AUTONOMOUS SOFTWARE TEAM</span>
            <h1>아이디어만 적어도<br />개발팀이 움직이게.</h1>
            <p>
              아이디어를 설명하거나 템플릿을 고르면 전문 Agent들이 기획, 디자인, 개발,
              리뷰, 테스트, 배포 준비까지 하나의 프로젝트로 이어서 수행합니다.
            </p>
          </div>

          <div className="builder-runtime-note">
            <span>현재 피벗 단계</span>
            <strong>프로젝트 저장 API 연결</strong>
            <p>프로젝트는 실제 사용자 계정과 DB에 저장됩니다. Agent worker 실행은 다음 단계에서 연결합니다.</p>
          </div>
        </section>

        <div className="builder-layout">
          <section className="builder-create-panel">
            <form onSubmit={submitProject}>
              <div className="builder-section-heading">
                <div>
                  <span>01</span>
                  <h2>무엇을 만들고 싶나요?</h2>
                </div>
                <p>완성된 기획서가 없어도 됩니다. 핵심 아이디어만 적어도 Intake Agent가 구조화합니다.</p>
              </div>

              <textarea
                className="builder-brief"
                value={brief}
                maxLength={4000}
                onChange={(event) => {
                  setBrief(event.target.value)
                  setSelectedTemplate(null)
                  setProject(null)
                  setSubmitStatus('')
                }}
                placeholder="예: 수험생이 수험표 혜택을 지도에서 찾고 저장할 수 있는 서비스를 만들어줘."
                rows={7}
              />

              <div className="builder-field-group">
                <div className="builder-field-label">
                  <strong>플랫폼</strong>
                  <span>MVP는 Web 생성을 우선 검증합니다.</span>
                </div>
                <div className="builder-segmented" role="group" aria-label="Platform">
                  {(['web', 'mobile', 'both'] as Platform[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={platform === value ? 'is-selected' : ''}
                      onClick={() => {
                        setPlatform(value)
                        setProject(null)
                        setSubmitStatus('')
                      }}
                    >
                      {platformLabel[value]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="builder-field-group">
                <div className="builder-field-label">
                  <strong>필요 기능</strong>
                  <span>PM이 필요성을 다시 검증하고 Task에 반영합니다.</span>
                </div>
                <div className="builder-feature-grid">
                  {featureOptions.map((feature) => {
                    const selected = features.includes(feature.key)
                    return (
                      <button
                        key={feature.key}
                        type="button"
                        className={`builder-feature ${selected ? 'is-selected' : ''}`}
                        onClick={() => {
                          toggleFeature(feature.key)
                          setProject(null)
                          setSubmitStatus('')
                        }}
                        aria-pressed={selected}
                      >
                        <span className="builder-feature-check">{selected ? '✓' : ''}</span>
                        <span>
                          <strong>{feature.label}</strong>
                          <small>{feature.description}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {features.includes('auth') && (
                <div className="builder-bouquet-note">
                  <div>
                    <span>공용 인증</span>
                    <strong>꽃다발</strong>
                  </div>
                  <p>
                    로그인/회원가입이 필요한 생성 프로젝트에는 꽃다발 Backend/Frontend 인증 계약을 기본 적용합니다.
                  </p>
                </div>
              )}

              {submitStatus && (
                <p className={`builder-submit-status ${project ? 'is-success' : ''}`} role="status">
                  {submitStatus}
                </p>
              )}

              <button className="builder-primary" type="submit" disabled={!brief.trim() || submitting || authLoading}>
                {submitting ? '저장 중…' : user ? '프로젝트 만들기' : '로그인하고 프로젝트 만들기'}
              </button>
            </form>

            {project && (
              <section className="builder-draft" aria-live="polite">
                <div className="builder-draft-top">
                  <div>
                    <span>PROJECT #{project.id}</span>
                    <h3>{project.title}</h3>
                  </div>
                  <span className="builder-draft-status">{project.status}</span>
                </div>

                <p>{project.brief}</p>

                <dl>
                  <div>
                    <dt>Target</dt>
                    <dd>{platformLabel[project.platform]}</dd>
                  </div>
                  <div>
                    <dt>Features</dt>
                    <dd>{selectedFeatureDetails.map((feature) => feature.label).join(', ') || '자동 판단'}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(project.createdAt)}</dd>
                  </div>
                </dl>

                <div className="builder-draft-message">
                  이 프로젝트는 실제 서버 DB에 `draft`로 저장되었습니다. 아직 Project Intake / Agent worker가 연결되지 않았으므로 실행 중이라고 표시하지 않습니다.
                </div>
              </section>
            )}
          </section>

          <aside className="builder-side-panel">
            {user && (
              <section className="builder-projects-card">
                <div className="builder-section-heading compact">
                  <div>
                    <span>PROJECTS</span>
                    <h2>내 프로젝트</h2>
                  </div>
                  <button className="builder-refresh" type="button" onClick={() => void loadProjects()} disabled={projectsLoading}>
                    {projectsLoading ? '불러오는 중' : '새로고침'}
                  </button>
                </div>

                {projects.length === 0 ? (
                  <p className="builder-project-empty">아직 저장된 프로젝트가 없습니다.</p>
                ) : (
                  <div className="builder-project-list">
                    {projects.slice(0, 5).map((item) => (
                      <button key={item.id} type="button" onClick={() => setProject(item)}>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{platformLabel[item.platform]} · {formatDate(item.createdAt)}</small>
                        </span>
                        <span className="builder-project-status">{item.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="builder-templates">
              <div className="builder-section-heading compact">
                <div>
                  <span>02</span>
                  <h2>빠르게 시작하기</h2>
                </div>
              </div>

              <div className="builder-template-list">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={selectedTemplate === template.id ? 'is-selected' : ''}
                    onClick={() => applyTemplate(template)}
                  >
                    <span>
                      <strong>{template.title}</strong>
                      <small>{template.description}</small>
                    </span>
                    <span className="builder-template-arrow">→</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="builder-pipeline-card">
              <div className="builder-section-heading compact">
                <div>
                  <span>03</span>
                  <h2>Agent 개발팀</h2>
                </div>
              </div>

              <div className="builder-pipeline">
                {pipeline.map(([name, description], index) => (
                  <div className="builder-pipeline-item" key={name}>
                    <span className="builder-pipeline-index">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
