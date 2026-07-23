import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPM, getCpmForLevel } from '../static/js/pvp/cpm.js';

test('CPM table has 109 entries covering level 1 to 55 in half-level steps', () => {
  assert.equal(CPM.length, 109);
});

test('getCpmForLevel returns the multiplier for level 1', () => {
  assert.equal(getCpmForLevel(1), 0.0939999967813491);
});

test('getCpmForLevel returns the multiplier for level 25', () => {
  assert.equal(getCpmForLevel(25), 0.667934000492096);
});

test('getCpmForLevel returns the multiplier for level 40', () => {
  assert.equal(getCpmForLevel(40), 0.790300011634826);
});

test('getCpmForLevel returns the multiplier for level 55 (table maximum)', () => {
  assert.equal(getCpmForLevel(55), 0.865299999713897);
});

test('getCpmForLevel throws for a level above the table maximum', () => {
  assert.throws(() => getCpmForLevel(55.5), RangeError);
});

test('getCpmForLevel throws for a level below 1', () => {
  assert.throws(() => getCpmForLevel(0.5), RangeError);
});
