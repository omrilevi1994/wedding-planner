import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initPostHog } from '@/lib/posthog'

initPostHog()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
