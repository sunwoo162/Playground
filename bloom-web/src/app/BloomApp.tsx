import { useEffect, useMemo, useState } from 'react'

import BouquetAuthApp from './BouquetAuthApp'
import BouquetManageApp from './BouquetManageApp'
import BouquetShowcaseApp from './BouquetShowcaseApp'
import BuilderApp from './BuilderApp'
import LiveE2EPanel from './LiveE2EPanel'
import LunaBouquetRegisterApp from './LunaBouquetRegisterApp'
import './bouquet-system.css'
import './bloom-brand.css'
import './live-e2e.css'

export default function BloomApp() {
  const [liveE2EOpen, setLiveE2EOpen] = useState(false)
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const mode = searchParams.get('mode')
  const lunaHandoff = searchParams.get('luna')
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
            : 'BloomBouquet'

    if (!legacyBuilder) return
    document.querySelector('.builder-brand')?.setAttribute('aria-label', 'Bloom')
    document.querySelector('.builder-nav')?.setAttribute('aria-label', 'Bloom navigation')
  }, [bouquetAuth, bouquetManage, legacyBuilder, lunaRegistration])

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
  if (!legacyBuilder) return <BouquetShowcaseApp />

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
