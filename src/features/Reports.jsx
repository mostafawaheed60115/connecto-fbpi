import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { noonApi } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { formatDate, humanize } from '../utils/format'
import { DataTable, EmptyState, ErrorNotice, Field, Icon, Modal, Panel, StatusBadge } from '../components/ui'

const FINAL_EXPORT_STATES = new Set(['COMPLETE', 'COMPLETED', 'FAILED', 'ERROR', 'CANCELLED'])
const SUCCESS_EXPORT_STATES = new Set(['COMPLETE', 'COMPLETED'])
const POLL_INTERVAL_MS = 4_000
const MAX_POLL_ATTEMPTS = 24

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function normalizedStatus(value) {
  return String(value || 'QUEUED').replace('EXPORT_STATUS_', '').toUpperCase()
}

function ReportCategoryDialog({ categories, selected, onSelect, onClose, loading, error }) {
  const [search, setSearch] = useState('')
  const [candidate, setCandidate] = useState(selected?.export_category_code || '')
  const deferredSearch = useDeferredValue(search.toLowerCase())
  const filtered = useMemo(
    () => categories.filter((item) => String(item.export_category_code).toLowerCase().includes(deferredSearch)),
    [categories, deferredSearch],
  )
  const columns = [
    { key: 'choose', label: '', render: (row) => <input type="radio" name="report-category" checked={candidate === row.export_category_code} onChange={() => setCandidate(row.export_category_code)} aria-label={`Choose ${row.export_category_code}`} /> },
    { key: 'export_category_code', label: 'Report category', render: (row) => <div className="category-cell"><strong>{humanize(row.export_category_code)}</strong><small>{row.export_category_code}</small></div> },
    { key: 'required', label: 'Required parameters', render: (row) => Object.entries(row.params?.fields || {}).filter(([, config]) => config.required).map(([name]) => humanize(name)).join(', ') || 'None' },
    { key: 'optional', label: 'Optional parameters', render: (row) => Object.entries(row.params?.fields || {}).filter(([, config]) => !config.required).map(([name]) => humanize(name)).join(', ') || 'None' },
  ]
  const chosen = categories.find((item) => item.export_category_code === candidate)

  return <Modal
    title="Choose a report category"
    description="Filter Noon's available exports and review their required parameters."
    onClose={onClose}
    wide
    footer={<>
      <button className="secondary-button" onClick={onClose}>Cancel</button>
      <button className="primary-button" disabled={!chosen} onClick={() => { onSelect(chosen); onClose() }}>Use selected category</button>
    </>}
  >
    <div className="modal-filter-row">
      <div className="search-control"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter report categories" /></div>
      <span>{filtered.length} available</span>
    </div>
    <ErrorNotice error={error} />
    {loading
      ? <div className="loading-state">Loading report categories…</div>
      : <DataTable columns={columns} rows={filtered} rowKey={(row) => row.export_category_code} emptyTitle="No report categories found" />}
  </Modal>
}

function ReportParameter({ name, config, value, onChange }) {
  const label = `${humanize(name)}${config.required ? ' *' : ''}`
  if (name.includes('date')) return <Field label={label}><input type="date" required={config.required} value={value || ''} onChange={(event) => onChange(event.target.value)} /></Field>
  if (name === 'country' || name === 'country_code') return <Field label={label}><select required={config.required} value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Choose country</option><option value="eg">Egypt</option><option value="ae">UAE</option><option value="sa">Saudi Arabia</option></select></Field>
  if (name === 'lang') return <Field label={label}><select required={config.required} value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Choose language</option><option value="en">English</option><option value="ar">Arabic</option></select></Field>
  if (name.startsWith('is_') || name.startsWith('aggregate_')) return <label className="toggle-field"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong><small>Optional switch</small></span></label>
  return <Field label={label}><input required={config.required} value={value || ''} onChange={(event) => onChange(event.target.value)} /></Field>
}

