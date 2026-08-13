import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCpCapForLeague } from '../static/js/pvp/leagues.js';

test('getCpCapForLeague returns the correct CP cap for each league', () => {
  assert.equal(getCpCapForLeague('great'), 1500);
  assert.equal(getCpCapForLeague('ultra'), 2500);
  assert.equal(getCpCapForLeague('master'), Infinity);
});

test('getCpCapForLeague throws on an unknown league instead of silently returning undefined', () => {
  // An undefined cap makes every `cp <= cap` comparison false, so findLevelForCpCap rejects all
  // 4096 IV combos and the page shows an empty result with no indication anything went wrong.
  // 'all' is specifically worth guarding: it is a valid league *value* in the Search String page's
  // UI, but it must be expanded into the three real leagues before reaching this function.
  assert.throws(() => getCpCapForLeague('all'), /Unknown league: all/);
  assert.throws(() => getCpCapForLeague(undefined), /Unknown league/);
});
