import test from 'node:test'
import assert from 'node:assert/strict'

import {
  firstGeneratedSku,
  extractGeneratedSkus,
  parseNskuList,
  buildBatchMappingItems,
  generatedSkuFailureMessage,
  skuMappingFailureMessage,
  skuMappingItem,
  buildGenerateAndMapPayload,
} from '../src/utils/skuWorkflow.js'

test('extracts the first generated SKU from the documented response', () => {
  assert.equal(firstGeneratedSku({ skus: [' SKU-001 ', 'SKU-002'] }), 'SKU-001')
  assert.equal(firstGeneratedSku({ skus: [{ value: 'SKU-001' }] }), '')
  assert.equal(firstGeneratedSku({ skus: [] }), '')
  assert.equal(firstGeneratedSku(null), '')
})

test('extracts all generated SKUs for single or bulk responses', () => {
  assert.deepEqual(extractGeneratedSkus({ skus: [' SKU-001 ', 'SKU-002', ' SKU-003 '] }), ['SKU-001', 'SKU-002', 'SKU-003'])
  assert.deepEqual(extractGeneratedSkus({ skus: [{ value: 'SKU-001' }, 'SKU-002'] }), ['SKU-001', 'SKU-002'])
  assert.deepEqual(extractGeneratedSkus({ skus: [] }), [])
  assert.deepEqual(extractGeneratedSkus(null), [])
})

test('parses comma-separated and newline-separated NSKU lists', () => {
  assert.deepEqual(parseNskuList('NSKU-1\nNSKU-2\r\nNSKU-3'), ['NSKU-1', 'NSKU-2', 'NSKU-3'])
  assert.deepEqual(parseNskuList('NSKU-1, NSKU-2,  NSKU-3 '), ['NSKU-1', 'NSKU-2', 'NSKU-3'])
  assert.deepEqual(parseNskuList([' NSKU-1 ', 'NSKU-2']), ['NSKU-1', 'NSKU-2'])
  assert.deepEqual(parseNskuList(''), [])
})

test('builds batch mapping items matching 1-to-1 or 1-to-many', () => {
  const skus = ['SKU-1', 'SKU-2', 'SKU-3']
  const nskus = ['NSKU-1', 'NSKU-2', 'NSKU-3']
  assert.deepEqual(buildBatchMappingItems(skus, nskus), [
    { partner_sku: 'SKU-1', nsku_child: 'NSKU-1' },
    { partner_sku: 'SKU-2', nsku_child: 'NSKU-2' },
    { partner_sku: 'SKU-3', nsku_child: 'NSKU-3' },
  ])

  // Single NSKU mapped to multiple SKUs
  assert.deepEqual(buildBatchMappingItems(skus, ['NSKU-SINGLE'], true), [
    { partner_sku: 'SKU-1', nsku_child: 'NSKU-SINGLE', force_map: true },
    { partner_sku: 'SKU-2', nsku_child: 'NSKU-SINGLE', force_map: true },
    { partner_sku: 'SKU-3', nsku_child: 'NSKU-SINGLE', force_map: true },
  ])
})

test('returns the exact generation failure reason', () => {
  assert.equal(generatedSkuFailureMessage({ status: { status_id: 0, status_code: 'OK' } }), '')
  assert.equal(
    generatedSkuFailureMessage({ status: { status_id: 3, status_code: 'InvalidArgument', message: 'Quantity is invalid' } }),
    'Quantity is invalid',
  )
})

test('builds the documented batch mapping item', () => {
  assert.deepEqual(skuMappingItem(' SKU-001 ', ' NSKU-001 '), {
    partner_sku: 'SKU-001',
    nsku_child: 'NSKU-001',
  })
  assert.deepEqual(skuMappingItem('SKU-001', 'NSKU-001', true), {
    partner_sku: 'SKU-001',
    nsku_child: 'NSKU-001',
    force_map: true,
  })
})

test('returns mapping failures without treating empty results as success', () => {
  assert.equal(skuMappingFailureMessage({ items: [{ status: { status_id: 0, status_code: 'OK' } }] }), '')
  assert.equal(
    skuMappingFailureMessage({ items: [{ status: { status_id: 3, status_code: 'InvalidArgument', message: 'NSKU is invalid' } }] }),
    'NSKU is invalid',
  )
  assert.equal(skuMappingFailureMessage({ items: [] }), 'Noon returned no mapping result.')
})

test('builds generate and map payload for single and bulk mode', () => {
  assert.deepEqual(
    buildGenerateAndMapPayload({ mode: 'single', nsku: ' N29896310A ', count: 2, forceMap: true }),
    { nsku: 'N29896310A', count: 2, force_map: true }
  )
  assert.deepEqual(
    buildGenerateAndMapPayload({
      mode: 'bulk',
      rows: [
        { nsku: ' N29896310A ', count: 3 },
        { nsku_child: 'N11111111A', quantity: 1 },
        { nsku: '', count: 1 },
      ],
      forceMap: false,
    }),
    {
      items: [
        { nsku: 'N29896310A', count: 3 },
        { nsku: 'N11111111A', count: 1 },
      ],
      force_map: false,
    }
  )
})
