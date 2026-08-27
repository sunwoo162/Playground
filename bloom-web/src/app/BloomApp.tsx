import { useEffect, useMemo, useState } from 'react'

import BouquetShowcaseApp from './BouquetShowcaseApp'
import BuilderApp from './BuilderApp'
import LiveE2EPanel from './LiveE2EPanel'
import './bloom-brand.css'
import './live-e2e.css'

export default function BloomApp() {
  const [liveE2EOpen, setLiveE2EOpen] = useState(false)
  const legacyBuilder = useMemo(
    () => new URLSearchParams(window.location.search).get('mode') === 'builder',
    [],
  )

  useEffect(() => {
    document.title = legacyBuilder ? 'Bloom Builder' : 'BloomBouquet'
    if (!legacyBuilder) return
    document.querySelector('.builder-brand')?.setAttribute('aria-label', 'Bloom')
    document.querySelector('.builder-nav')?.setAttribute('aria-label', 'Bloom navigation')
  }, [legacyBuilder])

  useEffect(() => {
    if (!liveE2EOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLiveE2EOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [liveE2EOpen])

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
