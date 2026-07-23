import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pokemon = JSON.parse(readFileSync(new URL('../static/js/data/pokemon.json', import.meta.url)));

test('pokemon.json contains a reasonable number of released, non-shadow species', () => {
  assert.ok(pokemon.length > 1000, `expected > 1000 entries, got ${pokemon.length}`);
});

test('pokemon.json excludes shadow-form duplicate entries', () => {
  const shadowEntries = pokemon.filter((p) => p.speciesId.endsWith('_shadow'));
  assert.equal(shadowEntries.length, 0);
});

test('every entry has the required fields with correct types', () => {
  for (const p of pokemon) {
    assert.equal(typeof p.speciesId, 'string');
    assert.equal(typeof p.speciesName, 'string');
    assert.equal(typeof p.dex, 'number');
    assert.equal(typeof p.baseStats.atk, 'number');
    assert.equal(typeof p.baseStats.def, 'number');
    assert.equal(typeof p.baseStats.hp, 'number');
  }
});

test('a known species (Pikachu) is present with correct base stats', () => {
  const pikachu = pokemon.find((p) => p.speciesId === 'pikachu');
  assert.ok(pikachu, 'expected to find pikachu in extracted data');
  assert.deepEqual(pikachu.baseStats, { atk: 112, def: 96, hp: 111 });
});
