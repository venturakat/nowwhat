import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/afacad/400.css'
import '@fontsource/afacad/500.css'
import '@fontsource/afacad/600.css'
import '@fontsource/afacad/700.css'
import './styles.css'
import { App } from './App'
import { hydrate, update } from './store'
import { ensureFees, purgeTasks } from './lib'
import { startRates } from './rates'
import { startSheetSwipe, startSwipe } from './swipe'

hydrate().then(() => {
  update((d) => { ensureFees(d); purgeTasks(d) })
  startRates()
  startSwipe()
  startSheetSwipe()
  // a new month adds the next fixed fee
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') update((d) => { ensureFees(d); purgeTasks(d) }) })
})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