export function Reports({ notify }) {
  const categoriesRequest = useAsyncAction(noonApi.exportCategories)
  const createRequest = useAsyncAction(noonApi.createExport)
  const statusRequest = useAsyncAction(noonApi.exportStatus)
  const signedUrl = useAsyncAction(noonApi.signedImportUrl)
  const pollGenerationRef = useRef(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [params, setParams] = useState({})
  const [exportCode, setExportCode] = useState('')
  const [latestStatus, setLatestStatus] = useState(null)
  const [polling, setPolling] = useState(false)
  const [fileType, setFileType] = useState('FILE_TYPE_CSV')

  useEffect(() => () => { pollGenerationRef.current += 1 }, [])

  const categories = categoriesRequest.result?.export_categories || []
  const fields = selectedCategory?.params?.fields || {}

  async function openCategories() {
    setDialogOpen(true)
    if (!categories.length) await categoriesRequest.run()
  }

  function selectCategory(category) {
    setSelectedCategory(category)
    const defaults = {}
    Object.keys(category.params?.fields || {}).forEach((name) => {
      if (name === 'country' || name === 'country_code') defaults[name] = 'eg'
      if (name === 'lang') defaults[name] = 'en'
    })
    setParams(defaults)
  }

  async function checkStatus(code) {
    const response = await statusRequest.run(code)
    if (response) setLatestStatus(response)
    return response
  }

  async function pollExport(code) {
    const generation = ++pollGenerationRef.current
    setPolling(true)
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (generation !== pollGenerationRef.current) return
      const response = await checkStatus(code)
      if (!response || generation !== pollGenerationRef.current) {
        setPolling(false)
        return
      }
      const state = normalizedStatus(response.export_status)
      if (response.download_url || FINAL_EXPORT_STATES.has(state)) {
        setPolling(false)
        notify(
          SUCCESS_EXPORT_STATES.has(state) || response.download_url ? 'Report is ready to download.' : `Report finished with status: ${humanize(state)}.`,
          SUCCESS_EXPORT_STATES.has(state) || response.download_url ? 'success' : 'warning',
        )
        return
      }
      await delay(POLL_INTERVAL_MS)
    }
    if (generation === pollGenerationRef.current) {
      setPolling(false)
      notify('Noon is still preparing this report. Use Refresh status to continue checking.', 'warning')
    }
  }

  async function create(event) {
    event.preventDefault()
    pollGenerationRef.current += 1
    setLatestStatus(null)
    const cleanParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined))
    const response = await createRequest.run(selectedCategory.export_category_code, cleanParams)
    const code = response?.export_code || response?.code
    if (!code) return
    setExportCode(code)
    setLatestStatus({ ...response, export_code: code, export_category_code: selectedCategory.export_category_code, export_status: 'QUEUED' })
    notify('Report export created. Noon status will update automatically.')
    void pollExport(code)
  }

  async function refreshStatus(event) {
    event.preventDefault()
    const code = exportCode.trim()
    if (!code) return
    pollGenerationRef.current += 1
    const response = await checkStatus(code)
    if (response && !response.download_url && !FINAL_EXPORT_STATES.has(normalizedStatus(response.export_status))) void pollExport(code)
  }

  const status = latestStatus || createRequest.result
  const statusRows = status ? [{
    export_code: status.export_code || exportCode,
    export_category_code: status.export_category_code || selectedCategory?.export_category_code,
    export_status: status.export_status || 'QUEUED',
    updated_at: status.updated_at || status.created_at,
    download_url: status.download_url,
  }] : []
  const statusColumns = [
    { key: 'export_code', label: 'Export code' },
    { key: 'export_category_code', label: 'Report', render: (row) => humanize(row.export_category_code) },
    { key: 'export_status', label: 'Status', render: (row) => { const state = normalizedStatus(row.export_status); return <StatusBadge tone={SUCCESS_EXPORT_STATES.has(state) ? 'success' : FINAL_EXPORT_STATES.has(state) ? 'danger' : 'info'}>{humanize(state)}</StatusBadge> } },
    { key: 'updated_at', label: 'Last update', render: (row) => formatDate(row.updated_at) },
    { key: 'download_url', label: 'Download', render: (row) => { const state = normalizedStatus(row.export_status); if (row.download_url) return <a className="table-link" href={row.download_url} target="_blank" rel="noreferrer">Download report</a>; return FINAL_EXPORT_STATES.has(state) ? 'Not available' : 'Preparing' } },
  ]
  const uploadUrl = signedUrl.result?.signed_url || signedUrl.result?.upload_url || signedUrl.result?.url

  return <>
    <div className="two-column-layout">
      <Panel title="Create report export" description="Choose a live Noon category; its documented parameters become form fields automatically.">
        <div className="category-selection">
          <div><span>Report category</span><strong>{selectedCategory ? humanize(selectedCategory.export_category_code) : 'Not selected'}</strong><small>{selectedCategory?.export_category_code || 'Browse the available export types.'}</small></div>
          <button className="secondary-button" onClick={openCategories}>{selectedCategory ? 'Change category' : 'Choose category'}</button>
        </div>
        {selectedCategory
          ? <form className="form-grid divider-form" onSubmit={create}>
            {Object.entries(fields).map(([name, config]) => <ReportParameter key={name} name={name} config={config} value={params[name]} onChange={(value) => setParams((current) => ({ ...current, [name]: value }))} />)}
            {!Object.keys(fields).length ? <p className="form-note">This report has no parameters.</p> : null}
            <button className="primary-button" disabled={createRequest.busy || polling}>{createRequest.busy ? 'Creating export…' : 'Create report'}</button>
          </form>
          : <EmptyState title="Choose a report category" message="Required and optional parameters will appear here as normal form controls." />}
        <ErrorNotice error={categoriesRequest.error || createRequest.error} />
      </Panel>
      <Panel title="Export status" description="The dashboard checks Noon automatically until the report is ready.">
        <form className="inline-form" onSubmit={refreshStatus}>
          <Field label="Export code"><input value={exportCode} onChange={(event) => setExportCode(event.target.value)} /></Field>
          <button className="secondary-button" disabled={!exportCode.trim() || statusRequest.busy || polling}>{statusRequest.busy ? 'Checking…' : 'Refresh status'}</button>
        </form>
        {polling ? <div className="report-progress" role="status"><span className="status-light live" /><div><strong>Noon is preparing the report</strong><small>Status refreshes automatically every four seconds.</small></div></div> : null}
        {status && FINAL_EXPORT_STATES.has(normalizedStatus(status.export_status)) && !SUCCESS_EXPORT_STATES.has(normalizedStatus(status.export_status)) && !status.download_url
          ? <div className="friendly-error" role="alert"><strong>No download was generated</strong><span>Noon finished this export with status {normalizedStatus(status.export_status)}. Review the parameters or retry the report.</span></div>
          : null}
        <ErrorNotice error={statusRequest.error} />
        <DataTable columns={statusColumns} rows={statusRows} rowKey={(row) => row.export_code} emptyTitle="No export created" />
      </Panel>
    </div>
    <Panel title="Catalog import upload" description="Generate a signed upload URL without exposing a request body.">
      <div className="inline-form">
        <Field label="File format"><select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="FILE_TYPE_CSV">CSV</option><option value="FILE_TYPE_XLSX">Excel (.xlsx)</option><option value="FILE_TYPE_TSV">TSV</option></select></Field>
        <button className="primary-button" onClick={() => signedUrl.run(fileType)} disabled={signedUrl.busy}>{signedUrl.busy ? 'Generating…' : 'Generate upload URL'}</button>
      </div>
      <ErrorNotice error={signedUrl.error} />
      {uploadUrl ? <div className="signed-url-result"><span>Signed upload link</span><a href={uploadUrl} target="_blank" rel="noreferrer">Open secure upload URL</a></div> : null}
    </Panel>
    {dialogOpen ? <ReportCategoryDialog categories={categories} selected={selectedCategory} onSelect={selectCategory} onClose={() => setDialogOpen(false)} loading={categoriesRequest.busy} error={categoriesRequest.error} /> : null}
  </>
}
