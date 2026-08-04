import { useEffect, useMemo, useState } from 'react'
import { noonApi, TARGET_WAREHOUSE } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { extractAwbs, formatDate, orderState } from '../utils/format'
import { DataTable, ErrorNotice, Field, Icon, Modal, Panel, StatusBadge } from '../components/ui'

function shipmentNumber(orderNr) {
  const compactOrder = orderNr.replace(/[^A-Za-z0-9]/g, '').slice(-22)
  return `CONN-${compactOrder}-${Date.now()}`
}

function createShipmentPayload(order, awb) {
  return {
    warehouse_code: order.warehouse_code || TARGET_WAREHOUSE,
    integration_shipment_nr: shipmentNumber(order.fbpi_order_nr),
    fbpi_order_nr: order.fbpi_order_nr,
    awbs: [{ courier: 'noon', awb_nr: awb.trim() }],
    items: (order.items || []).map((item) => ({ mp_item_nr: item.mp_item_nr })),
  }
}

function getShipmentId(order, createdShipmentIds) {
  return order.integration_shipment_nr
    || order.shipment_id
    || order.shipmentId
    || order.shipment?.integration_shipment_nr
    || order.shipment?.shipment_id
    || createdShipmentIds[order.fbpi_order_nr]
    || null
}

function OrderDetails({ order, onClose }) {
  const state = orderState(order)
  const itemColumns = [
    { key: 'mp_item_nr', label: 'Item number' },
    { key: 'partner_sku', label: 'Seller SKU' },
    { key: 'mp_status', label: 'Marketplace status', render: (row) => row.mp_status?.replace('MP_ITEM_STATUS_', '') || '—' },
    { key: 'integration_status', label: 'Integration status', render: (row) => row.integration_status?.replace('INTEGRATION_ITEM_STATUS_', '') || '—' },
    { key: 'price', label: 'Invoice price', render: (row) => row.delivered_invoice_price ?? '—' },
  ]
  return <Modal title={order.fbpi_order_nr} description="Order details and shipment readiness" onClose={onClose} wide>
    <div className="detail-summary">
      <div><span>Status</span><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div>
      <div><span>Created</span><strong>{formatDate(order.order_created_at)}</strong></div>
      <div><span>Warehouse</span><strong>{order.warehouse_code}</strong></div>
      <div><span>Merchant</span><strong>{order.merchant_code || '—'}</strong></div>
      <div><span>Country</span><strong>{order.customer_country_code?.toUpperCase() || '—'}</strong></div>
      <div><span>Currency</span><strong>{order.currency_code?.toUpperCase() || '—'}</strong></div>
    </div>
    <h4 className="section-label">Line items</h4>
    <DataTable columns={itemColumns} rows={order.items || []} rowKey={(row) => row.mp_item_nr} />
  </Modal>
}

