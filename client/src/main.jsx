import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import { AppProvider } from "./context/AppContext.jsx";
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL
  || (import.meta.env.PROD ? '/__clerk' : undefined)

const clerkConfigError = !PUBLISHABLE_KEY
  ? 'Missing VITE_CLERK_PUBLISHABLE_KEY.'
  : ''

if (import.meta.env.PROD && PUBLISHABLE_KEY && !PUBLISHABLE_KEY.startsWith('pk_live_')) {
  console.warn('Clerk is using a test/non-live publishable key. This is allowed for the Vercel demo; use pk_live_ before serving real users.')
}

const rootContent = clerkConfigError ? (
  <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#09090b', color: '#fff', textAlign: 'center' }}>
    <p>{clerkConfigError} Update the Vercel environment variable and redeploy.</p>
  </main>
) : (
  <BrowserRouter>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} proxyUrl={CLERK_PROXY_URL}>
      <AppProvider>
        <App />
      </AppProvider>
    </ClerkProvider>
  </BrowserRouter>
)

createRoot(document.getElementById('root')).render(rootContent)
