import { useEffect } from 'react'
import { noonApi, TARGET_WAREHOUSE } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { formatDate, orderState } from '../utils/format'
import { DataTable, ErrorNotice, Icon, Panel, StatusBadge } from '../components/ui'

export function Overview({ onNavigate }) {
  const inbox = useAsyncAction(noonApi.fbpiOrders)
  useEffect(() => { inbox.run(500) }, [inbox.run])
  useAutoRefresh(() => inbox.run(500))

  const orders = (inbox.result?.orders || []).slice(0, 8)
  const recentRows = orders.map((entry) => ({ ...entry.order, received_at: entry.received_at, is_read: entry.is_read }))
  const columns = [
    { key: 'order', label: 'Order', render: (row) => <button className="table-link" onClick={() => onNavigate('orders')}>{row.fbpi_order_nr || 'Unavailable'}</button> },
    { key: 'received', label: 'Received', render: (row) => formatDate(row.received_at || row.order_created_at) },
    { key: 'warehouse', label: 'Warehouse', render: (row) => row.warehouse_code || '—' },
    { key: 'items', label: 'Items', render: (row) => row.items?.length || 0 },
    { key: 'status', label: 'Status', render: (row) => { const state = orderState(row); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge> } },
  ]

  return <>
    <button className="order-notification" onClick={() => onNavigate('orders')}>
      <span className="notification-icon"><Icon name="bell" /></span>
      <span><strong>{inbox.result?.unread_count || 0} new order notifications</strong><small>Open the order inbox to allocate AWBs and create shipments.</small></span>
      <Icon name="arrow" />
    </button>
    <div className="metric-grid dashboard-metrics">
      <button className="metric-card metric-button" onClick={() => onNavigate('orders')}><div className="metric-icon metric-blue"><Icon name="orders" /></div><div className="metric-copy"><span>Overall orders</span><strong>{inbox.result?.total ?? '—'}</strong><small>open orders view</small></div></button>
      <div className="metric-card"><div className="metric-icon metric-violet"><Icon name="warehouse" /></div><div className="metric-copy"><span>Fulfillment node</span><strong>FBPI</strong><small>{TARGET_WAREHOUSE}</small></div></div>
      <button className="metric-card metric-button" onClick={() => onNavigate('inventory')}><div className="metric-icon metric-green"><Icon name="trend" /></div><div className="metric-copy"><span>Inventory</span><strong>Stock + price</strong><small>manage one place</small></div></button>
      <button className="metric-card metric-button" onClick={() => onNavigate('returns')}><div className="metric-icon metric-amber"><Icon name="return" /></div><div className="metric-copy"><span>Returns</span><strong>Lookup</strong><small>scan a barcode</small></div></button>
    </div>
    <Panel title="Recent orders" description="Loaded directly from Noon's authoritative FBPI warehouse order list." actions={<button className="text-button" onClick={() => inbox.run(500)} disabled={inbox.busy}><Icon name="refresh" size={15} /> {inbox.busy ? 'Refreshing…' : 'Refresh'}</button>}>
      <ErrorNotice error={inbox.error} />
      {inbox.busy && !inbox.result ? <div className="loading-state">Loading orders from Noon…</div> : <DataTable columns={columns} rows={recentRows} rowKey={(row) => row.fbpi_order_nr} emptyTitle="No orders found for this warehouse" />}
    </Panel>
  </>
}
