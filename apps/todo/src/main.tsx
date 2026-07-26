import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'

localStorage.removeItem('playground-theme')
document.documentElement.dataset.theme = 'dark'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
