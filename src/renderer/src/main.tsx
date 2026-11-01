import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyCachedTheme } from './lib/theme'
import './styles.css'

// Тема — до первой отрисовки, по последнему выбору; App затем сверяет её с настройкой в базе.
applyCachedTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
