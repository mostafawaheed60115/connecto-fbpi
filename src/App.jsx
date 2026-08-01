import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { clearSession, createDashboardSession, hasSession, SESSION_EXPIRED_EVENT } from './api'
import { Icon } from './components/ui'

const Catalog = lazy(() => import('./features/Catalog').then((module) => ({ default: module.Catalog })))
const Inventory = lazy(() => import('./features/Inventory').then((module) => ({ default: module.Inventory })))
const Orders = lazy(() => import('./features/Orders').then((module) => ({ default: module.Orders })))
const Overview = lazy(() => import('./features/Overview').then((module) => ({ default: module.Overview })))
const Reports = lazy(() => import('./features/Reports').then((module) => ({ default: module.Reports })))
const Returns = lazy(() => import('./features/Returns').then((module) => ({ default: module.Returns })))

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'inventory', label: 'Stock & pricing', icon: 'warehouse' },
  { id: 'catalog', label: 'Catalog', icon: 'box' },
  { id: 'returns', label: 'Returns', icon: 'return' },
  { id: 'reports', label: 'Reports', icon: 'report' },
]

const PAGE_COPY = {
  overview: ['Operations overview', 'Monitor incoming orders and open the most-used workflows.'],
  orders: ['Order fulfillment', 'Review all received orders, assign AWBs, and create shipments individually or in bulk.'],
  inventory: ['Stock & pricing', 'Manage warehouse quantities and country pricing from one product-focused workspace.'],
  catalog: ['Catalog', 'Create Noon products with live category metadata, then manage content and barcodes.'],
  returns: ['Returns', 'Find return items and their AWB or RMS barcode references.'],
  reports: ['Reports', 'Choose a Noon report category, complete its parameters, and monitor the export.'],
}

function Login({ onLogin, initialMessage = '' }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialMessage)
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createDashboardSession(password)
      onLogin()
    } catch (caught) {
      setError(caught.message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="login-shell"><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /><section className="login-card"><img className="login-logo" src="/assets/image.png" alt="Connecto" /><h1>FBPI Control</h1><p className="login-copy">Secure Noon operations workspace.</p><form onSubmit={submit}><label htmlFor="password">Dashboard password</label><div className="password-wrap"><Icon name="lock" size={17} /><input id="password" autoFocus type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Enter your password" /></div>{error ? <div className="form-error">{error}</div> : null}<button className="primary-button login-button" disabled={busy}>{busy ? 'Signing in…' : 'Unlock dashboard'} <Icon name="arrow" size={16} /></button></form><div className="login-foot"><span className="secure-mark"><Icon name="check" size={13} /></span>Private · authenticated session · test environment</div></section></main>
}

function Dashboard({ onLogout }) {
  const [page, setPage] = useState('overview')
  const [notice, setNotice] = useState(null)
  const notify = useCallback((message, tone = 'success') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 4500)
  }, [])
  const [title, description] = PAGE_COPY[page]

  return <div className="app-shell"><aside className="sidebar"><div className="brand-lockup"><img src="/assets/Connecto Logo - 2026 (2) (2).png" alt="Connecto" /><span>FBPI CONTROL</span></div><div className="workspace-switch"><span className="workspace-dot" /><div><strong>Noon operations</strong><small>Test environment</small></div></div><nav className="side-nav"><div className="nav-label">Workspace</div>{NAV_ITEMS.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'nav-active' : ''}`} onClick={() => setPage(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="connection-card"><span className="connection-icon is-live"><Icon name="trend" size={16} /></span><div><strong>Secure session</strong><small>Noon API connected</small></div></div><button className="logout-button" onClick={onLogout}>Sign out</button></div></aside><main className="main-area"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><i>/</i><strong>{title}</strong></div><div className="top-actions"><div className="api-indicator"><span className="status-light live" />Authenticated</div><div className="avatar">CO</div></div></header><section className="content dashboard-content"><div className="page-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="service-pill">Test workspace</span></div><Suspense fallback={<div className="loading-state">Loading workspace…</div>}>{page === 'overview' ? <Overview onNavigate={setPage} /> : null}{page === 'orders' ? <Orders notify={notify} /> : null}{page === 'inventory' ? <Inventory notify={notify} /> : null}{page === 'catalog' ? <Catalog notify={notify} /> : null}{page === 'returns' ? <Returns notify={notify} /> : null}{page === 'reports' ? <Reports notify={notify} /> : null}</Suspense></section></main>{notice ? <div className={`toast toast-${notice.tone}`}><span className="toast-mark"><Icon name={notice.tone === 'success' ? 'check' : 'close'} size={14} /></span>{notice.message}</div> : null}</div>
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasSession)
  const [loginMessage, setLoginMessage] = useState('')
  useEffect(() => {
    const handleExpiredSession = () => {
      setLoginMessage('Your secure session expired. Please sign in again.')
      setAuthenticated(false)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession)
  }, [])
  return authenticated ? <Dashboard onLogout={() => { clearSession(); setLoginMessage(''); setAuthenticated(false) }} /> : <Login initialMessage={loginMessage} onLogin={() => { setLoginMessage(''); setAuthenticated(true) }} />
}
