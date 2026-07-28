import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankIVCombinations } from '../static/js/pvp/ranker.js';
import {
  getCpCapForLeague,
  searchPokemon,
  findAbsoluteRank,
  computePerfectPercent,
  filterAchievableTop,
  applyShadowMultiplier,
} from '../static/js/pages/rankings-logic.js';

const pokemonList = JSON.parse(readFileSync(new URL('../static/js/data/pokemon.json', import.meta.url)));

test('getCpCapForLeague returns the correct CP cap for each league', () => {
  assert.equal(getCpCapForLeague('great'), 1500);
  assert.equal(getCpCapForLeague('ultra'), 2500);
  assert.equal(getCpCapForLeague('master'), Infinity);
});

test('searchPokemon matches by species name substring, not just prefix', () => {
  const results = searchPokemon('zard', pokemonList);
  const ids = results.map((p) => p.speciesId);
  assert.ok(ids.includes('charizard'));
  assert.ok(ids.includes('charizard_mega_x'));
  assert.ok(ids.includes('charizard_mega_y'));
});

test('searchPokemon matches by nickname even when the nickname is not a substring of the species name', () => {
  const results = searchPokemon('kchu', pokemonList);
  assert.equal(results.length, 1);
  assert.equal(results[0].speciesId, 'raichu');
});

test('searchPokemon sorts by dex first, then by searchPriority as a tie-break with missing values last', () => {
  const synthetic = [
    { speciesId: 'a', speciesName: 'Test Alpha', dex: 5, searchPriority: null, nicknames: [] },
    { speciesId: 'b', speciesName: 'Test Beta', dex: 5, searchPriority: 2, nicknames: [] },
    { speciesId: 'c', speciesName: 'Test Gamma', dex: 3, searchPriority: null, nicknames: [] },
    { speciesId: 'd', speciesName: 'Test Delta', dex: 5, searchPriority: 1, nicknames: [] },
  ];
  const results = searchPokemon('test', synthetic);
  assert.deepEqual(results.map((p) => p.speciesId), ['c', 'd', 'b', 'a']);
});

test('searchPokemon returns an empty array for a blank query or no matches', () => {
  assert.deepEqual(searchPokemon('   ', pokemonList), []);
  assert.deepEqual(searchPokemon('zzzznotarealpokemon', pokemonList), []);
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
