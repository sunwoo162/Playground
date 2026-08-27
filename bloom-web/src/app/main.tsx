import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import BloomApp from './BloomApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BloomApp />
  </StrictMode>,
)