export function Orders({ notify }) {
  const inbox = useAsyncAction(noonApi.fbpiOrders)
  const allocate = useAsyncAction(noonApi.fbpiAwbs)
  const bulkCreate = useAsyncAction(noonApi.createFbpiShipmentsBulk)
  const fetchOrder = useAsyncAction(noonApi.fbpiOrder)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [awbs, setAwbs] = useState({})
  const [manualOrder, setManualOrder] = useState('')
  const [detail, setDetail] = useState(null)
  const [busyOrders, setBusyOrders] = useState(() => new Set())
  const [createdShipmentIds, setCreatedShipmentIds] = useState({})
  const [shipmentResults, setShipmentResults] = useState(null)

  useEffect(() => { inbox.run() }, [inbox.run])
  useAutoRefresh(() => inbox.run())

  const rows = useMemo(() => (inbox.result?.orders || []).filter((entry) => entry.order).map((entry) => ({ ...entry.order, notification: entry })), [inbox.result])
  const filtered = useMemo(() => rows.filter((order) => {
    const state = orderState(order)
    const matchesStatus = status === 'all' || state.key === status
    const haystack = `${order.fbpi_order_nr} ${order.merchant_code} ${order.warehouse_code} ${(order.items || []).map((item) => item.partner_sku).join(' ')}`.toLowerCase()
    return matchesStatus && haystack.includes(search.trim().toLowerCase())
  }), [rows, search, status])

  const counts = useMemo(() => rows.reduce((result, order) => {
    result.total += 1
    result[orderState(order).key] = (result[orderState(order).key] || 0) + 1
    return result
  }, { total: 0, ready: 0, processing: 0, shipped: 0, cancelled: 0 }), [rows])

  function toggle(orderNr) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(orderNr)) next.delete(orderNr); else next.add(orderNr)
      return next
    })
  }

  async function openOrder(order) {
    setDetail(order)
    if (!order.notification?.is_read) {
      await noonApi.markFbpiOrdersRead([order.fbpi_order_nr])
      inbox.run()
    }
  }

  async function addOrder(event) {
    event.preventDefault()
    const orderNr = manualOrder.trim()
    if (!orderNr) return
    const response = await fetchOrder.run(orderNr)
    if (response) {
      setManualOrder('')
      await inbox.run()
      notify(`${orderNr} added to the order inbox.`)
    }
  }

  async function allocateForSelection() {
    const targets = rows.filter((order) => selected.has(order.fbpi_order_nr) && orderState(order).key === 'ready')
    if (!targets.length) return notify('Select at least one ready-to-ship order.', 'warning')
    const response = await allocate.run('eg', targets.length)
    const returned = extractAwbs(response)
    if (returned.length < targets.length) return notify('Noon returned fewer AWBs than requested.', 'warning')
    setAwbs((current) => ({ ...current, ...Object.fromEntries(targets.map((order, index) => [order.fbpi_order_nr, returned[index].awb_nr])) }))
    notify(`${targets.length} unique AWBs assigned.`)
  }

  async function createOne(order) {
    const awb = awbs[order.fbpi_order_nr]?.trim()
    if (!awb) return notify('Enter or allocate an AWB first.', 'warning')
    setBusyOrders((current) => new Set(current).add(order.fbpi_order_nr))
    try {
      const payload = createShipmentPayload(order, awb)
      const response = await noonApi.createFbpiShipment(payload)
      const integrationShipmentNr = response?.integration_shipment_nr || payload.integration_shipment_nr
      setCreatedShipmentIds((current) => ({ ...current, [order.fbpi_order_nr]: integrationShipmentNr }))
      setShipmentResults([{ fbpi_order_nr: order.fbpi_order_nr, integration_shipment_nr: integrationShipmentNr, success: true }])
      notify(`Shipment created for ${order.fbpi_order_nr}.`)
      inbox.run()
    } catch (error) {
      setShipmentResults([{ fbpi_order_nr: order.fbpi_order_nr, success: false, message: error.message }])
    } finally {
      setBusyOrders((current) => { const next = new Set(current); next.delete(order.fbpi_order_nr); return next })
    }
  }

  async function createSelected() {
    const targets = rows.filter((order) => selected.has(order.fbpi_order_nr) && orderState(order).key === 'ready')
    const missingAwb = targets.find((order) => !awbs[order.fbpi_order_nr]?.trim())
    if (!targets.length) return notify('Select ready-to-ship orders first.', 'warning')
    if (missingAwb) return notify(`Allocate an AWB for ${missingAwb.fbpi_order_nr}.`, 'warning')
    const payloads = targets.map((order) => createShipmentPayload(order, awbs[order.fbpi_order_nr]))
    const payloadShipmentIds = Object.fromEntries(payloads.map((payload) => [payload.fbpi_order_nr, payload.integration_shipment_nr]))
    const response = await bulkCreate.run(payloads)
    if (response) {
      const results = response.results || []
      setCreatedShipmentIds((current) => ({
        ...current,
        ...Object.fromEntries(results.filter((item) => item.success).map((item) => [item.fbpi_order_nr, item.integration_shipment_nr || payloadShipmentIds[item.fbpi_order_nr]])),
      }))
      setShipmentResults(results)
      setSelected(new Set())
      notify(`${results.filter((item) => item.success).length} shipments created.`)
      inbox.run()
    }
  }

  const columns = [
    { key: 'select', label: '', render: (order) => { const selectable = orderState(order).key === 'ready'; return <input type="checkbox" aria-label={`Select ${order.fbpi_order_nr}`} checked={selected.has(order.fbpi_order_nr)} disabled={!selectable} onChange={() => toggle(order.fbpi_order_nr)} onClick={(event) => event.stopPropagation()} /> } },
    { key: 'order', label: 'Order', render: (order) => <button className="table-link" onClick={() => openOrder(order)}>{order.fbpi_order_nr}</button> },
    { key: 'shipment_id', label: 'Shipment ID', render: (order) => getShipmentId(order, createdShipmentIds) || <span className="muted">—</span> },
    { key: 'created', label: 'Created', render: (order) => formatDate(order.order_created_at) },
    { key: 'items', label: 'Items', render: (order) => <div className="sku-stack"><strong>{order.items?.length || 0}</strong><small>{(order.items || []).map((item) => item.partner_sku).join(', ')}</small></div> },
    { key: 'status', label: 'Status', render: (order) => { const state = orderState(order); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge> } },
    { key: 'warehouse', label: 'Warehouse', render: (order) => order.warehouse_code || '—' },
    { key: 'awb', label: 'AWB', render: (order) => <input className="table-input" value={awbs[order.fbpi_order_nr] || ''} onChange={(event) => setAwbs((current) => ({ ...current, [order.fbpi_order_nr]: event.target.value }))} placeholder="Enter AWB" disabled={orderState(order).key === 'shipped'} /> },
    { key: 'shipment', label: 'Shipment', render: (order) => orderState(order).key === 'shipped' ? <StatusBadge tone="success">Created</StatusBadge> : <span className="muted">Not created</span> },
    { key: 'actions', label: 'Actions', render: (order) => <button className="primary-button compact-button" disabled={orderState(order).key !== 'ready' || !awbs[order.fbpi_order_nr]?.trim() || busyOrders.has(order.fbpi_order_nr)} onClick={() => createOne(order)}>{busyOrders.has(order.fbpi_order_nr) ? 'Creating…' : 'Create shipment'}</button> },
  ]

  const resultColumns = [
    { key: 'fbpi_order_nr', label: 'Order' },
    { key: 'integration_shipment_nr', label: 'Shipment number' },
    { key: 'success', label: 'Result', render: (row) => <StatusBadge tone={row.success ? 'success' : 'danger'}>{row.success ? 'Created' : 'Failed'}</StatusBadge> },
    { key: 'message', label: 'Message', render: (row) => row.message || 'Shipment accepted by Noon' },
  ]

  return <>
    <div className="order-summary-strip">
      <button className={status === 'all' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('all')}><span>Overall orders</span><strong>{counts.total}</strong></button>
      <button className={status === 'ready' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('ready')}><span>Ready to ship</span><strong>{counts.ready}</strong></button>
      <button className={status === 'processing' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('processing')}><span>Processing</span><strong>{counts.processing}</strong></button>
      <button className={status === 'shipped' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('shipped')}><span>Shipped</span><strong>{counts.shipped}</strong></button>
      <button className={status === 'cancelled' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('cancelled')}><span>Cancelled</span><strong>{counts.cancelled}</strong></button>
    </div>
    <Panel title="Orders" description="Loaded and paginated directly from Noon's FBPI warehouse order list." actions={<button className="secondary-button" onClick={() => inbox.run()} disabled={inbox.busy}><Icon name="refresh" size={15} /> {inbox.busy ? 'Refreshing…' : 'Refresh orders'}</button>}>
      <div className="orders-toolbar">
        <div className="search-control"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, SKU, merchant, or warehouse" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready to ship</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="cancelled">Cancelled</option></select>
        <form className="manual-order-form" onSubmit={addOrder}><input value={manualOrder} onChange={(event) => setManualOrder(event.target.value)} placeholder="Fetch an order number" /><button className="secondary-button" disabled={!manualOrder.trim() || fetchOrder.busy}>Add order</button></form>
      </div>
      <ErrorNotice error={inbox.error || fetchOrder.error || allocate.error || bulkCreate.error} />
      {selected.size ? <div className="bulk-action-bar"><strong>{selected.size} selected</strong><button className="secondary-button" onClick={allocateForSelection} disabled={allocate.busy}>{allocate.busy ? 'Allocating…' : 'Allocate AWBs'}</button><button className="primary-button" onClick={createSelected} disabled={bulkCreate.busy}>{bulkCreate.busy ? 'Creating…' : `Create shipments (${selected.size})`}</button><button className="icon-button" onClick={() => setSelected(new Set())} aria-label="Clear selection"><Icon name="close" /></button></div> : null}
      {inbox.busy && !inbox.result ? <div className="loading-state">Fetching all order data from Noon…</div> : <DataTable columns={columns} rows={filtered} rowKey={(order) => order.fbpi_order_nr} emptyTitle="No matching orders" />}
    </Panel>
    <Panel title="Manifest handoff" description="Manifest creation remains a manual Noon Seller Lab operation after shipments are created."><ol className="manifest-list"><li>Open Fulfilled by Partner → Manifestation.</li><li>Select warehouse {TARGET_WAREHOUSE} and refresh pending shipments.</li><li>Select the created shipments, confirm the manifest, then print labels.</li></ol></Panel>
    {detail ? <OrderDetails order={detail} onClose={() => setDetail(null)} /> : null}
    {shipmentResults ? <Modal title="Shipment results" description="Each order is reported independently." onClose={() => setShipmentResults(null)} wide><DataTable columns={resultColumns} rows={shipmentResults} rowKey={(row) => row.fbpi_order_nr} /></Modal> : null}
  </>
}
