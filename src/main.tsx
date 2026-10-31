import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/afacad/400.css'
import '@fontsource/afacad/500.css'
import '@fontsource/afacad/600.css'
import '@fontsource/afacad/700.css'
import './styles.css'
import { App } from './App'
import { hydrate } from './store'
import { startRates } from './rates'

hydrate().then(startRates)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
