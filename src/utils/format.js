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
  if (items.some((item) => item.cancellation_reason_code)) return { key: 'cancelled', label: 'Cancelled', tone: 'danger' }
  if (items.every((item) => item.integration_status === 'INTEGRATION_ITEM_STATUS_SHIPPED')) return { key: 'shipped', label: 'Shipped', tone: 'success' }
  if (items.every((item) => item.mp_status === 'MP_ITEM_STATUS_CONFIRMED' && item.integration_status === 'INTEGRATION_ITEM_STATUS_ACKNOWLEDGED')) return { key: 'ready', label: 'Ready to ship', tone: 'info' }
  return { key: 'processing', label: 'Processing', tone: 'warning' }
}

export function extractAwbs(payload) {
  const items = payload?.awbs || payload?.items || []
  return items.map((item) => ({ courier: item.courier || 'noon', awb_nr: item.awb_nr || item.awb })).filter((item) => item.awb_nr)
}
