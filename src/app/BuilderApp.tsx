import { useMemo, useState, type FormEvent } from 'react'

import './builder.css'

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

type DraftProject = {
  id: string
  title: string
  brief: string
  platform: Platform
  features: FeatureKey[]
  createdAt: string
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

function createProjectTitle(brief: string) {
  const normalized = brief.replace(/\s+/g, ' ').trim()
  if (!normalized) return '새 프로젝트'
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
}

export default function BuilderApp() {
  const [brief, setBrief] = useState('')
  const [platform, setPlatform] = useState<Platform>('web')
  const [features, setFeatures] = useState<FeatureKey[]>(['auth'])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [project, setProject] = useState<DraftProject | null>(null)

  const selectedFeatureDetails = useMemo(
    () => featureOptions.filter((feature) => features.includes(feature.key)),
    [features],
  )

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
  }

  const submitProject = (event: FormEvent) => {
    event.preventDefault()
    const normalized = brief.trim()
    if (!normalized) return

    setProject({
      id: `draft-${Date.now()}`,
      title: createProjectTitle(normalized),
      brief: normalized,
      platform,
      features,
      createdAt: new Date().toLocaleString('ko-KR'),
    })
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

        <button className="builder-account" type="button" title="꽃다발 플랫폼 인증 연결 예정">
          로그인
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
            <strong>Web control plane 구축 중</strong>
            <p>기존 Tauri Agent Runtime은 삭제하지 않고 worker/runtime으로 이관합니다.</p>
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
                onChange={(event) => {
                  setBrief(event.target.value)
                  setSelectedTemplate(null)
                  setProject(null)
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

              <button className="builder-primary" type="submit" disabled={!brief.trim()}>
                프로젝트 만들기
              </button>
            </form>

            {project && (
              <section className="builder-draft" aria-live="polite">
                <div className="builder-draft-top">
                  <div>
                    <span>PROJECT DRAFT</span>
                    <h3>{project.title}</h3>
                  </div>
                  <span className="builder-draft-status">Intake 준비</span>
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
                    <dd>{project.createdAt}</dd>
                  </div>
                </dl>

                <div className="builder-draft-message">
                  지금 단계에서는 웹 control plane의 프로젝트 입력 계약만 연결되어 있습니다. 다음 migration 단계에서 이 draft를 실제 Project Intake / Agent Orchestrator API에 연결합니다.
                </div>
              </section>
            )}
          </section>

          <aside className="builder-side-panel">
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
