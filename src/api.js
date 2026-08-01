/**
 * API client for the private Noon operations dashboard.
 *
 * The deployed service is intentionally fixed to the test service1 host. A
 * Vite environment override remains available for local development.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://test.connecto-me.com/service1').replace(/\/$/, '')
export const SESSION_TOKEN_KEY = 'connecto-fbpi-session-v1'
export const SESSION_EXPIRED_EVENT = 'connecto:session-expired'

export const hasSession = () => Boolean(sessionStorage.getItem(SESSION_TOKEN_KEY))
export const clearSession = () => sessionStorage.removeItem(SESSION_TOKEN_KEY)

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

export async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY)
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    if (response.status === 401 && token) {
      clearSession()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    const detail = payload?.detail || payload?.message || payload?.raw || `Request failed (${response.status})`
    const error = new Error(detail)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

const json = (path, body, method = 'POST') => apiRequest(path, { method, body: JSON.stringify(body) })

export async function createDashboardSession(password) {
  const response = await fetch(`${API_BASE}/new_noon/dashboard/session`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
  const payload = await parseResponse(response)
  if (!response.ok || !payload?.access_token) throw new Error(payload?.detail || 'Unable to sign in')
  sessionStorage.setItem(SESSION_TOKEN_KEY, payload.access_token)
}

export const noonApi = {
  stockGet: (items) => json('/new_noon/stock/get', { items }),
  stockUpdate: (items) => json('/new_noon/stock/update', { items }),
  warehouses: (filters = { fulfillment_system_code: 'fbpi' }) => json('/new_noon/warehouses/list', { filters }),
  exportCategories: () => apiRequest('/new_noon/reports/export-categories'),
  createExport: (export_category_code, params) => json('/new_noon/reports/exports', { export_category_code, params }),
  exportStatus: (export_code) => json('/new_noon/reports/export-status', { export_code }),
  pricingGet: (items) => json('/new_noon/pricing/get', { items }),
  pricingUpsert: (items) => json('/new_noon/pricing/upsert', { items }),
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
  fbpiOrders: (limit = 100, unreadOnly = false) => apiRequest(`/new_noon/fbpi/orders?limit=${limit}&unread_only=${unreadOnly}`),
  markFbpiOrdersRead: (order_nrs) => json('/new_noon/fbpi/orders/mark-read', { order_nrs }),
  fbpiOrder: (orderNr) => apiRequest(`/new_noon/fbpi/orders/${encodeURIComponent(orderNr)}`),
  fbpiAwbs: (country_code, qty) => json('/new_noon/fbpi/shipments/awbs', { country_code, qty }),
  createFbpiShipment: (body) => json('/new_noon/fbpi/shipments', body),
  createFbpiShipmentsBulk: (shipments) => json('/new_noon/fbpi/shipments/bulk', { shipments }),
  fbpiShipment: (warehouse_code, integration_shipment_nr) => json('/new_noon/fbpi/shipments/get', { warehouse_code, integration_shipment_nr }),
  returnReferences: (barcode, merchant_codes) => json('/new_noon/returns/references/list', { barcode, ...(merchant_codes?.length ? { merchant_codes } : {}) }),
}

export const TARGET_WAREHOUSE = 'W00172296EG'
export const DEFAULT_SKU = 'Hub-201'
