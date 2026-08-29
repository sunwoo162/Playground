import { useEffect, useMemo, useState } from 'react'

import BouquetAuthApp from './BouquetAuthApp'
import BouquetEvaluationReportApp from './BouquetEvaluationReportApp'
import BouquetManageApp from './BouquetManageApp'
import BouquetProjectDetailApp from './BouquetProjectDetailApp'
import BouquetShowcaseApp from './BouquetShowcaseApp'
import { EmptyState, SecondaryButton } from './BouquetUI'
import BuilderApp from './BuilderApp'
import LiveE2EPanel from './LiveE2EPanel'
import LunaBouquetRegisterApp from './LunaBouquetRegisterApp'
import './bouquet-system.css'
import './bloom-brand.css'
import './live-e2e.css'

function parsePositiveId(value: string | null) {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function PublicRouteError({ description }: { description: string }) {
  return (
    <main className="bouquet-public-detail-shell">
      <div className="bouquet-public-detail">
        <EmptyState
          eyebrow="INVALID PUBLIC LINK"
          title="프로젝트 링크를 열 수 없습니다."
          description={description}
          action={<SecondaryButton href="/">Showcase로 돌아가기</SecondaryButton>}
        />
      </div>
    </main>
  )
}

export default function BloomApp() {
  const [liveE2EOpen, setLiveE2EOpen] = useState(false)
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const mode = searchParams.get('mode')
  const lunaHandoff = searchParams.get('luna')
  const projectParam = searchParams.get('project')
  const reportParam = searchParams.get('report')
  const publicProjectId = parsePositiveId(projectParam)
  const publicReportId = parsePositiveId(reportParam)
  const invalidPublicProject = projectParam !== null && publicProjectId == null
  const invalidPublicReport = reportParam !== null && publicReportId == null
  const legacyBuilder = mode === 'builder'
  const bouquetAuth = mode === 'auth'
  const bouquetManage = mode === 'manage'
  const lunaRegistration = bouquetManage && Boolean(lunaHandoff)

  useEffect(() => {
    document.title = bouquetAuth
      ? '꽃다발 로그인'
      : lunaRegistration
        ? 'Luna 프로젝트 등록 · BloomBouquet'
        : bouquetManage
          ? '프로젝트 관리 · BloomBouquet'
          : legacyBuilder
            ? 'Bloom Builder'
            : publicProjectId && publicReportId
              ? 'Senior Agent Review · BloomBouquet'
              : publicProjectId
                ? 'Project · BloomBouquet'
                : 'BloomBouquet'

    if (!legacyBuilder) return
    document.querySelector('.builder-brand')?.setAttribute('aria-label', 'Bloom')
    document.querySelector('.builder-nav')?.setAttribute('aria-label', 'Bloom navigation')
  }, [bouquetAuth, bouquetManage, legacyBuilder, lunaRegistration, publicProjectId, publicReportId])

  useEffect(() => {
    if (!liveE2EOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLiveE2EOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [liveE2EOpen])

  if (bouquetAuth) return <BouquetAuthApp />
  if (lunaRegistration && lunaHandoff) return <LunaBouquetRegisterApp handoff={lunaHandoff} />
  if (bouquetManage) return <BouquetManageApp />

  if (!legacyBuilder) {
    if (invalidPublicProject) return <PublicRouteError description="프로젝트 ID가 올바르지 않습니다." />
    if (invalidPublicReport) return <PublicRouteError description="평가 Run ID가 올바르지 않습니다." />
    if (publicReportId && !publicProjectId) return <PublicRouteError description="평가 리포트를 열려면 프로젝트 ID가 필요합니다." />
    if (publicProjectId && publicReportId) return <BouquetEvaluationReportApp projectId={publicProjectId} runId={publicReportId} />
    if (publicProjectId) return <BouquetProjectDetailApp projectId={publicProjectId} />
    return <BouquetShowcaseApp />
  }

  return (
    <>
      <BuilderApp />
      <button
        className="bloom-e2e-launcher"
        type="button"
        onClick={() => setLiveE2EOpen(true)}
      >
        Live E2E
      </button>
      {liveE2EOpen && (
        <div
          className="bloom-e2e-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Bloom Live E2E"
        >
          <LiveE2EPanel onClose={() => setLiveE2EOpen(false)} />
        </div>
      )}
    </>
  )
}
