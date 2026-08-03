import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCpmForLevel } from '../static/js/pvp/cpm.js';
import { calculateCP, calculateBattleStats, findLevelForCpCap, findExactLevelForCp } from '../static/js/pvp/stats.js';

const bulbasaur = { atk: 118, def: 111, hp: 128 };

test('calculateCP matches the known Bulbasaur 15/15/15 value at level 20', () => {
  const cpm = getCpmForLevel(20);
  assert.equal(calculateCP(bulbasaur, { atk: 15, def: 15, hp: 15 }, cpm), 637);
});

test('calculateBattleStats matches the known Bulbasaur 15/15/15 value at level 20', () => {
  const cpm = getCpmForLevel(20);
  const stats = calculateBattleStats(bulbasaur, { atk: 15, def: 15, hp: 15 }, cpm);
  assert.equal(stats.atk, 79.45420128107064);
  assert.equal(stats.def, 75.27240121364586);
  assert.equal(stats.hp, 85);
});

test('calculateCP never returns below 10 even for very weak stats', () => {
  const weak = { atk: 10, def: 10, hp: 10 };
  const cpm = getCpmForLevel(1);
  assert.equal(calculateCP(weak, { atk: 0, def: 0, hp: 0 }, cpm), 10);
});

test('calculateBattleStats HP never returns below 10 even for very weak stats', () => {
  const weak = { atk: 10, def: 10, hp: 10 };
  const cpm = getCpmForLevel(1);
  const stats = calculateBattleStats(weak, { atk: 0, def: 0, hp: 0 }, cpm);
  assert.equal(stats.hp, 10);
});

test('findLevelForCpCap returns the highest level within the Great League cap', () => {
  const level = findLevelForCpCap(bulbasaur, { atk: 15, def: 15, hp: 15 }, 1500, 1, 51);
  assert.equal(level, 51);
});

test('findLevelForCpCap with cpCap = Infinity (Master League) returns maxLevel directly', () => {
  const level = findLevelForCpCap(bulbasaur, { atk: 15, def: 15, hp: 15 }, Infinity, 1, 51);
  assert.equal(level, 51);
});

test('findLevelForCpCap returns null when even minLevel exceeds the cap', () => {
  const level = findLevelForCpCap(bulbasaur, { atk: 15, def: 15, hp: 15 }, 10, 40, 51);
  assert.equal(level, null);
});

test('findExactLevelForCp finds the level that produces an exact target CP', () => {
  const level = findExactLevelForCp(bulbasaur, { atk: 15, def: 15, hp: 15 }, 637);
  assert.equal(level, 20);
});

test('findExactLevelForCp returns null when no level in range produces the target CP', () => {
  const level = findExactLevelForCp(bulbasaur, { atk: 15, def: 15, hp: 15 }, 999999);
  assert.equal(level, null);
});

test('findExactLevelForCp respects the minLevel/maxLevel bounds', () => {
  const level = findExactLevelForCp(bulbasaur, { atk: 15, def: 15, hp: 15 }, 637, 21, 51);
  assert.equal(level, null);
});
