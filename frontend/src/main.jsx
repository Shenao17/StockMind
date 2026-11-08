import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'


import GlassElement from './GlassUi/GlassElement.js'

// StockMindGlass solo se usa en el botón del asistente: una única instancia con refracción.
// Si en el futuro aparece otra por error, cae sola a lite en vez de sumar consumo de GPU.
GlassElement.configure({ maxLiquid: 1 })

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
