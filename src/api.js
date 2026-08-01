/**
 * API client for the user-35 Noon integration.
 *
 * The deployed service is intentionally fixed to the test service1 host. A
 * Vite environment override remains available for local development.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://test.connecto-me.com/service1').replace(/\/$/, '')

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || payload?.raw || `Request failed (${response.status})`
    const error = new Error(detail)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

const json = (path, body, method = 'POST') => apiRequest(path, { method, body: JSON.stringify(body) })

export const noonApi = {
  stockGet: (items) => json('/new_noon/stock/get', { items }),
  stockUpdate: (items) => json('/new_noon/stock/update', { items }),
  exportCategories: () => apiRequest('/new_noon/reports/export-categories'),
  createExport: (export_category_code, params) => json('/new_noon/reports/exports', { export_category_code, params }),
  exportStatus: (export_code) => json('/new_noon/reports/export-status', { export_code }),
  pricingGet: (items) => json('/new_noon/pricing/get', { items }),
  pricingUpsert: (items) => json('/new_noon/pricing/upsert', { items }),
  crossBorderProductUpsert: (items) => json('/new_noon/cross-border/products/upsert', { items }),
  transferPricesGet: (items) => json('/new_noon/cross-border/transfer-prices/get', { items }),
  transferPricesUpsert: (items) => json('/new_noon/cross-border/transfer-prices/upsert', { items }),
  categories: () => json('/new_noon/products/categories', {}),
  categoryAttributes: (category_code) => json('/new_noon/products/category-attributes', { category_code }),
  productUpsert: (body) => json('/new_noon/products/upsert', body),
  productContent: (sku_parent) => json('/new_noon/products/content', { sku_parent }),
  mapBarcodes: (items) => json('/new_noon/catalog/barcodes/map', { items }),
  deleteParentSkus: (items) => json('/new_noon/catalog/parent-skus/delete', { items }),
  deleteChildSkus: (items) => json('/new_noon/catalog/child-skus/delete', { items }),
  signedImportUrl: (file_type) => json('/new_noon/catalog/imports/signed-url', { file_type }),
  barcodeImport: (body) => json('/new_noon/catalog/imports/barcodes', body),
  importStatus: (reference) => apiRequest(`/new_noon/catalog/imports/${encodeURIComponent(reference)}`),
  fbpiOrder: (orderNr) => apiRequest(`/new_noon/fbpi/orders/${encodeURIComponent(orderNr)}`),
  fbpiAwbs: (country_code, qty) => json('/new_noon/fbpi/shipments/awbs', { country_code, qty }),
  createFbpiShipment: (body) => json('/new_noon/fbpi/shipments', body),
  fbpiShipment: (warehouse_code, integration_shipment_nr) => json('/new_noon/fbpi/shipments/get', { warehouse_code, integration_shipment_nr }),
}

export const TARGET_WAREHOUSE = 'W00172296EG'
export const TARGET_USER_ID = 35
export const DEFAULT_SKU = 'Hub-201'
