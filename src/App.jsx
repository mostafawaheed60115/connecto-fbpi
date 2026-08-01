import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, clearSession, createDashboardSession, DEFAULT_SKU, hasSession, noonApi, SESSION_EXPIRED_EVENT, TARGET_WAREHOUSE } from './api'

const navItems = [
  ['overview', 'Overview', 'grid'],
  ['workflows', 'FBPI workflows', 'link'],
  ['fulfillment', 'Order fulfillment', 'package'],
  ['warehouse', 'Warehouse & stock', 'warehouse'],
  ['catalog', 'Catalog & products', 'box'],
  ['pricing', 'Pricing & cross-border', 'trend'],
  ['reports', 'Reports & imports', 'report'],
]

const FBPI_ORDER_SEEDS = [
  { orderNr: 'NEGI80057159331-IO-1', itemNr: 'NEGI80057159331-1', partnerSku: 'Hub-201' },
  { orderNr: 'NEGI70019446187-IO-1', itemNr: 'NEGI70019446187-1', partnerSku: 'Hub-210' },
]

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    warehouse: <><path d="M3 21V9l9-6 9 6v12M3 21h18M7 21v-7h10v7M8 10h.01M12 10h.01M16 10h.01" /></>,
    box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    trend: <><path d="M3 17 9 11l4 4 8-8M15 7h6v6" /></>,
    report: <><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>, package: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14.5-3L3 10M3 5v5h5M4 13a8 8 0 0 0 14.5 3L21 14M21 19v-5h-5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Login({ onLogin, initialMessage = '' }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialMessage)
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await createDashboardSession(password); onLogin() } catch (caught) { setError(caught.message) } finally { setBusy(false) }
  }
  return <main className="login-shell"><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /><section className="login-card">
    <img className="login-logo" src="/assets/image.png" alt="Connecto" /><div className="eyebrow">PRIVATE OPERATIONS SPACE</div><h1>FBPI Control</h1>
    <p className="login-copy">Secure Noon operations workspace.</p><form onSubmit={submit}><label htmlFor="password">Dashboard password</label><div className="password-wrap"><Icon name="lock" size={17} /><input id="password" autoFocus type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Enter your password" /></div>{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={busy}>{busy ? 'Signing in…' : 'Unlock dashboard'} <Icon name="arrow" size={16} /></button></form>
    <div className="login-foot"><span className="secure-mark"><Icon name="check" size={13} /></span> Private · authenticated session · test environment</div>
  </section></main>
}

function App() {
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

  return authenticated
    ? <Dashboard onLogout={() => { clearSession(); setLoginMessage(''); setAuthenticated(false) }} />
    : <Login initialMessage={loginMessage} onLogin={() => { setLoginMessage(''); setAuthenticated(true) }} />
}

