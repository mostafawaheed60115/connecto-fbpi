export function suggestShipmentNumber(orderNr, now = Date.now()) {
  const compactOrder = orderNr.replace(/[^A-Za-z0-9]/g, '').slice(-22)
  return `CONN-${compactOrder}-${now}`
}

export function createShipmentPayload(order, awb, integrationShipmentNr, fallbackWarehouse = 'W00172296EG') {
  return {
    warehouse_code: order.warehouse_code || fallbackWarehouse,
    integration_shipment_nr: integrationShipmentNr.trim(),
    fbpi_order_nr: order.fbpi_order_nr,
    awbs: [{ courier: 'noon', awb_nr: awb.trim() }],
    items: (order.items || []).map((item) => ({ mp_item_nr: item.mp_item_nr })),
  }
}

export function getShipmentRecords(order, createdShipments = {}) {
  const records = Array.isArray(order.shipments) ? order.shipments : []
  const legacyIds = Array.isArray(order.shipment_ids) ? order.shipment_ids : []
  const candidates = [
    ...records,
    ...legacyIds.map((integration_shipment_nr) => ({ integration_shipment_nr })),
    { integration_shipment_nr: order.integration_shipment_nr },
    { integration_shipment_nr: order.shipment_id },
    { integration_shipment_nr: order.shipmentId },
    order.shipment,
    createdShipments[order.fbpi_order_nr],
  ]

  const unique = new Map()
  for (const candidate of candidates) {
    const integrationShipmentNr = candidate?.integration_shipment_nr || candidate?.shipment_id
    if (!integrationShipmentNr) continue
    const current = unique.get(integrationShipmentNr)
    unique.set(integrationShipmentNr, {
      ...current,
      ...candidate,
      integration_shipment_nr: integrationShipmentNr,
      awb_nr: candidate?.awb_nr || current?.awb_nr || null,
    })
  }
  return [...unique.values()]
}

export function getShipmentIds(order, createdShipments = {}) {
  return getShipmentRecords(order, createdShipments).map((item) => item.integration_shipment_nr)
}

export function getShipmentAwb(order, createdShipments = {}) {
  return getShipmentRecords(order, createdShipments).find((item) => item.awb_nr)?.awb_nr || ''
}
