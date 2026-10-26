import { displayValue, isFailureStatus } from './format.js'

export function firstGeneratedSku(response) {
  if (!Array.isArray(response?.skus)) return ''
  const sku = response.skus.find((value) => typeof value === 'string' && value.trim())
  return sku ? sku.trim() : ''
}

export function extractGeneratedSkus(response) {
  if (!Array.isArray(response?.skus)) return []
  return response.skus
    .map((sku) => {
      if (typeof sku === 'string') return sku.trim()
      if (sku && typeof sku.value === 'string') return sku.value.trim()
      return ''
    })
    .filter(Boolean)
}

export function parseNskuList(input = '') {
  if (Array.isArray(input)) return input.map((val) => String(val || '').trim()).filter(Boolean)
  if (typeof input !== 'string') return []
  return input
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function skuMappingItem(partnerSku, nskuChild, forceMap = false) {
  return {
    partner_sku: String(partnerSku || '').trim(),
    nsku_child: String(nskuChild || '').trim(),
    ...(forceMap ? { force_map: true } : {}),
  }
}

export function buildBatchMappingItems(skus = [], nskus = [], forceMap = false) {
  const cleanSkus = (Array.isArray(skus) ? skus : [skus]).map((s) => String(s || '').trim()).filter(Boolean)
  const cleanNskus = (Array.isArray(nskus) ? nskus : [nskus]).map((n) => String(n || '').trim()).filter(Boolean)

  if (!cleanSkus.length) return []
  if (!cleanNskus.length) {
    return cleanSkus.map((sku) => skuMappingItem(sku, '', forceMap))
  }

  // If one NSKU is given for multiple SKUs, map each SKU to that target NSKU
  if (cleanNskus.length === 1 && cleanSkus.length > 1) {
    return cleanSkus.map((sku) => skuMappingItem(sku, cleanNskus[0], forceMap))
  }

  // Otherwise, match 1-to-1 by index
  return cleanSkus.map((sku, index) => skuMappingItem(sku, cleanNskus[index] || '', forceMap))
}

export function generatedSkuFailureMessage(response) {
  if (!isFailureStatus(response?.status)) return ''
  return displayValue(response.status?.message) || displayValue(response.status?.status_code) || 'Noon rejected the SKU generation request.'
}

export function skuMappingFailureMessage(response) {
  const items = Array.isArray(response?.items) ? response.items : []
  if (!items.length) return 'Noon returned no mapping result.'
  const failed = items.find((item) => isFailureStatus(item.status))
  if (!failed) return ''
  return displayValue(failed.status?.message) || displayValue(failed.status?.status_code) || 'Noon rejected the mapping.'
}

export function buildGenerateAndMapPayload({ mode = 'single', nsku = '', count = 1, rows = [], forceMap = true } = {}) {
  if (mode === 'single') {
    const cleanNsku = String(nsku || '').trim()
    const cleanCount = Math.max(1, Math.min(200, parseInt(count, 10) || 1))
    return {
      nsku: cleanNsku,
      count: cleanCount,
      force_map: Boolean(forceMap),
    }
  }

  const items = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      nsku: String(r.nsku || r.nsku_child || '').trim(),
      count: Math.max(1, Math.min(200, parseInt(r.count || r.quantity, 10) || 1)),
    }))
    .filter((r) => Boolean(r.nsku))

  return {
    items,
    force_map: Boolean(forceMap),
  }
}
