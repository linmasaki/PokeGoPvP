import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankIVCombinations } from '../static/js/pvp/ranker.js';
import {
  findAbsoluteRank,
  computePerfectPercent,
  filterAchievableTop,
  applyShadowMultiplier,
  getRankTierClass,
  formatIvTriplet,
} from '../static/js/pages/rankings-logic.js';

const pokemonList = JSON.parse(readFileSync(new URL('../static/js/data/pokemon.json', import.meta.url)));

test('getRankTierClass maps ranks to the three colour bands at their exact boundaries', () => {
  assert.equal(getRankTierClass(1), 'rank-tier--top100');
  assert.equal(getRankTierClass(100), 'rank-tier--top100');
  assert.equal(getRankTierClass(101), 'rank-tier--mid');
  assert.equal(getRankTierClass(500), 'rank-tier--mid');
  assert.equal(getRankTierClass(501), 'rank-tier--low');
  assert.equal(getRankTierClass(4096), 'rank-tier--low');
});

test('formatIvTriplet renders IVs in attack/defense/stamina order', () => {
  assert.equal(formatIvTriplet({ atk: 0, def: 12, hp: 15 }), '0/12/15');
  assert.equal(formatIvTriplet({ atk: 15, def: 15, hp: 15 }), '15/15/15');
});

const pachirisu = { atk: 94, def: 172, hp: 155 };
const pachirisuRanked = rankIVCombinations(pachirisu, { ivFloor: 0, minLevel: 1, maxLevel: 51, cpCap: 1500 });

test('findAbsoluteRank finds the 1-indexed rank of a specific IV combination', () => {
  assert.equal(findAbsoluteRank(pachirisuRanked, { atk: 15, def: 15, hp: 15 }), 1);
  assert.equal(findAbsoluteRank(pachirisuRanked, { atk: 11, def: 15, hp: 15 }), 66);
});

test('findAbsoluteRank returns null when the list is empty', () => {
  assert.equal(findAbsoluteRank([], { atk: 15, def: 15, hp: 15 }), null);
});

test('computePerfectPercent computes the ratio against the rank-1 stat product', () => {
  const result = computePerfectPercent(2006267, 2082696);
  assert.ok(Math.abs(result - 96.3302853608976) < 1e-9);
});

test('filterAchievableTop keeps each entry\'s true absolute rank instead of renumbering the filtered subset', () => {
  const top = filterAchievableTop(pachirisuRanked, 14, 5);
  assert.deepEqual(
    top.map((c) => c.rank),
    [1, 2, 3, 5, 7]
  );
  for (const combo of top) {
    assert.ok(combo.ivs.atk >= 14 && combo.ivs.def >= 14 && combo.ivs.hp >= 14);
  }
});

test('applyShadowMultiplier scales atk by 1.2 and def by 0.8, leaving hp unchanged', () => {
  const battle = { atk: 92.13770204782486, def: 158.0711035132408, hp: 143 };
  const result = applyShadowMultiplier(battle);
  assert.ok(Math.abs(result.atk - 110.56524245738983) < 1e-9);
  assert.ok(Math.abs(result.def - 126.45688281059266) < 1e-9);
  assert.equal(result.hp, 143);
});
