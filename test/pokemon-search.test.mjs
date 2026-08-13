import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchPokemon } from '../static/js/pages/pokemon-search.js';

const pokemonList = JSON.parse(readFileSync(new URL('../static/js/data/pokemon.json', import.meta.url)));

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
