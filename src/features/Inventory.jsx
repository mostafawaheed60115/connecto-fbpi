import { useEffect, useState } from 'react'
import { DEFAULT_SKU, noonApi, TARGET_WAREHOUSE } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { COUNTRY_LABELS } from '../utils/format'
import { DataTable, ErrorNotice, Field, Icon, Panel, StatusBadge, Tabs } from '../components/ui'

function apiStatus(item) {
  return item?.status?.status_code || (item?.status?.status_id === 0 ? 'OK' : '—')
}

export function Inventory({ notify }) {
  const [tab, setTab] = useState('stock')
  return <><Tabs items={[{ value: 'stock', label: 'Warehouse stock' }, { value: 'pricing', label: 'Country pricing' }]} value={tab} onChange={setTab} />{tab === 'stock' ? <StockPanel notify={notify} /> : <PricingPanel notify={notify} />}</>
}

function StockPanel({ notify }) {
  const warehouses = useAsyncAction(noonApi.warehouses)
  const stockGet = useAsyncAction(noonApi.stockGet)
  const stockUpdate = useAsyncAction(noonApi.stockUpdate)
  const [warehouse, setWarehouse] = useState(TARGET_WAREHOUSE)
  const [sku, setSku] = useState(DEFAULT_SKU)
  const [qty, setQty] = useState('5')
  const [processingTime, setProcessingTime] = useState('24h')

  useEffect(() => { warehouses.run() }, [warehouses.run])
  const warehouseOptions = warehouses.result?.warehouses || []
  const resultItems = stockGet.result?.items || stockUpdate.result?.items || []
  const columns = [
    { key: 'warehouse_code', label: 'Warehouse' },
    { key: 'partner_sku', label: 'Seller SKU' },
    { key: 'qty', label: 'Available quantity', render: (row) => row.qty ?? 'Submitted' },
    { key: 'processing_time', label: 'Processing time', render: (row) => row.processing_time || 'None' },
    { key: 'status', label: 'API status', render: (row) => <StatusBadge tone={apiStatus(row) === 'OK' ? 'success' : 'warning'}>{apiStatus(row)}</StatusBadge> },
  ]

  async function lookup(event) {
    event.preventDefault()
    const response = await stockGet.run([{ warehouse_code: warehouse, partner_sku: sku.trim() }])
    const item = response?.items?.[0]
    if (item?.qty !== undefined) setQty(String(item.qty))
    if (item?.processing_time && item.processing_time !== 'None') setProcessingTime(item.processing_time)
  }

  async function update(event) {
    event.preventDefault()
    const response = await stockUpdate.run([{ warehouse_code: warehouse, partner_sku: sku.trim(), qty: Number(qty), ...(processingTime ? { processing_time: processingTime } : {}) }])
    const ok = response?.items?.every((item) => apiStatus(item) === 'OK')
    if (response) notify(ok ? 'Stock updated successfully.' : 'Noon returned an item-level stock warning.', ok ? 'success' : 'warning')
  }

  return <div className="two-column-layout">
    <Panel title="Warehouse and SKU" description="Stock is assigned with the seller SKU, not a Noon child SKU.">
      <form className="form-grid" onSubmit={lookup}>
        <Field label="FBPI warehouse"><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>{warehouseOptions.length ? warehouseOptions.map((item) => <option key={item.warehouse_code} value={item.warehouse_code}>{item.display_name || item.warehouse_code} · {item.warehouse_code}</option>) : <option value={TARGET_WAREHOUSE}>{TARGET_WAREHOUSE}</option>}</select></Field>
        <Field label="Seller SKU" hint="Noon field: partner_sku"><input value={sku} onChange={(event) => setSku(event.target.value)} required /></Field>
        <button className="secondary-button" disabled={stockGet.busy}>{stockGet.busy ? 'Loading…' : 'Get stock'} <Icon name="arrow" size={15} /></button>
      </form>
      <form className="form-grid divider-form" onSubmit={update}>
        <Field label="Available quantity"><input type="number" min="0" value={qty} onChange={(event) => setQty(event.target.value)} required /></Field>
        <Field label="Processing time"><select value={processingTime} onChange={(event) => setProcessingTime(event.target.value)}><option value="">None</option><option value="24h">24 hours</option><option value="1d">1 day</option><option value="2d">2 days</option></select></Field>
        <button className="primary-button" disabled={stockUpdate.busy}>{stockUpdate.busy ? 'Updating…' : 'Update stock'}</button>
      </form>
      <ErrorNotice error={warehouses.error || stockGet.error || stockUpdate.error} />
    </Panel>
    <Panel title="Stock result" description="Item-level Noon status is shown separately from the HTTP response."><DataTable columns={columns} rows={resultItems} rowKey={(row) => `${row.warehouse_code}-${row.partner_sku}`} emptyTitle="Look up a SKU to see stock" /></Panel>
  </div>
}

