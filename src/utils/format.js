export const COUNTRY_LABELS = { eg: 'Egypt', ae: 'UAE', sa: 'Saudi Arabia' }

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function humanize(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function categoryLabel(code = '') {
  const leaf = code.split('-').at(-1) || code
  return humanize(leaf)
}

export function orderState(order) {
  const items = order?.items || []
  if (!items.length) return { key: 'unavailable', label: 'Unavailable', tone: 'neutral' }
  const isCancelled = (item) => item.mp_status === 'MP_ITEM_STATUS_CANCELLED' || Boolean(item.cancellation_reason_code)
  const isOutOfStock = (item) => item.integration_status === 'INTEGRATION_ITEM_STATUS_OUT_OF_STOCK'
  const isShipped = (item) => item.integration_status === 'INTEGRATION_ITEM_STATUS_SHIPPED'
  const isAcknowledged = (item) => item.mp_status === 'MP_ITEM_STATUS_CONFIRMED' && item.integration_status === 'INTEGRATION_ITEM_STATUS_ACKNOWLEDGED'
  const isPending = (item) => !item.integration_status || item.integration_status === 'INTEGRATION_ITEM_STATUS_UNSPECIFIED'

  // These labels mirror Noon's documented item states. Mixed orders are
  // surfaced separately so an operator does not treat them as ready to ship.
  if (items.every(isShipped)) return { key: 'shipped', label: 'Shipped', tone: 'success' }
  if (items.every(isOutOfStock)) return { key: 'out_of_stock', label: 'Out of stock', tone: 'danger' }
  if (items.every(isCancelled)) return { key: 'cancelled', label: 'Cancelled', tone: 'danger' }
  if (items.every(isAcknowledged)) return { key: 'ready', label: 'Ready to ship', tone: 'info' }
  if (items.every(isPending)) return { key: 'pending', label: 'Pending acknowledgment', tone: 'warning' }
  if (items.some(isOutOfStock) || items.some(isCancelled)) return { key: 'attention', label: 'Partially unavailable', tone: 'warning' }
  if (items.some(isPending)) return { key: 'pending', label: 'Pending acknowledgment', tone: 'warning' }
  return { key: 'processing', label: 'Processing', tone: 'warning' }
}

export function extractAwbs(payload) {
  const items = payload?.awbs || payload?.items || []
  return items.map((item) => ({ courier: item.courier || 'noon', awb_nr: item.awb_nr || item.awb })).filter((item) => item.awb_nr)
}
