import test from 'node:test'
import assert from 'node:assert/strict'

import { displayValue, isFailureStatus } from '../src/utils/format.js'

test('renders protobuf wrapper values without exposing objects to React', () => {
  assert.equal(displayValue({ value: 'N49951937A' }), 'N49951937A')
  assert.equal(displayValue('N49951937A'), 'N49951937A')
  assert.equal(displayValue(null), '—')
})

test('turns structured values into readable table text', () => {
  assert.equal(displayValue({ name: 'Example' }), 'Example')
  assert.equal(displayValue({ message: 'Rejected' }), 'Rejected')
  assert.equal(displayValue(['A', 'B']), 'A, B')
})

test('detects per-item Noon failures from status_id or status_code', () => {
  assert.equal(isFailureStatus({ status_id: 3, status_code: 'InvalidArgument' }), true)
  assert.equal(isFailureStatus({ status_id: 0, status_code: 'OK' }), false)
  assert.equal(isFailureStatus({ status_code: 'InvalidArgument' }), true)
  assert.equal(isFailureStatus({ status_code: 'OK' }), false)
  assert.equal(isFailureStatus(undefined), false)
})
