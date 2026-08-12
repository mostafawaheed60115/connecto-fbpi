import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createShipmentPayload,
  getProductSkus,
  getShipmentAwb,
  getShipmentIds,
  getShipmentRecords,
  suggestShipmentNumber,
} from '../src/features/shipmentWorkflow.js'

const order = {
  fbpi_order_nr: 'NEGI80035093808-IO-1',
  warehouse_code: 'W00172296EG',
  items: [{ mp_item_nr: 'NEGI80035093808-1' }],
}

test('builds a stable suggested shipment number', () => {
  assert.equal(
    suggestShipmentNumber(order.fbpi_order_nr, 1786119200077),
    'CONN-NEGI80035093808IO1-1786119200077',
  )
})

test('submits the operator shipment ID separately from the AWB', () => {
  const payload = createShipmentPayload(order, ' PH82114579236E ', ' MANUAL-SHIP-35 ')
  assert.equal(payload.integration_shipment_nr, 'MANUAL-SHIP-35')
  assert.equal(payload.awbs[0].awb_nr, 'PH82114579236E')
})

test('rehydrates the canonical shipment ID and AWB after refresh', () => {
  const refreshedOrder = {
    ...order,
    shipment_ids: ['MANUAL-SHIP-35'],
    shipments: [{
      integration_shipment_nr: 'MANUAL-SHIP-35',
      warehouse_code: 'W00172296EG',
      awb_nr: 'PH82114579236E',
    }],
  }
  assert.deepEqual(getShipmentIds(refreshedOrder), ['MANUAL-SHIP-35'])
  assert.equal(getShipmentAwb(refreshedOrder), 'PH82114579236E')
  assert.deepEqual(getShipmentRecords(refreshedOrder)[0], refreshedOrder.shipments[0])
})

test('deduplicates legacy IDs without losing the persisted AWB', () => {
  const refreshedOrder = {
    ...order,
    shipment_ids: ['MANUAL-SHIP-35'],
    shipments: [{ integration_shipment_nr: 'MANUAL-SHIP-35', awb_nr: 'PH82114579236E' }],
  }
  assert.deepEqual(getShipmentIds(refreshedOrder), ['MANUAL-SHIP-35'])
  assert.equal(getShipmentAwb(refreshedOrder), 'PH82114579236E')
})

test('maps stored and item-level product SKUs without duplicates', () => {
  const storedOrder = {
    ...order,
    product_skus: ['SC-01', 'MAT-02'],
    items: [
      { mp_item_nr: '1', partner_sku: 'SC-01' },
      { mp_item_nr: '2', partner_sku: 'Hub-201' },
    ],
  }
  assert.deepEqual(getProductSkus(storedOrder), ['SC-01', 'MAT-02', 'Hub-201'])
})

test('renders the AWB value immediately before the shipment ID field', () => {
  const ordersSource = readFileSync(new URL('../src/features/Orders.jsx', import.meta.url), 'utf8')
  const awbColumn = "{ key: 'awb', label: 'AWB'"
  const shipmentIdColumn = "{ key: 'shipment_id', label: 'Integration Shipment ID'"
  const awbIndex = ordersSource.indexOf(awbColumn)
  const shipmentIdIndex = ordersSource.indexOf(shipmentIdColumn)

  assert.notEqual(awbIndex, -1)
  assert.notEqual(shipmentIdIndex, -1)
  assert.ok(awbIndex < shipmentIdIndex)
  assert.equal(ordersSource.slice(awbIndex + awbColumn.length, shipmentIdIndex).includes("{ key:"), false)
})
