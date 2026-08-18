import { test } from 'node:test';
import assert from 'node:assert/strict';

import { correctEvolutionIds, findDanglingEvolutions } from '../tools/extract-pokemon-data.mjs';

test('corrects the upstream misspelling of the dusk Lycanroc species id', () => {
  assert.deepEqual(
    correctEvolutionIds(['lycanroc_midnight', 'lycanroc_midday', 'lycranroc_dusk']),
    ['lycanroc_midnight', 'lycanroc_midday', 'lycanroc_dusk'],
  );
});

test('leaves evolution ids that are spelled correctly untouched', () => {
  assert.deepEqual(
    correctEvolutionIds(['charmeleon', 'charizard']),
    ['charmeleon', 'charizard'],
  );
});

test('reports evolution references no extracted species answers to', () => {
  const entries = [
    { speciesId: 'girafarig', family: { id: 'FAMILY_GIRAFARIG', evolutions: ['farigiraf'] } },
    { speciesId: 'charmander', family: { id: 'FAMILY_CHARMANDER', evolutions: ['charmeleon'] } },
    { speciesId: 'charmeleon', family: { id: 'FAMILY_CHARMANDER' } },
  ];

  assert.deepEqual(findDanglingEvolutions(entries), ['girafarig -> farigiraf']);
});

test('reports nothing when every evolution reference resolves', () => {
  const entries = [
    { speciesId: 'charmander', family: { id: 'FAMILY_CHARMANDER', evolutions: ['charmeleon'] } },
    { speciesId: 'charmeleon', family: { id: 'FAMILY_CHARMANDER' } },
  ];

  assert.deepEqual(findDanglingEvolutions(entries), []);
});