function PricingPanel({ notify }) {
  const pricingGet = useAsyncAction(noonApi.pricingGet)
  const pricingUpsert = useAsyncAction(noonApi.pricingUpsert)
  const [sku, setSku] = useState('Hub-312')
  const [country, setCountry] = useState('eg')
  const [sellingPrice, setSellingPrice] = useState('255')
  const [listPrice, setListPrice] = useState('270')
  const [active, setActive] = useState(true)

  const rows = pricingGet.result?.items || []
  const columns = [
    { key: 'partner_sku', label: 'Seller SKU' },
    { key: 'country_code', label: 'Marketplace', render: (row) => COUNTRY_LABELS[row.country_code] || row.country_code?.toUpperCase() },
    { key: 'price', label: 'Selling price', render: (row) => row.price ?? '—' },
    { key: 'msrp', label: 'List price (MSRP)', render: (row) => row.msrp ?? '—' },
    { key: 'is_active', label: 'Listing', render: (row) => <StatusBadge tone={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'status', label: 'API status', render: (row) => <StatusBadge tone={apiStatus(row) === 'OK' ? 'success' : 'warning'}>{apiStatus(row)}</StatusBadge> },
  ]

  async function lookup() {
    const response = await pricingGet.run([{ partner_sku: sku.trim(), country_code: country }])
    const item = response?.items?.[0]
    if (!item) return
    if (item.price !== null && item.price !== undefined) setSellingPrice(String(item.price))
    if (item.msrp !== null && item.msrp !== undefined) setListPrice(String(item.msrp))
    if (typeof item.is_active === 'boolean') setActive(item.is_active)
  }

  async function save(event) {
    event.preventDefault()
    const response = await pricingUpsert.run([{ partner_sku: sku.trim(), country_code: country, price: Number(sellingPrice), msrp: Number(listPrice), is_active: active }])
    if (!response) return
    notify('Pricing update accepted. Reloading the authoritative Noon values.')
    await lookup()
  }

  return <div className="two-column-layout">
    <Panel title="Country pricing" description="Pricing is scoped by seller SKU and marketplace country.">
      <div className="form-grid">
        <Field label="Seller SKU" hint="Noon field: partner_sku"><input value={sku} onChange={(event) => setSku(event.target.value)} /></Field>
        <Field label="Marketplace country" hint="Noon field: country_code"><select value={country} onChange={(event) => setCountry(event.target.value)}>{Object.entries(COUNTRY_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <button className="secondary-button" type="button" onClick={lookup} disabled={pricingGet.busy}>{pricingGet.busy ? 'Loading…' : 'Get current pricing'}</button>
      </div>
      <form className="form-grid divider-form" onSubmit={save}>
        <Field label="Selling price" hint="Noon field: price"><input type="number" min="0" step="0.01" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} required /></Field>
        <Field label="List price (MSRP)" hint="Manufacturer suggested retail price"><input type="number" min="0" step="0.01" value={listPrice} onChange={(event) => setListPrice(event.target.value)} required /></Field>
        <label className="toggle-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Listing active</strong><small>Noon field: is_active</small></span></label>
        <button className="primary-button" disabled={pricingUpsert.busy}>{pricingUpsert.busy ? 'Saving…' : 'Save pricing'}</button>
      </form>
      <ErrorNotice error={pricingGet.error || pricingUpsert.error} />
    </Panel>
    <Panel title="Current Noon pricing" description="Values below come from pricing/get after the update."><DataTable columns={columns} rows={rows} rowKey={(row) => `${row.partner_sku}-${row.country_code}`} emptyTitle="No pricing loaded" /></Panel>
  </div>
}
