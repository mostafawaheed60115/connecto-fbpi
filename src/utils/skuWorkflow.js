import { displayValue, isFailureStatus } from './format.js'

export function firstGeneratedSku(response) {
  if (!Array.isArray(response?.skus)) return ''
  const sku = response.skus.find((value) => typeof value === 'string' && value.trim())
  return sku ? sku.trim() : ''
}

export function generatedSkuFailureMessage(response) {
  if (!isFailureStatus(response?.status)) return ''
  return displayValue(response.status?.message) || displayValue(response.status?.status_code) || 'Noon rejected the SKU generation request.'
}

export function skuMappingItem(partnerSku, nskuChild, forceMap = false) {
  return {
    partner_sku: String(partnerSku || '').trim(),
    nsku_child: String(nskuChild || '').trim(),
    ...(forceMap ? { force_map: true } : {}),
  }
}

export function skuMappingFailureMessage(response) {
  const items = Array.isArray(response?.items) ? response.items : []
  if (!items.length) return 'Noon returned no mapping result.'
  const failed = items.find((item) => isFailureStatus(item.status))
  if (!failed) return ''
  return displayValue(failed.status?.message) || displayValue(failed.status?.status_code) || 'Noon rejected the mapping.'
}
