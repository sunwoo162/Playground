import { useEffect } from 'react'

import BuilderApp from './BuilderApp'
import './bloom-brand.css'

export default function BloomApp() {
  useEffect(() => {
    document.title = 'Bloom'
    document.querySelector('.builder-brand')?.setAttribute('aria-label', 'Bloom')
    document.querySelector('.builder-nav')?.setAttribute('aria-label', 'Bloom navigation')
  }, [])

  return <BuilderApp />
}
