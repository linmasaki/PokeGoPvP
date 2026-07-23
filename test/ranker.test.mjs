import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankIVCombinations } from '../static/js/pvp/ranker.js';

const pachirisu = { atk: 94, def: 172, hp: 155 };

test('rankIVCombinations produces 4096 combinations for a full 0-15 IV floor', () => {
  const ranked = rankIVCombinations(pachirisu, { ivFloor: 0, minLevel: 1, maxLevel: 51, cpCap: 1500 });
  assert.equal(ranked.length, 4096);
});

test('rankIVCombinations ranks 15/15/15 Pachirisu as Great League rank 1', () => {
  const ranked = rankIVCombinations(pachirisu, { ivFloor: 0, minLevel: 1, maxLevel: 51, cpCap: 1500 });
  const rank1 = ranked[0];
  assert.deepEqual(rank1.ivs, { atk: 15, def: 15, hp: 15 });
  assert.equal(rank1.level, 51);
  assert.equal(rank1.cp, 1388);
  assert.equal(rank1.statProduct, 2082696);
});

test('rankIVCombinations ranks 11/15/15 Pachirisu as Great League rank 66 (matches pvpivs.com reference example)', () => {
  const ranked = rankIVCombinations(pachirisu, { ivFloor: 0, minLevel: 1, maxLevel: 51, cpCap: 1500 });
  const index = ranked.findIndex((c) => c.ivs.atk === 11 && c.ivs.def === 15 && c.ivs.hp === 15);
  assert.equal(index, 65); // 0-indexed, so this is rank 66
  assert.equal(ranked[index].level, 51);
  assert.equal(ranked[index].cp, 1337);
  assert.equal(ranked[index].statProduct, 2006267);
});

test('rankIVCombinations with cpCap = Infinity (Master League) always uses maxLevel', () => {
  const ranked = rankIVCombinations(pachirisu, { ivFloor: 0, minLevel: 1, maxLevel: 51, cpCap: Infinity });
  assert.equal(ranked.length, 4096);
  for (const combo of ranked) {
    assert.equal(combo.level, 51);
  }
});
