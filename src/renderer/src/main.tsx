import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyCachedTheme } from './lib/theme'
import './styles.css'

// The theme before the first render, from the last choice; App then checks it against the setting in the database.
applyCachedTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
