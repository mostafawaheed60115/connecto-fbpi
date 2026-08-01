import { useMemo, useState } from 'react'
import { noonApi } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { DataTable, ErrorNotice, Field, Icon, Panel, StatusBadge } from '../components/ui'

export function Returns({ notify }) {
  const lookup = useAsyncAction(noonApi.returnReferences)
  const [barcode, setBarcode] = useState('')
  const [merchantCodes, setMerchantCodes] = useState('')
  const rows = useMemo(() => (lookup.result?.items || []).flatMap((item) => {
    const references = item.references?.length ? item.references : [{ barcode: '—', barcode_type: '—' }]
    return references.map((reference, index) => ({ ...item, reference_barcode: reference.barcode, barcode_type: reference.barcode_type, rowKey: `${item.purchase_item_nr}-${reference.barcode}-${index}` }))
  }), [lookup.result])
  const columns = [
    { key: 'purchase_item_nr', label: 'Purchase item' },
    { key: 'partner_sku', label: 'Seller SKU' },
    { key: 'merchant_code', label: 'Merchant' },
    { key: 'mp_code', label: 'Marketplace', render: (row) => row.mp_code?.toUpperCase() || '—' },
    { key: 'reference_barcode', label: 'Return reference' },
    { key: 'barcode_type', label: 'Reference type', render: (row) => <StatusBadge tone="neutral">{row.barcode_type?.replaceAll('_', ' ')}</StatusBadge> },
  ]
  async function submit(event) {
    event.preventDefault()
    const codes = merchantCodes.split(',').map((value) => value.trim()).filter(Boolean)
    const response = await lookup.run(barcode.trim(), codes)
    if (response) notify(`${response.items?.length || 0} return items found.`)
  }
  return <div className="returns-layout">
    <Panel title="Find return references" description="Scan or enter a return barcode. Merchant codes are optional and may be comma-separated.">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Return barcode" hint="Required by Noon"><div className="input-with-icon"><Icon name="search" size={16} /><input autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan AWB or RMS barcode" /></div></Field>
        <Field label="Merchant codes" hint="Optional; maximum 200"><input value={merchantCodes} onChange={(event) => setMerchantCodes(event.target.value)} placeholder="STR123, STR456" /></Field>
        <button className="primary-button" disabled={!barcode.trim() || lookup.busy}>{lookup.busy ? 'Searching…' : 'Find returns'}</button>
      </form>
      <ErrorNotice error={lookup.error} />
    </Panel>
    <Panel title="Return items" description="Each barcode reference is shown as its own table row." className="full-width-panel"><DataTable columns={columns} rows={rows} rowKey={(row) => row.rowKey} emptyTitle="No return lookup yet" /></Panel>
  </div>
}
