import { useEffect, useMemo, useState } from 'react'
import { noonApi, TARGET_WAREHOUSE } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { extractAwbs, formatDate, orderState } from '../utils/format'
import { DataTable, ErrorNotice, Icon, Modal, Panel, StatusBadge } from '../components/ui'
import { createShipmentPayload, getShipmentAwb, getShipmentIds, suggestShipmentNumber } from './shipmentWorkflow.js'

function getShipmentId(order, createdShipments) {
  return getShipmentIds(order, createdShipments).join(', ') || null
}

function hasShipmentId(order, createdShipments) {
  return getShipmentIds(order, createdShipments).length > 0
}

function marketplaceCountry(order) {
  return (order.mp_country_code || 'eg').toLowerCase()
}

function canMarkOutOfStock(item) {
  return item.mp_status !== 'MP_ITEM_STATUS_CANCELLED'
    && !item.cancellation_reason_code
    && item.integration_status !== 'INTEGRATION_ITEM_STATUS_OUT_OF_STOCK'
    && item.integration_status !== 'INTEGRATION_ITEM_STATUS_SHIPPED'
}

function OrderDetails({ order, onClose, onMarkOutOfStock, busyItemNr }) {
  const state = orderState(order)
  const itemColumns = [
    { key: 'actions', label: 'Actions', render: (row) => canMarkOutOfStock(row) ? <button className="secondary-button compact-button" disabled={busyItemNr === row.mp_item_nr} onClick={() => onMarkOutOfStock(order, row)}>{busyItemNr === row.mp_item_nr ? 'Updating…' : 'Mark out of stock'}</button> : <span className="muted">No action</span> },
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
  const updateOrder = useAsyncAction(noonApi.updateFbpiOrder)
  const markRead = useAsyncAction(noonApi.markFbpiOrdersRead)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [awbs, setAwbs] = useState({})
  const [shipmentIds, setShipmentIds] = useState({})
  const [manualOrder, setManualOrder] = useState('')
  const [detail, setDetail] = useState(null)
  const [busyOrders, setBusyOrders] = useState(() => new Set())
  const [busyItemNr, setBusyItemNr] = useState(null)
  const [createdShipments, setCreatedShipments] = useState({})
  const [shipmentResults, setShipmentResults] = useState(null)

  useEffect(() => { inbox.run() }, [inbox.run])
  useAutoRefresh(() => inbox.run())

  const rows = useMemo(() => (inbox.result?.orders || []).filter((entry) => entry.order).map((entry) => ({ ...entry.order, notification: entry })), [inbox.result])

  useEffect(() => {
    setShipmentIds((current) => {
      let next = current
      for (const order of rows) {
        if (orderState(order).key !== 'ready' || hasShipmentId(order, createdShipments)) continue
        if (Object.prototype.hasOwnProperty.call(current, order.fbpi_order_nr)) continue
        if (next === current) next = { ...current }
        next[order.fbpi_order_nr] = suggestShipmentNumber(order.fbpi_order_nr)
      }
      return next
    })
  }, [rows, createdShipments])

  useEffect(() => {
    const eligibleOrderNrs = new Set(rows
      .filter((order) => orderState(order).key === 'ready' && !hasShipmentId(order, createdShipments))
      .map((order) => order.fbpi_order_nr))
    setSelected((current) => {
      const next = new Set([...current].filter((orderNr) => eligibleOrderNrs.has(orderNr)))
      return next.size === current.size ? current : next
    })
  }, [rows, createdShipments])

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
  }, { total: 0, pending: 0, ready: 0, out_of_stock: 0, processing: 0, attention: 0, shipped: 0, cancelled: 0 }), [rows])

  function toggle(orderNr) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(orderNr)) next.delete(orderNr); else next.add(orderNr)
      return next
    })
  }

  async function openOrder(order) {
    setDetail(order)
    if (order.notification?.is_read === false) {
      const response = await markRead.run([order.fbpi_order_nr])
      if (response) await inbox.run()
    }
  }

  async function markOutOfStock(order, item) {
    if (!window.confirm(`Mark ${item.partner_sku || item.mp_item_nr} out of stock in Noon? This cancels the item.`)) return
    setBusyItemNr(item.mp_item_nr)
    try {
      const response = await updateOrder.run({
        fbpi_order_nr: order.fbpi_order_nr,
        items: [{ mp_item_nr: item.mp_item_nr, status: 'UPDATE_ORDER_REQUEST_ITEM_STATUS_OUT_OF_STOCK' }],
      })
      if (!response) return
      setDetail((current) => current?.fbpi_order_nr === order.fbpi_order_nr ? {
        ...current,
        items: current.items.map((currentItem) => currentItem.mp_item_nr === item.mp_item_nr ? { ...currentItem, integration_status: 'INTEGRATION_ITEM_STATUS_OUT_OF_STOCK' } : currentItem),
      } : current)
      notify(`${item.partner_sku || item.mp_item_nr} marked out of stock in Noon.`)
      await inbox.run()
    } finally {
      setBusyItemNr(null)
    }
  }

  async function addOrder(event) {
    event.preventDefault()
    const orderNr = manualOrder.trim()
    if (!orderNr) return
    const response = await fetchOrder.run(orderNr)
    if (response) {
      setManualOrder('')
      setDetail(response)
      notify(`${orderNr} loaded.`)
    }
  }

  async function allocateForSelection() {
    const targets = rows.filter((order) => selected.has(order.fbpi_order_nr) && orderState(order).key === 'ready' && !hasShipmentId(order, createdShipments))
    if (!targets.length) return notify('Select at least one ready-to-ship order.', 'warning')
    const countries = new Set(targets.map(marketplaceCountry))
    if (countries.size > 1) return notify('Allocate AWBs separately for each marketplace country.', 'warning')
    const response = await allocate.run([...countries][0], targets.length)
    const returned = extractAwbs(response)
    if (returned.length < targets.length) return notify('Noon returned fewer AWBs than requested.', 'warning')
    setAwbs((current) => ({ ...current, ...Object.fromEntries(targets.map((order, index) => [order.fbpi_order_nr, returned[index].awb_nr])) }))
    notify(`${targets.length} unique AWBs assigned.`)
  }

  async function createOne(order) {
    if (hasShipmentId(order, createdShipments)) return notify('A shipment is already recorded for this order.', 'warning')
    const awb = awbs[order.fbpi_order_nr]?.trim()
    const shipmentId = shipmentIds[order.fbpi_order_nr]?.trim()
    if (!shipmentId) return notify('Enter an Integration Shipment ID first.', 'warning')
    if (!awb) return notify('Enter or allocate an AWB first.', 'warning')
    setBusyOrders((current) => new Set(current).add(order.fbpi_order_nr))
    try {
      const payload = createShipmentPayload(order, awb, shipmentId)
      const response = await noonApi.createFbpiShipment(payload)
      const integrationShipmentNr = response?.integration_shipment_nr || payload.integration_shipment_nr
      setCreatedShipments((current) => ({
        ...current,
        [order.fbpi_order_nr]: { integration_shipment_nr: integrationShipmentNr, awb_nr: response?.awb_nr || awb },
      }))
      setSelected((current) => { const next = new Set(current); next.delete(order.fbpi_order_nr); return next })
      const trackingSaved = response?.connecto_tracking_saved !== false
      setShipmentResults([{ fbpi_order_nr: order.fbpi_order_nr, integration_shipment_nr: integrationShipmentNr, awb_nr: response?.awb_nr || awb, success: true, connecto_tracking_saved: trackingSaved }])
      notify(
        trackingSaved ? `Shipment created for ${order.fbpi_order_nr}.` : `Shipment created, but its ID could not be saved.`,
        trackingSaved ? 'success' : 'warning',
      )
      inbox.run()
    } catch (error) {
      setShipmentResults([{ fbpi_order_nr: order.fbpi_order_nr, success: false, message: error.message }])
    } finally {
      setBusyOrders((current) => { const next = new Set(current); next.delete(order.fbpi_order_nr); return next })
    }
  }

  async function createSelected() {
    const targets = rows.filter((order) => selected.has(order.fbpi_order_nr) && orderState(order).key === 'ready' && !hasShipmentId(order, createdShipments))
    const missingShipmentId = targets.find((order) => !shipmentIds[order.fbpi_order_nr]?.trim())
    const missingAwb = targets.find((order) => !awbs[order.fbpi_order_nr]?.trim())
    if (!targets.length) return notify('Select ready-to-ship orders first.', 'warning')
    if (missingShipmentId) return notify(`Enter an Integration Shipment ID for ${missingShipmentId.fbpi_order_nr}.`, 'warning')
    if (missingAwb) return notify(`Allocate an AWB for ${missingAwb.fbpi_order_nr}.`, 'warning')
    const payloads = targets.map((order) => createShipmentPayload(order, awbs[order.fbpi_order_nr], shipmentIds[order.fbpi_order_nr]))
    const payloadShipmentIds = Object.fromEntries(payloads.map((payload) => [payload.fbpi_order_nr, payload.integration_shipment_nr]))
    const response = await bulkCreate.run(payloads)
    if (response) {
      const results = response.results || []
      setCreatedShipments((current) => ({
        ...current,
        ...Object.fromEntries(results.filter((item) => item.success).map((item) => [item.fbpi_order_nr, {
          integration_shipment_nr: item.integration_shipment_nr || payloadShipmentIds[item.fbpi_order_nr],
          awb_nr: item.awb_nr || awbs[item.fbpi_order_nr],
        }])),
      }))
      setShipmentResults(results)
      setSelected(new Set())
      const trackingFailures = results.filter((item) => item.success && item.connecto_tracking_saved === false).length
      notify(
        trackingFailures ? `${results.filter((item) => item.success).length} shipments created; ${trackingFailures} ID(s) were not saved.` : `${results.filter((item) => item.success).length} shipments created.`,
        trackingFailures ? 'warning' : 'success',
      )
      inbox.run()
    }
  }

  const columns = [
    { key: 'select', label: '', render: (order) => { const selectable = orderState(order).key === 'ready' && !hasShipmentId(order, createdShipments); return <input type="checkbox" aria-label={`Select ${order.fbpi_order_nr}`} checked={selected.has(order.fbpi_order_nr)} disabled={!selectable} onChange={() => toggle(order.fbpi_order_nr)} onClick={(event) => event.stopPropagation()} /> } },
    { key: 'order', label: 'Order', render: (order) => <button className="table-link" onClick={() => openOrder(order)}>{order.fbpi_order_nr}</button> },
    { key: 'awb', label: 'AWB', render: (order) => <input className="table-input awb-input" aria-label={`AWB for ${order.fbpi_order_nr}`} value={awbs[order.fbpi_order_nr] ?? getShipmentAwb(order, createdShipments)} onChange={(event) => setAwbs((current) => ({ ...current, [order.fbpi_order_nr]: event.target.value }))} placeholder="Enter AWB" disabled={orderState(order).key !== 'ready' || hasShipmentId(order, createdShipments)} /> },
    { key: 'shipment_id', label: 'Integration Shipment ID', render: (order) => { const existing = getShipmentId(order, createdShipments); return existing || <input className="table-input shipment-id-input" aria-label={`Integration Shipment ID for ${order.fbpi_order_nr}`} value={shipmentIds[order.fbpi_order_nr] || ''} onChange={(event) => setShipmentIds((current) => ({ ...current, [order.fbpi_order_nr]: event.target.value }))} placeholder="Enter shipment ID" disabled={orderState(order).key !== 'ready'} /> } },
    { key: 'created', label: 'Created', render: (order) => formatDate(order.order_created_at) },
    { key: 'items', label: 'Items', render: (order) => <div className="sku-stack"><strong>{order.items?.length || 0}</strong><small>{(order.items || []).map((item) => item.partner_sku).join(', ')}</small></div> },
    { key: 'status', label: 'Status', render: (order) => { const state = orderState(order); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge> } },
    { key: 'warehouse', label: 'Warehouse', render: (order) => order.warehouse_code || '—' },
    { key: 'shipment', label: 'Shipment', render: (order) => hasShipmentId(order, createdShipments) ? <StatusBadge tone="success">Created</StatusBadge> : <span className="muted">Not created</span> },
    { key: 'actions', label: 'Actions', render: (order) => <button className="primary-button compact-button" disabled={orderState(order).key !== 'ready' || hasShipmentId(order, createdShipments) || !shipmentIds[order.fbpi_order_nr]?.trim() || !awbs[order.fbpi_order_nr]?.trim() || busyOrders.has(order.fbpi_order_nr)} onClick={() => createOne(order)}>{busyOrders.has(order.fbpi_order_nr) ? 'Creating…' : 'Create shipment'}</button> },
  ]

  const resultColumns = [
    { key: 'fbpi_order_nr', label: 'Order' },
    { key: 'awb_nr', label: 'AWB' },
    { key: 'integration_shipment_nr', label: 'Shipment number' },
    { key: 'success', label: 'Result', render: (row) => <StatusBadge tone={row.success ? 'success' : 'danger'}>{row.success ? 'Created' : 'Failed'}</StatusBadge> },
    { key: 'message', label: 'Message', render: (row) => row.message || (row.connecto_tracking_saved === false ? 'Shipment accepted by Noon, but ID storage failed' : 'Shipment accepted by Noon') },
  ]

  return <>
    <div className="order-summary-strip">
      <button className={status === 'all' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('all')}><span>Overall orders</span><strong>{counts.total}</strong></button>
      <button className={status === 'pending' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('pending')}><span>Pending acknowledgment</span><strong>{counts.pending}</strong></button>
      <button className={status === 'ready' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('ready')}><span>Ready to ship</span><strong>{counts.ready}</strong></button>
      <button className={status === 'shipped' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('shipped')}><span>Shipped</span><strong>{counts.shipped}</strong></button>
      <button className={status === 'cancelled' ? 'summary-stat active' : 'summary-stat'} onClick={() => setStatus('cancelled')}><span>Cancelled</span><strong>{counts.cancelled}</strong></button>
    </div>
    <Panel title="Orders" description="Loaded and paginated directly from Noon's FBPI warehouse order list." actions={<button className="secondary-button" onClick={() => inbox.run()} disabled={inbox.busy}><Icon name="refresh" size={15} /> {inbox.busy ? 'Refreshing…' : 'Refresh orders'}</button>}>
      <div className="orders-toolbar">
        <div className="search-control"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, SKU, merchant, or warehouse" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending acknowledgment</option><option value="ready">Ready to ship</option><option value="out_of_stock">Out of stock</option><option value="attention">Partially unavailable</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="cancelled">Cancelled</option></select>
        <form className="manual-order-form" onSubmit={addOrder}><input value={manualOrder} onChange={(event) => setManualOrder(event.target.value)} placeholder="Open an order number" /><button className="secondary-button" disabled={!manualOrder.trim() || fetchOrder.busy}>{fetchOrder.busy ? 'Opening…' : 'Open order'}</button></form>
      </div>
      <ErrorNotice error={inbox.error || fetchOrder.error || updateOrder.error || markRead.error || allocate.error || bulkCreate.error} />
      {selected.size ? <div className="bulk-action-bar"><strong>{selected.size} selected</strong><button className="secondary-button" onClick={allocateForSelection} disabled={allocate.busy}>{allocate.busy ? 'Allocating…' : 'Allocate AWBs'}</button><button className="primary-button" onClick={createSelected} disabled={bulkCreate.busy}>{bulkCreate.busy ? 'Creating…' : `Create shipments (${selected.size})`}</button><button className="icon-button" onClick={() => setSelected(new Set())} aria-label="Clear selection"><Icon name="close" /></button></div> : null}
      {inbox.busy && !inbox.result ? <div className="loading-state">Fetching all order data from Noon…</div> : <DataTable columns={columns} rows={filtered} rowKey={(order) => order.fbpi_order_nr} emptyTitle="No matching orders" />}
    </Panel>
    <Panel title="Manifest handoff" description="Manifest creation remains a manual Noon Seller Lab operation after shipments are created."><ol className="manifest-list"><li>Open Fulfilled by Partner → Manifestation.</li><li>Select warehouse {TARGET_WAREHOUSE} and refresh pending shipments.</li><li>Select the created shipments, confirm the manifest, then print labels.</li></ol></Panel>
    {detail ? <OrderDetails order={detail} onClose={() => setDetail(null)} onMarkOutOfStock={markOutOfStock} busyItemNr={busyItemNr} /> : null}
    {shipmentResults ? <Modal title="Shipment results" description="Each order is reported independently." onClose={() => setShipmentResults(null)} wide><DataTable columns={resultColumns} rows={shipmentResults} rowKey={(row) => row.fbpi_order_nr} /></Modal> : null}
  </>
}