function Dashboard({ onLogout }) {
  const [page, setPage] = useState('overview')
  const [notice, setNotice] = useState(null)

  const notify = useCallback((message, tone = 'success') => { setNotice({ message, tone }); window.setTimeout(() => setNotice(null), 4000) }, [])
  const pageTitle = navItems.find(([id]) => id === page)?.[1] || 'Overview'
  return <div className="app-shell"><aside className="sidebar"><div className="brand-lockup"><img src="/assets/Connecto Logo - 2026 (2) (2).png" alt="Connecto" /><span>FBPI CONTROL</span></div><div className="workspace-switch"><span className="workspace-dot" /><div><strong>Noon operations</strong><small>Test environment</small></div></div><nav className="side-nav"><div className="nav-label">Workspace</div>{navItems.map(([id, label, icon]) => <button key={id} className={`nav-item ${page === id ? 'nav-active' : ''}`} onClick={() => setPage(id)}><Icon name={icon} /><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="connection-card"><span className="connection-icon is-live"><Icon name="trend" size={16} /></span><div><strong>Secure session</strong><small>service1 · test environment</small></div></div><button className="logout-button" onClick={onLogout}>Sign out</button></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><i>/</i><strong>{pageTitle}</strong></div><div className="top-actions"><div className="api-indicator"><span className="status-light live" />Authenticated</div><div className="avatar">CO</div></div></header><section className="content"><div className="page-heading"><div><div className="eyebrow">NOON · FBPI OPERATIONS</div><h2>{page === 'overview' ? 'Good afternoon, operator.' : pageTitle}</h2><p>{page === 'overview' ? 'Run supported Noon operations from one secure workspace.' : `Supported service1 operations for ${pageTitle.toLowerCase()}.`}</p></div><div className="heading-actions"><span className="service-pill">{API_BASE}</span></div></div>
      {page === 'overview' && <Overview onNavigate={setPage} />}{page === 'workflows' && <Workflows notify={notify} />}{page === 'fulfillment' && <Fulfillment notify={notify} />}{page === 'warehouse' && <WarehouseStock notify={notify} />}{page === 'catalog' && <Catalog notify={notify} />}{page === 'pricing' && <Pricing notify={notify} />}{page === 'reports' && <Reports notify={notify} />}
    </section></main>{notice && <div className={`toast toast-${notice.tone}`}><span className="toast-mark"><Icon name={notice.tone === 'success' ? 'check' : 'close'} size={14} /></span>{notice.message}</div>}</div>
}

function Overview({ onNavigate }) {
  return <><div className="hero-strip"><div className="hero-icon"><Icon name="warehouse" size={22} /></div><div><span className="hero-kicker">Configured fulfillment node</span><strong>Hub - Connecto Platform</strong><p>{TARGET_WAREHOUSE} · FBPI · <span className="active-label">Target</span></p></div><div className="hero-meta"><span>Environment</span><strong>Test</strong></div></div><div className="metric-grid"><Metric icon="link" label="Session" value="Secure" detail="authenticated" tone="blue" /><Metric icon="warehouse" label="Target warehouse" value="FBPI" detail={TARGET_WAREHOUSE} tone="violet" /><Metric icon="box" label="Stock control" value="Ready" detail="get and update" tone="green" /><Metric icon="report" label="API modules" value="4" detail="operation screens" tone="amber" /></div><section className="panel quick-panel"><div className="panel-header"><div><h3>Operate the test account</h3><p>Use the guided workflow for product onboarding or existing-SKU assignment.</p></div></div><div className="quick-actions"><button onClick={() => onNavigate('workflows')}><Icon name="link" />Open FBPI workflows<Icon name="arrow" size={15} /></button><button onClick={() => onNavigate('warehouse')}><Icon name="warehouse" />Manage FBPI stock<Icon name="arrow" size={15} /></button><button onClick={() => onNavigate('catalog')}><Icon name="box" />Manage products<Icon name="arrow" size={15} /></button><button onClick={() => onNavigate('pricing')}><Icon name="trend" />Manage pricing<Icon name="arrow" size={15} /></button></div></section></>
}

function Workflows({ notify }) {
  const [flow, setFlow] = useState('new')
  return <section className="workflow-shell"><div className="workflow-tabs"><button className={flow === 'new' ? 'workflow-tab active' : 'workflow-tab'} onClick={() => setFlow('new')}>A. Upload product + assign stock</button><button className={flow === 'existing' ? 'workflow-tab active' : 'workflow-tab'} onClick={() => setFlow('existing')}>B. Assign existing partner SKU</button></div>{flow === 'new' ? <NewProductWorkflow notify={notify} /> : <ExistingSkuWorkflow notify={notify} />}</section>
}

function NewProductWorkflow({ notify }) {
  const categories = useAsyncAction(noonApi.categories); const attributes = useAsyncAction(noonApi.categoryAttributes); const upsert = useAsyncAction(noonApi.productUpsert); const content = useAsyncAction(noonApi.productContent); const stockUpdate = useAsyncAction(noonApi.stockUpdate); const stockGet = useAsyncAction(noonApi.stockGet)
  const [draft, setDraft] = useState({ partnerSku: DEFAULT_SKU, size: 'M', brand: 'Connecto', category: 'apparel-blazers_suits-suit', title: '', imageUrl: '', department: 'men' }); const [result, setResult] = useState(null); const [qty, setQty] = useState('1')
  const variants = result?.variants || []; const field = (name) => (event) => setDraft((current) => ({ ...current, [name]: event.target.value }))
  async function submitProduct(event) { event.preventDefault(); const body = { skus: [{ partner_sku: draft.partnerSku.trim(), size: draft.size.trim() }], brand: draft.brand.trim(), category: draft.category.trim(), images: [{ url: draft.imageUrl.trim(), sort: 1 }], attributes: { product_title: { values: [{ value: draft.title.trim(), language: 'LANGUAGE_EN' }] }, department: { values: [{ value: draft.department }] } } }; const response = await upsert.run(body); if (response?.status?.status_id === 0 && response.sku_parent) { setResult(response); notify('Product created. Continue with content QC, then assign stock.') } else if (response) notify('Noon returned product issues. Review the response before assigning stock.', 'warning') }
  async function assignStock() { const response = await stockUpdate.run(variants.map((variant) => ({ warehouse_code: TARGET_WAREHOUSE, partner_sku: variant.partner_sku, qty: Number(qty) }))); if (response) notify('Stock assignment submitted. Verify each returned item status.') }
  return <div className="workflow-grid"><OperationCard title="1. Category and attributes" description="Choose a valid Noon category and inspect its required attributes."><div className="button-row"><button className="secondary-button" onClick={() => categories.run()}>List categories</button><button className="secondary-button" onClick={() => attributes.run(draft.category)}>Get attributes</button></div><Field label="Category"><input value={draft.category} onChange={field('category')} /></Field><JsonResult result={categories.result || attributes.result} error={categories.error || attributes.error} /></OperationCard><OperationCard title="2. Product details" description="Complete the fields; the dashboard builds the request automatically."><form className="form-grid" onSubmit={submitProduct}><Field label="Partner SKU"><input required value={draft.partnerSku} onChange={field('partnerSku')} /></Field><Field label="Size"><input required value={draft.size} onChange={field('size')} /></Field><Field label="Brand"><input required value={draft.brand} onChange={field('brand')} /></Field><Field label="Department"><select value={draft.department} onChange={field('department')}><option value="men">Men</option><option value="women">Women</option><option value="boys">Boys</option><option value="girls">Girls</option></select></Field><Field label="Product title"><input required value={draft.title} onChange={field('title')} /></Field><Field label="Main image URL"><input required type="url" value={draft.imageUrl} onChange={field('imageUrl')} /></Field><button className="primary-button" disabled={upsert.busy}>Upload product</button></form><JsonResult result={upsert.result} error={upsert.error} /></OperationCard><OperationCard title="3. Content QC" description="Inspect content using the returned parent SKU."><button className="secondary-button" disabled={!result?.sku_parent || content.busy} onClick={() => content.run(result.sku_parent)}>Check product content</button><JsonResult result={content.result} error={content.error} /></OperationCard><OperationCard title="4. Assign and verify stock" description={`Assign returned partner SKUs to ${TARGET_WAREHOUSE}.`}><Field label="Quantity per variant"><input type="number" min="0" value={qty} onChange={(event) => setQty(event.target.value)} /></Field><div className="variant-list">{variants.map((variant) => <span key={variant.partner_sku}>{variant.partner_sku} → {variant.sku}</span>)}</div><div className="button-row"><button className="primary-button" disabled={!variants.length || stockUpdate.busy} onClick={assignStock}>Assign stock</button><button className="secondary-button" disabled={!variants.length || stockGet.busy} onClick={() => stockGet.run(variants.map((variant) => ({ warehouse_code: TARGET_WAREHOUSE, partner_sku: variant.partner_sku })))}>Verify stock</button></div><JsonResult result={stockUpdate.result || stockGet.result} error={stockUpdate.error || stockGet.error} /></OperationCard></div>
}

function ExistingSkuWorkflow({ notify }) {
  const update = useAsyncAction(noonApi.stockUpdate); const get = useAsyncAction(noonApi.stockGet); const [partnerSku, setPartnerSku] = useState('Hub-226'); const [noonSku, setNoonSku] = useState('Z0B769194FF28118D42E6Z-1'); const [qty, setQty] = useState('1')
  async function assign(event) { event.preventDefault(); if (partnerSku.trim() === noonSku.trim()) { notify('Use the seller partner SKU, not the Noon child SKU, for stock assignment.', 'warning'); return } const response = await update.run([{ warehouse_code: TARGET_WAREHOUSE, partner_sku: partnerSku.trim(), qty: Number(qty) }]); if (response) notify(`${partnerSku} assigned to ${TARGET_WAREHOUSE}. Now verify the item status.`) }
  return <div className="workflow-grid"><OperationCard title="1. Confirm identifiers" description="The Noon child SKU is reference-only. Noon stock APIs require the seller partner_sku."><div className="form-grid"><Field label="Partner SKU (used for stock)"><input value={partnerSku} onChange={(event) => setPartnerSku(event.target.value)} /></Field><Field label="Noon child SKU (reference)"><input value={noonSku} onChange={(event) => setNoonSku(event.target.value)} /></Field><Field label="Warehouse"><input value={TARGET_WAREHOUSE} readOnly /></Field><Field label="Quantity"><input type="number" min="0" value={qty} onChange={(event) => setQty(event.target.value)} /></Field></div></OperationCard><OperationCard title="2. Assign then verify" description="Success requires each stock-update item to return status_code: OK. Stock reads can briefly lag after an accepted update."><form className="button-row" onSubmit={assign}><button className="primary-button" disabled={update.busy}>Assign stock</button><button type="button" className="secondary-button" disabled={get.busy} onClick={() => get.run([{ warehouse_code: TARGET_WAREHOUSE, partner_sku: partnerSku.trim() }])}>Verify stock</button></form><JsonResult result={update.result || get.result} error={update.error || get.error} /></OperationCard></div>
}

function Fulfillment({ notify }) {
  const getOrder = useAsyncAction(noonApi.fbpiOrder); const allocateAwbs = useAsyncAction(noonApi.fbpiAwbs); const createShipment = useAsyncAction(noonApi.createFbpiShipment); const getShipment = useAsyncAction(noonApi.fbpiShipment)
  const [orders, setOrders] = useState(() => FBPI_ORDER_SEEDS.map((order, index) => ({ ...order, awb: '', shipmentNr: `CONN-${order.orderNr.slice(4, 15)}-${Date.now()}-${index + 1}`, orderData: null, shipmentData: null })))
  const shipped = (payload) => JSON.stringify(payload || {}).includes('INTEGRATION_ITEM_STATUS_SHIPPED')
  const ready = (payload) => { const value = JSON.stringify(payload || {}); return value.includes('MP_ITEM_STATUS_CONFIRMED') && value.includes('INTEGRATION_ITEM_STATUS_ACKNOWLEDGED') && !value.includes('cancellation_reason_code":"') }
  const manifestReady = useMemo(() => orders.every((order) => shipped(order.shipmentData)), [orders])
  function updateOrder(orderNr, patch) { setOrders((current) => current.map((order) => order.orderNr === orderNr ? { ...order, ...patch } : order)) }
  async function fetchOrder(orderNr) { const response = await getOrder.run(orderNr); if (response) { updateOrder(orderNr, { orderData: response }); notify(shipped(response) ? `${orderNr} is already shipped; do not create it again.` : `${orderNr} loaded. Confirm it is acknowledged before shipment.`) } }
  function applyAwbs() { const list = allocateAwbs.result?.awbs || allocateAwbs.result?.items || []; if (list.length >= 2) setOrders((current) => current.map((order, index) => ({ ...order, awb: list[index]?.awb_nr || list[index]?.awb || order.awb }))) }
  async function createOne(order) { if (shipped(order.orderData) || shipped(order.shipmentData)) return notify(`${order.orderNr} is already shipped.`, 'warning'); const response = await createShipment.run({ warehouse_code: TARGET_WAREHOUSE, integration_shipment_nr: order.shipmentNr.trim(), fbpi_order_nr: order.orderNr, awbs: [{ courier: 'noon', awb_nr: order.awb.trim() }], items: [{ mp_item_nr: order.itemNr }] }); if (response) { updateOrder(order.orderNr, { shipmentData: response }); notify(`${order.orderNr} shipment created. Verify it next.`) } }
  async function verifyOne(order) { const response = await getShipment.run(TARGET_WAREHOUSE, order.shipmentNr.trim()); if (response) { updateOrder(order.orderNr, { shipmentData: response }); notify(`${order.orderNr} shipment checked.`) } }
  return <section className="fulfillment-flow"><OperationCard title="Order fulfillment to manifestation" description="One shipment per order. The workflow only allows manifestation handoff after both shipment checks report SHIPPED."><div className="button-row"><button className="secondary-button" onClick={() => allocateAwbs.run('eg', 2)}>1. Allocate two AWBs</button><button className="secondary-button" onClick={applyAwbs} disabled={!allocateAwbs.result}>Apply returned AWBs</button></div><JsonResult result={allocateAwbs.result} error={allocateAwbs.error} /></OperationCard><div className="shipment-grid">{orders.map((order, index) => <OperationCard key={order.orderNr} title={`${index + 2}. ${order.orderNr}`} description={`${order.partnerSku} · ${order.itemNr} · ${TARGET_WAREHOUSE}`}><div className="button-row"><button className="secondary-button" onClick={() => fetchOrder(order.orderNr)} disabled={getOrder.busy}>Retrieve order</button><span className={`status-badge ${shipped(order.orderData) || shipped(order.shipmentData) ? 'neutral' : ready(order.orderData) ? 'success' : 'neutral'}`}>{shipped(order.orderData) || shipped(order.shipmentData) ? 'Already shipped' : ready(order.orderData) ? 'Acknowledged / ready' : 'Validate order'}</span></div><div className="form-grid divider-form"><Field label="Noon AWB"><input value={order.awb} onChange={(event) => updateOrder(order.orderNr, { awb: event.target.value })} placeholder="Allocate or paste AWB" /></Field><Field label="Integration shipment number"><input value={order.shipmentNr} onChange={(event) => updateOrder(order.orderNr, { shipmentNr: event.target.value })} /></Field></div><div className="button-row"><button className="primary-button" disabled={!order.awb.trim() || createShipment.busy || shipped(order.orderData) || shipped(order.shipmentData)} onClick={() => createOne(order)}>Create shipment</button><button className="secondary-button" disabled={getShipment.busy} onClick={() => verifyOne(order)}>Verify shipment</button></div><JsonResult result={order.shipmentData || order.orderData} error={getOrder.error || createShipment.error || getShipment.error} /></OperationCard>)}</div><OperationCard title="6. Manifest in Seller Lab" description="Noon has no FBPI manifestation API; this last operational handoff is intentionally manual."><div className={`manifest-ready ${manifestReady ? 'is-ready' : ''}`}><strong>{manifestReady ? 'Both shipments verified — ready for manifestation.' : 'Verify both shipments before manifesting.'}</strong><ol className="manifest-list"><li>Open Fulfilled by Partner → Manifestation.</li><li>Select warehouse {TARGET_WAREHOUSE} and refresh pending shipments.</li><li>Create the manifest, select the two shipments, then confirm.</li><li>Print labels and hand over the separately packed orders.</li></ol></div></OperationCard></section>
}

function WarehouseStock({ notify }) {
  const get = useAsyncAction((items) => noonApi.stockGet(items))
  const update = useAsyncAction((items) => noonApi.stockUpdate(items))
  const [sku, setSku] = useState(DEFAULT_SKU); const [warehouse, setWarehouse] = useState(TARGET_WAREHOUSE); const [qty, setQty] = useState('5'); const [processing, setProcessing] = useState('24h')
  function readStock(event) { event.preventDefault(); get.run([{ warehouse_code: warehouse.trim(), partner_sku: sku.trim() }]) }
  async function saveStock(event) { event.preventDefault(); const result = await update.run([{ warehouse_code: warehouse.trim(), partner_sku: sku.trim(), qty: Number(qty), processing_time: processing.trim() || undefined }]); if (result) notify(`${sku} updated at ${warehouse}`) }
  return <div className="module-grid"><OperationCard title="Target FBPI warehouse" description="The dashboard is configured for the primary test fulfillment node."><div className="data-row"><div><strong>Hub - Connecto Platform</strong><small>{TARGET_WAREHOUSE}</small></div><span className="status-badge success">FBPI</span></div><div className="callout"><strong>Warehouse-scoped operations</strong><span>Stock requests use this warehouse by default. Change it only when another valid FBPI node is available.</span></div></OperationCard><OperationCard title="Stock get / update" description="Read or write partner SKU quantities against a specific FBPI warehouse."><form className="form-grid" onSubmit={readStock}><Field label="Warehouse code"><input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} /></Field><Field label="Partner SKU"><input value={sku} onChange={(event) => setSku(event.target.value)} /></Field><div className="button-row"><button className="secondary-button" disabled={get.busy}>Get stock <Icon name="arrow" size={15} /></button></div></form><form className="form-grid divider-form" onSubmit={saveStock}><Field label="Quantity"><input type="number" min="0" value={qty} onChange={(event) => setQty(event.target.value)} /></Field><Field label="Processing time"><select value={processing} onChange={(event) => setProcessing(event.target.value)}><option value="">None</option><option value="24h">24 hours</option><option value="1d">1 day</option><option value="2d">2 days</option></select></Field><div className="button-row"><button className="primary-button" disabled={update.busy}>{update.busy ? 'Updating…' : 'Update stock'} <Icon name="check" size={15} /></button></div></form><JsonResult result={get.result || update.result} error={get.error || update.error} /></OperationCard></div>
}

function Catalog({ notify }) {
  const categories = useAsyncAction(noonApi.categories); const attributes = useAsyncAction(noonApi.categoryAttributes); const content = useAsyncAction(noonApi.productContent); const map = useAsyncAction(noonApi.mapBarcodes); const importRun = useAsyncAction(noonApi.barcodeImport); const importCheck = useAsyncAction(noonApi.importStatus)
  const [category, setCategory] = useState('apparel-blazers_suits-suit'); const [parentSku, setParentSku] = useState(''); const [partnerSku, setPartnerSku] = useState(DEFAULT_SKU); const [barcode, setBarcode] = useState(''); const [clientReference, setClientReference] = useState('fbpi-barcode-import'); const [importReference, setImportReference] = useState('')
  async function createImport() { const response = await importRun.run({ items: { data: [{ partner_sku: partnerSku.trim(), barcode: barcode.trim(), force_sync: false }] }, config: { is_notification_required: false, force_sync: false }, client_reference: clientReference.trim() }); if (response?.import_reference) setImportReference(response.import_reference); if (response) notify('Barcode import submitted.') }
  return <div className="module-grid"><OperationCard title="Categories and attributes" description="Choose a category and inspect its accepted product fields."><Field label="Category"><input value={category} onChange={(event) => setCategory(event.target.value)} /></Field><div className="button-row"><button className="secondary-button" onClick={() => categories.run()}>List categories</button><button className="secondary-button" onClick={() => attributes.run(category)}>Get attributes</button></div><JsonResult result={categories.result || attributes.result} error={categories.error || attributes.error} /></OperationCard><OperationCard title="Product content" description="Review a product using its Noon parent SKU."><div className="inline-form"><Field label="Parent SKU"><input value={parentSku} onChange={(event) => setParentSku(event.target.value)} /></Field><button className="secondary-button" disabled={!parentSku.trim()} onClick={() => content.run(parentSku.trim())}>Get content</button></div><JsonResult result={content.result} error={content.error} /></OperationCard><OperationCard title="Barcode mapping and import" description="Enter the product identifiers; the dashboard builds the catalog requests."><div className="form-grid"><Field label="Partner SKU"><input value={partnerSku} onChange={(event) => setPartnerSku(event.target.value)} /></Field><Field label="Barcode"><input value={barcode} onChange={(event) => setBarcode(event.target.value)} /></Field><Field label="Client reference"><input value={clientReference} onChange={(event) => setClientReference(event.target.value)} /></Field></div><div className="button-row"><button className="primary-button" disabled={!partnerSku.trim() || !barcode.trim()} onClick={() => map.run([{ partner_sku: partnerSku.trim(), barcode: barcode.trim(), force_map: true }])}>Map barcode</button><button className="secondary-button" disabled={!partnerSku.trim() || !barcode.trim()} onClick={createImport}>Create barcode import</button></div><div className="inline-form divider-form"><Field label="Import reference"><input value={importReference} onChange={(event) => setImportReference(event.target.value)} /></Field><button className="secondary-button" disabled={!importReference.trim()} onClick={() => importCheck.run(importReference.trim())}>Check status</button></div><JsonResult result={map.result || importRun.result || importCheck.result} error={map.error || importRun.error || importCheck.error} /></OperationCard></div>
}

function Pricing({ notify }) {
  const get = useAsyncAction(noonApi.pricingGet); const upsert = useAsyncAction(noonApi.pricingUpsert); const cross = useAsyncAction(noonApi.crossBorderProductUpsert); const transferGet = useAsyncAction(noonApi.transferPricesGet); const transferUpsert = useAsyncAction(noonApi.transferPricesUpsert)
  const [sku, setSku] = useState(DEFAULT_SKU); const [country, setCountry] = useState('eg'); const [price, setPrice] = useState('99.5'); const [msrp, setMsrp] = useState('119.5'); const [transfer, setTransfer] = useState('15.5'); const [hs, setHs] = useState('8517.13')
  const lookup = () => get.run([{ partner_sku: sku.trim(), country_code: country }]); const save = async (event) => { event.preventDefault(); const result = await upsert.run([{ partner_sku: sku.trim(), country_code: country, price: Number(price), msrp: Number(msrp), is_active: true }]); if (result) notify('Pricing upsert submitted') }; const saveTransfer = async (event) => { event.preventDefault(); const result = await transferUpsert.run([{ partner_sku: sku.trim(), transfer_price_usd: Number(transfer), msrp_usd: Number(msrp), is_active: true }]); if (result) notify('Transfer price submitted') }
  return <div className="module-grid"><OperationCard title="Country pricing" description="Get or update price, MSRP, and activation for a partner SKU."><div className="form-grid"><Field label="Partner SKU"><input value={sku} onChange={(event) => setSku(event.target.value)} /></Field><Field label="Country"><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="eg">Egypt</option><option value="ae">UAE</option><option value="sa">Saudi Arabia</option></select></Field></div><div className="button-row"><button className="secondary-button" onClick={lookup} disabled={get.busy}>Get pricing</button></div><form className="form-grid divider-form" onSubmit={save}><Field label="Price"><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></Field><Field label="MSRP"><input type="number" min="0" step="0.01" value={msrp} onChange={(event) => setMsrp(event.target.value)} /></Field><button className="primary-button" disabled={upsert.busy}>Upsert pricing</button></form><JsonResult result={get.result || upsert.result} error={get.error || upsert.error} /></OperationCard><OperationCard title="Cross-border pricing" description="Maintain Noon cross-border product data and transfer prices for the same partner SKU."><Field label="HS code"><input value={hs} onChange={(event) => setHs(event.target.value)} /></Field><div className="button-row"><button className="secondary-button" onClick={() => cross.run([{ partner_sku: sku.trim(), actual_weight_kg: 0.5, dimensions_cm: { length: 20, width: 10, height: 5 }, hs_code: hs }])} disabled={cross.busy}>Upsert product data</button><button className="secondary-button" onClick={() => transferGet.run([{ partner_sku: sku.trim() }])} disabled={transferGet.busy}>Get transfer price</button></div><form className="form-grid divider-form" onSubmit={saveTransfer}><Field label="Transfer price USD"><input type="number" min="0" step="0.01" value={transfer} onChange={(event) => setTransfer(event.target.value)} /></Field><button className="primary-button" disabled={transferUpsert.busy}>Upsert transfer price</button></form><JsonResult result={cross.result || transferGet.result || transferUpsert.result} error={cross.error || transferGet.error || transferUpsert.error} /></OperationCard></div>
}

function Reports({ notify }) {
  const categories = useAsyncAction(noonApi.exportCategories); const create = useAsyncAction(noonApi.createExport); const status = useAsyncAction(noonApi.exportStatus); const signed = useAsyncAction(noonApi.signedImportUrl)
  const [category, setCategory] = useState('ORDER_REPORT'); const [country, setCountry] = useState('eg'); const [exportCode, setExportCode] = useState(''); const [fileType, setFileType] = useState('FILE_TYPE_CSV')
  async function createReport(event) { event.preventDefault(); const response = await create.run(category.trim(), { country_code: country }); if (response?.export_code) setExportCode(response.export_code); if (response) notify('Export created.') }
  return <div className="module-grid"><OperationCard title="Report export" description="Choose the report type and country; no request JSON is required."><button className="secondary-button" onClick={() => categories.run()}>Load report types</button><form className="form-grid divider-form" onSubmit={createReport}><Field label="Export category"><input value={category} onChange={(event) => setCategory(event.target.value)} /></Field><Field label="Country"><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="eg">Egypt</option><option value="ae">UAE</option><option value="sa">Saudi Arabia</option></select></Field><button className="primary-button">Create export</button></form><div className="inline-form divider-form"><Field label="Export code"><input value={exportCode} onChange={(event) => setExportCode(event.target.value)} /></Field><button className="secondary-button" disabled={!exportCode.trim()} onClick={() => status.run(exportCode.trim())}>Check status</button></div><JsonResult result={categories.result || create.result || status.result} error={categories.error || create.error || status.error} /></OperationCard><OperationCard title="Catalog import upload" description="Generate a signed upload URL for the selected file format."><Field label="File type"><select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="FILE_TYPE_CSV">CSV</option><option value="FILE_TYPE_XLSX">Excel (.xlsx)</option><option value="FILE_TYPE_JSON">JSON</option><option value="FILE_TYPE_TSV">TSV</option></select></Field><button className="primary-button" onClick={() => signed.run(fileType)}>Generate upload URL</button><JsonResult result={signed.result} error={signed.error} /></OperationCard></div>
}

function useAsyncAction(action) {
  const [state, setState] = useState({ busy: false, result: null, error: null })
  const run = useCallback(async (...args) => { setState({ busy: true, result: null, error: null }); try { const result = await action(...args); setState({ busy: false, result, error: null }); return result } catch (error) { setState({ busy: false, result: null, error }); return null } }, [action])
  return { ...state, run }
}

function OperationCard({ title, description, children }) { return <section className="panel operation-card"><div className="panel-header"><div><h3>{title}</h3><p>{description}</p></div></div>{children}</section> }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
function ResultValue({ value }) {
  if (value === null || value === undefined || value === '') return <span className="empty-value">—</span>
  if (typeof value === 'boolean') return <span className={`status-badge ${value ? 'success' : 'neutral'}`}>{value ? 'Yes' : 'No'}</span>
  if (typeof value === 'object') return <code className="nested-value">{JSON.stringify(value)}</code>
  return String(value)
}

function ResultTable({ data }) {
  if (Array.isArray(data)) {
    if (!data.length) return <div className="empty-result">No records returned.</div>
    if (data.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      const columns = [...new Set(data.flatMap((item) => Object.keys(item)))].slice(0, 12)
      return <div className="table-scroll"><table className="response-table"><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{data.slice(0, 100).map((item, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column}><ResultValue value={item[column]} /></td>)}</tr>)}</tbody></table></div>
    }
    return <div className="table-scroll"><table className="response-table"><thead><tr><th>#</th><th>Value</th></tr></thead><tbody>{data.map((item, index) => <tr key={index}><td>{index + 1}</td><td><ResultValue value={item} /></td></tr>)}</tbody></table></div>
  }
  if (data && typeof data === 'object') {
    return <div className="table-scroll"><table className="response-table key-value-table"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>{Object.entries(data).map(([key, value]) => <tr key={key}><td>{key.replaceAll('_', ' ')}</td><td><ResultValue value={value} /></td></tr>)}</tbody></table></div>
  }
  return <div className="single-result"><ResultValue value={data} /></div>
}

function JsonResult({ result, error }) {
  if (!result && !error) return null
  return <div className={`result-box ${error ? 'result-error' : ''}`}><div className="result-header"><span>{error ? 'Could not complete this action' : 'Result'}</span><small>{error ? 'Please review and try again' : 'service1'}</small></div>{error ? <div className="friendly-error">{error.message}</div> : <ResultTable data={result} />}</div>
}
function Metric({ icon, label, value, detail, tone }) { return <div className="metric-card"><div className={`metric-icon metric-${tone}`}><Icon name={icon} size={19} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div> }

export default App
