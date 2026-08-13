import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLevel } from '../static/js/pages/calculator-logic.js';

test('sanitizeLevel rounds a value up to the nearest 0.5 step when closer to it', () => {
  assert.equal(sanitizeLevel(1.3), 1.5);
});

test('sanitizeLevel rounds a value down to the nearest 0.5 step when closer to it', () => {
  assert.equal(sanitizeLevel(1.2), 1);
});

test('sanitizeLevel clamps a value below 1 up to the minimum after rounding', () => {
  assert.equal(sanitizeLevel(0.7), 1);
});

test('sanitizeLevel clamps a value above 51 down to the maximum after rounding', () => {
  assert.equal(sanitizeLevel(60), 51);
});

test('sanitizeLevel leaves an already-valid 0.5-step value unchanged', () => {
  assert.equal(sanitizeLevel(25), 25);
  assert.equal(sanitizeLevel(1.5), 1.5);
});

test('sanitizeLevel rounds a near-upper-boundary value and then clamps it', () => {
  assert.equal(sanitizeLevel(51.3), 51);
});

test('sanitizeLevel falls back to the minimum for a non-numeric value instead of returning NaN', () => {
  // Without the guard these all flow through as NaN and get written back into the level field,
  // blanking it. The only current caller checks input.validity first so this is unreachable in
  // the page today, but that is the caller's invariant, not this function's.
  assert.equal(sanitizeLevel(NaN), 1);
  assert.equal(sanitizeLevel(Number('abc')), 1);
  assert.equal(sanitizeLevel(Infinity), 1);
});
