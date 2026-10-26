import test from 'node:test'
import assert from 'node:assert/strict'

import {
  firstGeneratedSku,
  generatedSkuFailureMessage,
  skuMappingFailureMessage,
  skuMappingItem,
} from '../src/utils/skuWorkflow.js'

test('extracts the first generated SKU from the documented response', () => {
  assert.equal(firstGeneratedSku({ skus: [' SKU-001 ', 'SKU-002'] }), 'SKU-001')
  assert.equal(firstGeneratedSku({ skus: [{ value: 'SKU-001' }] }), '')
  assert.equal(firstGeneratedSku({ skus: [] }), '')
  assert.equal(firstGeneratedSku(null), '')
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
