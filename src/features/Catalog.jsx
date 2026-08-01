import { useDeferredValue, useMemo, useState } from 'react'
import { DEFAULT_SKU, noonApi } from '../api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { categoryLabel, humanize } from '../utils/format'
import { DataTable, EmptyState, ErrorNotice, Field, Icon, Modal, Panel, StatusBadge, Tabs } from '../components/ui'

const STEPS = ['Product identity', 'Category & attributes', 'Variants & media', 'Review & submit']

function MetadataDialog({ categories, attributes, selectedCategory, selectedAttributes, onLoadAttributes, onToggleAttribute, onChooseCategory, onClose, loading, error }) {
  const [tab, setTab] = useState('categories')
  const [categorySearch, setCategorySearch] = useState('')
  const [attributeSearch, setAttributeSearch] = useState('')
  const [candidate, setCandidate] = useState(selectedCategory)
  const deferredCategorySearch = useDeferredValue(categorySearch.toLowerCase())
  const deferredAttributeSearch = useDeferredValue(attributeSearch.toLowerCase())
  const filteredCategories = useMemo(() => categories.filter((code) => code.toLowerCase().includes(deferredCategorySearch)).slice(0, 150), [categories, deferredCategorySearch])
  const filteredAttributes = useMemo(() => attributes.filter((item) => `${item.attribute_code} ${item.attribute_type}`.toLowerCase().includes(deferredAttributeSearch)), [attributes, deferredAttributeSearch])

  async function inspectAttributes() {
    if (!candidate) return
    await onLoadAttributes(candidate)
    setTab('attributes')
  }

  const categoryColumns = [
    { key: 'choose', label: '', render: (code) => <input type="radio" name="category" checked={candidate === code} onChange={() => setCandidate(code)} aria-label={`Choose ${code}`} /> },
    { key: 'name', label: 'Category', render: (code) => <div className="category-cell"><strong>{categoryLabel(code)}</strong><small>{code}</small></div> },
    { key: 'department', label: 'Department', render: (code) => humanize(code.split('-')[0]) },
  ]
  const attributeColumns = [
    { key: 'choose', label: '', render: (item) => <input type="checkbox" checked={item.is_mandatory || selectedAttributes.has(item.attribute_code)} disabled={item.is_mandatory} onChange={() => onToggleAttribute(item.attribute_code)} aria-label={`Use ${item.attribute_code}`} /> },
    { key: 'attribute_code', label: 'Attribute', render: (item) => <div className="category-cell"><strong>{humanize(item.attribute_code)}</strong><small>{item.attribute_code}</small></div> },
    { key: 'attribute_type', label: 'Input type', render: (item) => humanize(item.attribute_type?.replace('ATTRIBUTE_TYPE_', '')) },
    { key: 'required', label: 'Requirement', render: (item) => <StatusBadge tone={item.is_mandatory ? 'warning' : 'neutral'}>{item.is_mandatory ? 'Required' : 'Optional'}</StatusBadge> },
    { key: 'options', label: 'Options', render: (item) => item.attribute_options?.length || 0 },
  ]

  return <Modal title="Product category and attributes" description="Search Noon's live catalog metadata, then choose the fields for this product." onClose={onClose} wide footer={<><button className="secondary-button" onClick={onClose}>Cancel</button>{tab === 'categories' ? <button className="primary-button" disabled={!candidate || loading} onClick={inspectAttributes}>{loading ? 'Loading…' : 'Review category attributes'}</button> : <button className="primary-button" disabled={!candidate} onClick={() => { onChooseCategory(candidate); onClose() }}>Use selected category</button>}</>}>
    <Tabs items={[{ value: 'categories', label: 'Categories' }, { value: 'attributes', label: `Attributes (${attributes.length})` }]} value={tab} onChange={setTab} />
    <ErrorNotice error={error} />
    {tab === 'categories' ? <><div className="modal-filter-row"><div className="search-control"><Icon name="search" size={16} /><input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Filter category name or code" /></div><span>{filteredCategories.length} shown of {categories.length}</span></div><DataTable columns={categoryColumns} rows={filteredCategories} rowKey={(code) => code} emptyTitle="No matching categories" /></> : <><div className="modal-filter-row"><div className="search-control"><Icon name="search" size={16} /><input value={attributeSearch} onChange={(event) => setAttributeSearch(event.target.value)} placeholder="Filter attributes" /></div><span>{selectedAttributes.size} selected</span></div>{attributes.length ? <DataTable columns={attributeColumns} rows={filteredAttributes} rowKey={(item) => item.attribute_code} emptyTitle="No matching attributes" /> : <EmptyState title="Select a category first" message="Choose a category and load its supported attributes." />}</>}
  </Modal>
}

function AttributeField({ attribute, value, onChange }) {
  const options = attribute.attribute_options || []
  const label = `${humanize(attribute.attribute_code)}${attribute.is_mandatory ? ' *' : ''}`
  const hint = attribute.is_localizable ? 'English value; localized fields are submitted with LANGUAGE_EN.' : humanize(attribute.attribute_type?.replace('ATTRIBUTE_TYPE_', ''))
  if (options.length) return <Field label={label} hint={hint}><select value={value || ''} onChange={(event) => onChange(event.target.value)} required={attribute.is_mandatory}><option value="">Choose an option</option>{options.map((option, index) => { const optionValue = option.value ?? option.code ?? option.name ?? String(index); return <option key={optionValue} value={optionValue}>{option.label || option.display_name || humanize(optionValue)}</option> })}</select></Field>
  if (attribute.attribute_type === 'ATTRIBUTE_TYPE_NUMBER') return <Field label={label} hint={hint}><input type="number" value={value || ''} onChange={(event) => onChange(event.target.value)} required={attribute.is_mandatory} min={attribute.number_min ?? undefined} max={attribute.number_max ?? undefined} /></Field>
  return <Field label={label} hint={hint}><input value={value || ''} onChange={(event) => onChange(event.target.value)} required={attribute.is_mandatory} minLength={attribute.min_characters || undefined} maxLength={attribute.max_characters || undefined} /></Field>
}

function CreateProduct({ notify }) {
  const categoryRequest = useAsyncAction(noonApi.categories)
  const attributeRequest = useAsyncAction(noonApi.categoryAttributes)
  const upsert = useAsyncAction(noonApi.productUpsert)
  const [step, setStep] = useState(0)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [identity, setIdentity] = useState({ partnerSku: DEFAULT_SKU, brand: '', titleEn: '', titleAr: '' })
  const [category, setCategory] = useState('')
  const [attributes, setAttributes] = useState([])
  const [selectedAttributes, setSelectedAttributes] = useState(() => new Set())
  const [attributeValues, setAttributeValues] = useState({})
  const [variants, setVariants] = useState([{ partner_sku: DEFAULT_SKU, size: '' }])
  const [images, setImages] = useState([{ url: '' }])
  const [submitted, setSubmitted] = useState(null)

  const categories = categoryRequest.result?.categories || []
  const chosenAttributes = attributes.filter((item) => item.is_mandatory || selectedAttributes.has(item.attribute_code)).filter((item) => item.attribute_code !== 'product_title')

  async function openMetadata() {
    setMetadataOpen(true)
    if (!categories.length) await categoryRequest.run()
  }

  async function loadAttributes(code) {
    const response = await attributeRequest.run(code)
    const list = response?.attributes || []
    setAttributes(list)
    setSelectedAttributes(new Set(list.filter((item) => item.is_mandatory).map((item) => item.attribute_code)))
  }

  function chooseCategory(code) {
    setCategory(code)
    if (!attributes.length) loadAttributes(code)
  }

  function toggleAttribute(code) {
    setSelectedAttributes((current) => { const next = new Set(current); if (next.has(code)) next.delete(code); else next.add(code); return next })
  }

  function updateIdentity(key, value) {
    setIdentity((current) => ({ ...current, [key]: value }))
    if (key === 'partnerSku') setVariants((current) => current.map((item, index) => index === 0 ? { ...item, partner_sku: value } : item))
  }

  function stepValid(index) {
    if (index === 0) return Boolean(identity.partnerSku.trim() && identity.brand.trim() && identity.titleEn.trim())
    if (index === 1) return Boolean(category && chosenAttributes.every((item) => !item.is_mandatory || String(attributeValues[item.attribute_code] || '').trim()))
    if (index === 2) return Boolean(variants.length && variants.every((item) => item.partner_sku.trim()) && images.length && images.every((item) => item.url.trim()))
    return true
  }

  function next() {
    if (!stepValid(step)) return notify('Complete the required fields before continuing.', 'warning')
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  async function submit() {
    const productAttributes = {
      product_title: { values: [{ value: identity.titleEn.trim(), language: 'LANGUAGE_EN' }, ...(identity.titleAr.trim() ? [{ value: identity.titleAr.trim(), language: 'LANGUAGE_AR' }] : [])] },
    }
    chosenAttributes.forEach((attribute) => {
      const value = attributeValues[attribute.attribute_code]
      if (value !== undefined && value !== '') productAttributes[attribute.attribute_code] = { values: [{ value, ...(attribute.is_localizable ? { language: 'LANGUAGE_EN' } : {}) }] }
    })
    const response = await upsert.run({ skus: variants.map((item) => ({ partner_sku: item.partner_sku.trim(), ...(item.size.trim() ? { size: item.size.trim() } : {}) })), brand: identity.brand.trim(), category, images: images.map((item, index) => ({ url: item.url.trim(), sort: index + 1 })), attributes: productAttributes })
    if (response) {
      setSubmitted(response)
      notify(response?.status?.status_id === 0 ? 'Product submitted successfully.' : 'Product submitted with Noon content warnings.', response?.status?.status_id === 0 ? 'success' : 'warning')
    }
  }

  const variantColumns = [
    { key: 'partner_sku', label: 'Seller SKU' },
    { key: 'sku', label: 'Noon SKU' },
    { key: 'psku_code', label: 'PSKU code' },
    { key: 'size', label: 'Size' },
  ]

  return <>
    <div className="wizard-progress">{STEPS.map((label, index) => <button key={label} className={`${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} onClick={() => { if (index <= step || STEPS.slice(0, index).every((_, prior) => stepValid(prior))) setStep(index) }}><span>{index < step ? <Icon name="check" size={13} /> : index + 1}</span>{label}</button>)}</div>
    <div className="wizard-layout"><Panel title={STEPS[step]} description="The dashboard builds the validated Noon request from these fields." className="wizard-main">
      {step === 0 ? <div className="form-grid"><Field label="Seller SKU *" hint="Your unique partner_sku"><input value={identity.partnerSku} onChange={(event) => updateIdentity('partnerSku', event.target.value)} /></Field><Field label="Brand *"><input value={identity.brand} onChange={(event) => updateIdentity('brand', event.target.value)} placeholder="Registered brand name" /></Field><Field label="Product title — English *"><input value={identity.titleEn} onChange={(event) => updateIdentity('titleEn', event.target.value)} /></Field><Field label="Product title — Arabic"><input dir="rtl" value={identity.titleAr} onChange={(event) => updateIdentity('titleAr', event.target.value)} /></Field></div> : null}
      {step === 1 ? <><div className="category-selection"><div><span>Noon category</span><strong>{category ? categoryLabel(category) : 'Not selected'}</strong><small>{category || 'Choose from the live Noon hierarchy.'}</small></div><button className="secondary-button" onClick={openMetadata}>{category ? 'Change category' : 'Choose category'}</button></div>{category ? <div className="form-grid attribute-form">{chosenAttributes.map((attribute) => <AttributeField key={attribute.attribute_code} attribute={attribute} value={attributeValues[attribute.attribute_code]} onChange={(value) => setAttributeValues((current) => ({ ...current, [attribute.attribute_code]: value }))} />)}</div> : <EmptyState title="Choose a Noon category" message="The required fields are different for every category." action={<button className="primary-button" onClick={openMetadata}>Browse categories</button>} />}</> : null}
      {step === 2 ? <><h4 className="section-label">Variants</h4><div className="repeat-list">{variants.map((variant, index) => <div className="repeat-row" key={index}><Field label="Seller SKU"><input value={variant.partner_sku} onChange={(event) => setVariants((current) => current.map((item, row) => row === index ? { ...item, partner_sku: event.target.value } : item))} /></Field><Field label="Size"><input value={variant.size} onChange={(event) => setVariants((current) => current.map((item, row) => row === index ? { ...item, size: event.target.value } : item))} placeholder="Optional for single-size products" /></Field><button className="icon-button danger-icon" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, row) => row !== index))} aria-label="Remove variant"><Icon name="trash" /></button></div>)}</div><button className="text-button" onClick={() => setVariants((current) => [...current, { partner_sku: '', size: '' }])}><Icon name="plus" size={15} /> Add another variant</button><h4 className="section-label">Product images</h4><div className="repeat-list">{images.map((image, index) => <div className="repeat-row media-row" key={index}><Field label={`Image URL ${index + 1}`} hint={`Noon image sort: ${index + 1}`}><input type="url" value={image.url} onChange={(event) => setImages((current) => current.map((item, row) => row === index ? { url: event.target.value } : item))} /></Field><button className="icon-button danger-icon" disabled={images.length === 1} onClick={() => setImages((current) => current.filter((_, row) => row !== index))} aria-label="Remove image"><Icon name="trash" /></button></div>)}</div><button className="text-button" onClick={() => setImages((current) => [...current, { url: '' }])}><Icon name="plus" size={15} /> Add another image</button></> : null}
      {step === 3 ? <div className="review-list"><div><span>Product</span><strong>{identity.titleEn}</strong><small>{identity.brand}</small></div><div><span>Category</span><strong>{categoryLabel(category)}</strong><small>{category}</small></div><div><span>Variants</span><strong>{variants.length}</strong><small>{variants.map((item) => item.partner_sku).join(', ')}</small></div><div><span>Images</span><strong>{images.length}</strong><small>Sorted from 1 to {images.length}</small></div><div><span>Attributes</span><strong>{chosenAttributes.length + 1}</strong><small>Required and selected product fields</small></div></div> : null}
      <ErrorNotice error={categoryRequest.error || attributeRequest.error || upsert.error} />
      <div className="wizard-actions"><button className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Back</button>{step < STEPS.length - 1 ? <button className="primary-button" onClick={next}>Save and continue <Icon name="arrow" size={15} /></button> : <button className="primary-button" onClick={submit} disabled={upsert.busy}>{upsert.busy ? 'Submitting…' : 'Submit product to Noon'}</button>}</div>
    </Panel><aside className="wizard-review"><Panel title="Completion checklist"><ul className="checklist"><li className={identity.partnerSku ? 'done' : ''}>Seller SKU</li><li className={identity.titleEn ? 'done' : ''}>English title</li><li className={identity.brand ? 'done' : ''}>Brand</li><li className={category ? 'done' : ''}>Noon category</li><li className={chosenAttributes.length && stepValid(1) ? 'done' : ''}>Required attributes</li><li className={variants.every((item) => item.partner_sku) ? 'done' : ''}>Variants</li><li className={images.every((item) => item.url) ? 'done' : ''}>Images</li></ul></Panel><Panel title="Product preview"><div className="product-preview">{images[0]?.url ? <img src={images[0].url} alt="Product preview" /> : <span><Icon name="box" size={25} /></span>}<strong>{identity.titleEn || 'Product title'}</strong><small>{identity.brand || 'Brand'}</small><small>{category ? categoryLabel(category) : 'Category not selected'}</small></div></Panel></aside></div>
    {metadataOpen ? <MetadataDialog categories={categories} attributes={attributes} selectedCategory={category} selectedAttributes={selectedAttributes} onLoadAttributes={loadAttributes} onToggleAttribute={toggleAttribute} onChooseCategory={chooseCategory} onClose={() => setMetadataOpen(false)} loading={categoryRequest.busy || attributeRequest.busy} error={categoryRequest.error || attributeRequest.error} /> : null}
    {submitted ? <Modal title={submitted?.status?.status_id === 0 ? 'Product submitted' : 'Product needs attention'} description={submitted?.status?.message || 'Review the returned product identifiers.'} onClose={() => setSubmitted(null)} wide><div className="success-summary"><div><span>Parent SKU</span><strong>{submitted.sku_parent || 'Pending'}</strong></div><div><span>API status</span><StatusBadge tone={submitted?.status?.status_id === 0 ? 'success' : 'warning'}>{submitted?.status?.status_code || 'Submitted'}</StatusBadge></div></div><DataTable columns={variantColumns} rows={submitted.variants || []} rowKey={(row) => row.partner_sku} emptyTitle="No variants returned yet" /></Modal> : null}
  </>
}

function ProductTools({ notify }) {
  const [tab, setTab] = useState('content')
  const content = useAsyncAction(noonApi.productContent)
  const barcodeMap = useAsyncAction(noonApi.mapBarcodes)
  const [parentSku, setParentSku] = useState('')
  const [partnerSku, setPartnerSku] = useState(DEFAULT_SKU)
  const [barcode, setBarcode] = useState('')
  const statuses = content.result?.statuses || []
  const statusColumns = [{ key: 'language', label: 'Language' }, { key: 'overall_status', label: 'Overall status', render: (row) => humanize(row.overall_status) }, { key: 'qc', label: 'QC status', render: (row) => <StatusBadge tone={row.qc?.status === 'QC_STATUS_APPROVED' ? 'success' : 'warning'}>{humanize(row.qc?.status)}</StatusBadge> }, { key: 'missing', label: 'Missing fields', render: (row) => row.content?.missing_attributes?.length || 0 }, { key: 'invalid', label: 'Invalid fields', render: (row) => row.content?.invalid_attributes?.length || 0 }]
  const mappingRows = barcodeMap.result?.items || (barcodeMap.result ? [{ partner_sku: partnerSku, barcode, status: barcodeMap.result.status }] : [])
  const mappingColumns = [{ key: 'partner_sku', label: 'Seller SKU' }, { key: 'barcode', label: 'Barcode' }, { key: 'status', label: 'API status', render: (row) => <StatusBadge tone={(row.status?.status_code || 'OK') === 'OK' ? 'success' : 'warning'}>{row.status?.status_code || 'OK'}</StatusBadge> }]
  async function map(event) { event.preventDefault(); const response = await barcodeMap.run([{ partner_sku: partnerSku.trim(), barcode: barcode.trim(), force_map: true }]); if (response) notify('Barcode mapping submitted.') }
  return <><Tabs items={[{ value: 'content', label: 'Content and QC' }, { value: 'barcode', label: 'Barcode mapping' }]} value={tab} onChange={setTab} />{tab === 'content' ? <Panel title="Product content and quality" description="Use the parent SKU returned by product creation."><form className="inline-form" onSubmit={(event) => { event.preventDefault(); content.run(parentSku.trim()) }}><Field label="Noon parent SKU"><input value={parentSku} onChange={(event) => setParentSku(event.target.value)} /></Field><button className="primary-button" disabled={!parentSku.trim() || content.busy}>Check content</button></form><ErrorNotice error={content.error} />{content.result ? <><div className="success-summary"><div><span>Parent SKU</span><strong>{content.result.sku_parent}</strong></div><div><span>Images</span><strong>{content.result.images?.length || 0}</strong></div></div><DataTable columns={statusColumns} rows={statuses} rowKey={(row, index) => row.language || index} emptyTitle="No content statuses returned" /></> : null}</Panel> : <Panel title="Map a barcode" description="Associate one barcode with a seller SKU."><form className="form-grid" onSubmit={map}><Field label="Seller SKU"><input value={partnerSku} onChange={(event) => setPartnerSku(event.target.value)} /></Field><Field label="Barcode"><input value={barcode} onChange={(event) => setBarcode(event.target.value)} /></Field><button className="primary-button" disabled={!partnerSku.trim() || !barcode.trim() || barcodeMap.busy}>Map barcode</button></form><ErrorNotice error={barcodeMap.error} /><DataTable columns={mappingColumns} rows={mappingRows} rowKey={(row) => `${row.partner_sku}-${row.barcode}`} emptyTitle="No barcode operation yet" /></Panel>}</>
}

export function Catalog({ notify }) {
  const [view, setView] = useState('create')
  return <><Tabs items={[{ value: 'create', label: 'Create product' }, { value: 'tools', label: 'Product tools' }]} value={view} onChange={setView} />{view === 'create' ? <CreateProduct notify={notify} /> : <ProductTools notify={notify} />}</>
}
