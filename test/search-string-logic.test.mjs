import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCpmForLevel as getCpmForLevelForTest } from '../static/js/pvp/cpm.js';
import { calculateCP as calculateCPForTest, calculateBattleStats as calculateBattleStatsForTest } from '../static/js/pvp/stats.js';
import {
  collectNormalEvolutionChain,
  collectMegaForms,
  buildEvolutionChecklist,
  rankEvaluatedSpecies,
  createRankingCache,
  sliceTopN,
  starTierForIvSum,
  apprBucket,
  mergeQualifyingRecords,
  groupPoolByStarTier,
  computeProjectedCpHpSets,
  computeApprBucketSets,
  compressToRanges,
  complementForTrash,
  complementBucketSet,
  buildGeneralModeTierConditions,
  buildTrashModeTierConditions,
  LANGUAGE_VOCAB,
  formatRangeList,
  formatTierCondition,
  generateGeneralModeString,
  generateTrashModeString,
  generateGlobalIvExtremeString,
  serializeStateToQuery,
  parseQueryToState,
} from '../static/js/pages/search-string-logic.js';

const pokemonList = JSON.parse(fs.readFileSync(new URL('../static/js/data/pokemon.json', import.meta.url)));

test('collectNormalEvolutionChain collects self and all branching evolutions (Eevee family)', () => {
  const chain = collectNormalEvolutionChain('eevee', pokemonList);
  assert.deepEqual(chain, ['eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon']);
});

test('collectNormalEvolutionChain collects a linear chain (Charmander line)', () => {
  const chain = collectNormalEvolutionChain('charmander', pokemonList);
  assert.deepEqual(chain, ['charmander', 'charmeleon', 'charizard']);
});

test('collectNormalEvolutionChain skips a missing evolution reference instead of throwing', () => {
  const chain = collectNormalEvolutionChain('girafarig', pokemonList);
  assert.deepEqual(chain, ['girafarig']);
});

test('collectNormalEvolutionChain returns just the species itself when it has no further evolutions', () => {
  const chain = collectNormalEvolutionChain('mewtwo_armored', pokemonList);
  assert.deepEqual(chain, ['mewtwo_armored']);
});

test('collectMegaForms attaches Mega forms whose base ID is reachable from the chain (Charizard)', () => {
  const chain = collectNormalEvolutionChain('charmander', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas.sort(), ['charizard_mega_x', 'charizard_mega_y']);
});

test('collectMegaForms attaches Raichu Mega forms when reached via Pikachu', () => {
  const chain = collectNormalEvolutionChain('pikachu', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas.sort(), ['raichu_mega_x', 'raichu_mega_y']);
});

test('collectMegaForms does NOT attach Raichu Mega forms to Alolan Raichu (same dex, not an evolution relation)', () => {
  const chain = collectNormalEvolutionChain('raichu_alolan', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, []);
});

test('collectMegaForms does NOT attach Slowbro Mega to Galarian Slowbro (same dex, not an evolution relation)', () => {
  const chain = collectNormalEvolutionChain('slowbro_galarian', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, []);
});

test('collectMegaForms does NOT attach Mewtwo Mega forms to Armored Mewtwo (same dex, not an evolution relation)', () => {
  const chain = collectNormalEvolutionChain('mewtwo_armored', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, []);
});

test('collectMegaForms does NOT false-positive match on species whose name merely contains "mega" (Meganium, Yanmega)', () => {
  const chain = collectNormalEvolutionChain('chikorita', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.ok(!megas.includes('meganium'));
});

test('buildEvolutionChecklist concatenates the normal chain with attached Mega forms', () => {
  const list = buildEvolutionChecklist('charmander', pokemonList);
  assert.deepEqual(list, ['charmander', 'charmeleon', 'charizard', 'charizard_mega_x', 'charizard_mega_y']);
});

test('rankEvaluatedSpecies returns a fully sorted list capped by the league CP limit', () => {
  const jolteon = pokemonList.find((p) => p.speciesId === 'jolteon');
  const ranked = rankEvaluatedSpecies(jolteon.baseStats, 'great', 50);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((c) => c.cp <= 1500));
  // sorted descending by statProduct
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].statProduct >= ranked[i].statProduct);
  }
});

test('rankEvaluatedSpecies finds Jolteon 0/12/15 as Rank 1 in Great League at Level 19.5', () => {
  const jolteon = pokemonList.find((p) => p.speciesId === 'jolteon');
  const ranked = rankEvaluatedSpecies(jolteon.baseStats, 'great', 50);
  assert.equal(ranked[0].ivs.atk, 0);
  assert.equal(ranked[0].ivs.def, 12);
  assert.equal(ranked[0].ivs.hp, 15);
  assert.equal(ranked[0].level, 19.5);
});

test('createRankingCache returns the same array reference for a repeated key (no recomputation)', () => {
  const jolteon = { speciesId: 'jolteon', baseStats: pokemonList.find((p) => p.speciesId === 'jolteon').baseStats };
  const cache = createRankingCache();
  const first = cache.getRanking(jolteon, 'great', 50);
  const second = cache.getRanking(jolteon, 'great', 50);
  assert.equal(first, second);
});

test('createRankingCache computes separately for different league or maxLevel keys', () => {
  const jolteon = { speciesId: 'jolteon', baseStats: pokemonList.find((p) => p.speciesId === 'jolteon').baseStats };
  const cache = createRankingCache();
  const great = cache.getRanking(jolteon, 'great', 50);
  const ultra = cache.getRanking(jolteon, 'ultra', 50);
  assert.notEqual(great, ultra);
  assert.ok(ultra.some((c) => c.ivs.atk === 0 && c.ivs.def === 12 && c.ivs.hp === 15 && c.level === 35));
});

test('sliceTopN returns only the first N entries', () => {
  const list = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }];
  assert.deepEqual(sliceTopN(list, 2), [{ v: 1 }, { v: 2 }]);
});

test('starTierForIvSum buckets IV sums into the five appraisal star tiers', () => {
  assert.equal(starTierForIvSum(0), 0);
  assert.equal(starTierForIvSum(22), 0);
  assert.equal(starTierForIvSum(23), 1);
  assert.equal(starTierForIvSum(29), 1);
  assert.equal(starTierForIvSum(30), 2);
  assert.equal(starTierForIvSum(36), 2);
  assert.equal(starTierForIvSum(37), 3);
  assert.equal(starTierForIvSum(44), 3);
  assert.equal(starTierForIvSum(45), 4);
});

test('apprBucket maps a single stat IV to its appraisal bucket', () => {
  assert.equal(apprBucket(0), 0);
  assert.equal(apprBucket(1), 1);
  assert.equal(apprBucket(5), 1);
  assert.equal(apprBucket(6), 2);
  assert.equal(apprBucket(10), 2);
  assert.equal(apprBucket(11), 3);
  assert.equal(apprBucket(14), 3);
  assert.equal(apprBucket(15), 4);
});

test('mergeQualifyingRecords keeps the maximum level when the same IV qualifies via multiple leagues (Jolteon 0/12/15)', () => {
  const jolteon = { speciesId: 'jolteon', baseStats: pokemonList.find((p) => p.speciesId === 'jolteon').baseStats };
  const cache = createRankingCache();
  const greatTop20 = sliceTopN(cache.getRanking(jolteon, 'great', 50), 20);
  const ultraTop20 = sliceTopN(cache.getRanking(jolteon, 'ultra', 50), 20);

  const pool = mergeQualifyingRecords([greatTop20, ultraTop20]);
  const merged = pool.get('0-12-15');

  assert.ok(merged, 'expected 0/12/15 to be in the merged pool');
  assert.equal(merged.maxLevel, 35, 'Ultra Rank 7 (Lv35) should win over Great Rank 1 (Lv19.5)');
});

test('mergeQualifyingRecords keeps the maximum level when the same IV qualifies via multiple checked evolution items', () => {
  // Hand-built fixture, not real ranking output: real species pairs are not guaranteed to
  // share a qualifying IV key (e.g. Eevee's own Great League Top 20 contains 15/15/15, but
  // Vaporeon's never does — high base stats make a max-Attack build hurt its bulk under the
  // CP cap — so a real-data version of this test silently stops proving anything if the
  // "coincidentally overlapping" species pair changes). A literal collision on the same key
  // is the only way to deterministically exercise the max-wins branch for this code path.
  const listFromItemA = [{ ivs: { atk: 15, def: 15, hp: 15 }, level: 20 }];
  const listFromItemB = [{ ivs: { atk: 15, def: 15, hp: 15 }, level: 50 }];

  const pool = mergeQualifyingRecords([listFromItemA, listFromItemB]);
  const merged = pool.get('15-15-15');

  assert.ok(merged, 'expected 15/15/15 to be in the merged pool');
  assert.equal(merged.maxLevel, 50, "the higher level from the second checked item's qualifying list should win");
});

test('groupPoolByStarTier buckets merged records by IV-sum star tier', () => {
  const pool = new Map([
    ['15-15-15', { atk: 15, def: 15, hp: 15, maxLevel: 50 }],
    ['0-0-0', { atk: 0, def: 0, hp: 0, maxLevel: 10 }],
  ]);
  const grouped = groupPoolByStarTier(pool);

  assert.equal(grouped.get(4).length, 1);
  assert.equal(grouped.get(4)[0].ivSum, 45);
  assert.equal(grouped.get(0).length, 1);
  assert.equal(grouped.get(0)[0].ivSum, 0);
  assert.equal(grouped.has(1), false, 'tiers with no members should not have an entry');
});

test('computeProjectedCpHpSets uses the base species stats, not the evaluated species stats', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  // Eevee's own 15/15/15 at Lv50 (from Task 2/3's ranking) qualifies at maxLevel 50
  const { cpSet } = computeProjectedCpHpSets([{ atk: 15, def: 15, hp: 15, maxLevel: 50 }], eevee.baseStats);
  assert.ok(cpSet.has(1210), 'Eevee 15/15/15 at Lv50 should be CP 1210 when projected onto Eevee itself');
  assert.ok(!cpSet.has(1500), 'must not contain a Vaporeon-scale CP number for the same IV/level');
});

test('computeProjectedCpHpSets enumerates in 0.5-level steps, not just integer levels', () => {
  // Vaporeon 0/8/14 qualifies for Great League Top 20 up to Lv18.5 (a half level)
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const { cpSet } = computeProjectedCpHpSets([{ atk: 0, def: 8, hp: 14, maxLevel: 18.5 }], eevee.baseStats);
  assert.ok(cpSet.has(479), 'projected CP at the half level 18.5 must be present in the set');
});

test('computeApprBucketSets collects the bucket values seen across all tier members', () => {
  const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets([
    { atk: 0, def: 12, hp: 15 },
    { atk: 1, def: 10, hp: 14 },
  ]);
  assert.deepEqual([...atkBucketSet].sort(), [0, 1]);
  assert.deepEqual([...defBucketSet].sort(), [2, 3]);
  assert.deepEqual([...staBucketSet].sort(), [3, 4]);
});

test('compressToRanges merges consecutive runs but keeps gaps separate', () => {
  assert.deepEqual(compressToRanges([1, 2, 3, 5, 7, 8, 9]), [
    { start: 1, end: 3 },
    { start: 5, end: 5 },
    { start: 7, end: 9 },
  ]);
});

test('compressToRanges returns an empty array for an empty input', () => {
  assert.deepEqual(compressToRanges([]), []);
});

test('complementForTrash returns the closed complement plus an open tail', () => {
  const result = complementForTrash(new Set([12, 13, 15]), 10);
  assert.deepEqual(result, [
    { start: 10, end: 11 },
    { start: 14, end: 14 },
    { start: 16, end: null },
  ]);
});

test('complementForTrash returns the whole range as safe when the value set is empty', () => {
  const result = complementForTrash(new Set(), 10);
  assert.deepEqual(result, [{ start: 10, end: null }]);
});

test('complementBucketSet returns the missing bucket values within the closed 0-4 range', () => {
  assert.deepEqual(complementBucketSet(new Set([0, 4])), [1, 2, 3]);
  assert.deepEqual(complementBucketSet(new Set([0, 1, 2, 3, 4])), []);
});

test('buildGeneralModeTierConditions only includes non-empty star tiers', () => {
  const pool = mergeQualifyingRecords([[{ ivs: { atk: 15, def: 15, hp: 15 }, level: 50 }]]);
  const grouped = groupPoolByStarTier(pool);
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');

  const conditions = buildGeneralModeTierConditions(grouped, eevee.baseStats);
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].star, 4);
  assert.deepEqual(conditions[0].atkBuckets, [{ start: 4, end: 4 }]);
});

test('buildTrashModeTierConditions with trashExcludePerfect drops the entire 4-star tier', () => {
  const pool = mergeQualifyingRecords([[{ ivs: { atk: 15, def: 15, hp: 15 }, level: 50 }]]);
  const grouped = groupPoolByStarTier(pool);
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');

  const conditions = buildTrashModeTierConditions(grouped, eevee.baseStats, { excludePerfect: true, excludeZero: true });
  assert.ok(!conditions.some((c) => c.star === 4), 'the 4-star tier must be entirely excluded from Trash output');
  assert.equal(conditions.length, 4, 'the other four tiers (0-3) are still present, fully open since nothing qualified in them');
});

test('buildTrashModeTierConditions with trashExcludeZero removes the projected 0/0/0 CP/HP values from the 0-star tier', () => {
  const pool = mergeQualifyingRecords([[{ ivs: { atk: 15, def: 15, hp: 15 }, level: 50 }]]);
  const grouped = groupPoolByStarTier(pool);
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');

  const withProtection = buildTrashModeTierConditions(grouped, eevee.baseStats, { excludePerfect: false, excludeZero: true });
  const withoutProtection = buildTrashModeTierConditions(grouped, eevee.baseStats, { excludePerfect: false, excludeZero: false });

  const zeroTierProtected = withProtection.find((c) => c.star === 0);
  const zeroTierUnprotected = withoutProtection.find((c) => c.star === 0);

  // Eevee's own CP at Lv1 with IVs 0/0/0 must not be reachable through the protected tier's CP ranges
  const cpm = getCpmForLevelForTest(1);
  const zeroIvCp = calculateCPForTest(eevee.baseStats, { atk: 0, def: 0, hp: 0 }, cpm);
  assert.ok(!rangesInclude(zeroTierProtected.cpRanges, zeroIvCp));
  assert.ok(rangesInclude(zeroTierUnprotected.cpRanges, zeroIvCp) || zeroTierUnprotected.cpRanges.some((r) => r.end === null && zeroIvCp >= r.start));
});

function rangesInclude(ranges, value) {
  return ranges.some((r) => value >= r.start && (r.end === null || value <= r.end));
}

test('the Trash safety invariant holds for the real Eevee family / Great League / Top 20 / Max Level 50 example', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const checklist = buildEvolutionChecklist('eevee', pokemonList); // Eevee + 8 Eeveelutions, no Mega
  const cache = createRankingCache();

  const qualifyingLists = checklist.map((speciesId) => {
    const mon = pokemonList.find((p) => p.speciesId === speciesId);
    return sliceTopN(cache.getRanking(mon, 'great', 50), 20);
  });

  const pool = mergeQualifyingRecords(qualifyingLists);
  const grouped = groupPoolByStarTier(pool);

  const generalConditions = buildGeneralModeTierConditions(grouped, eevee.baseStats);
  const trashConditions = buildTrashModeTierConditions(grouped, eevee.baseStats, { excludePerfect: true, excludeZero: true });

  // Exhaustively check every qualifying (IV, level) pair projected onto Eevee: it must NOT match any Trash tier condition.
  for (const member of pool.values()) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };
    const atkBucket = apprBucket(member.atk);
    const defBucket = apprBucket(member.def);
    const staBucket = apprBucket(member.hp);

    for (let level = 1; level <= member.maxLevel; level += 0.5) {
      const cpm = getCpmForLevelForTest(level);
      const cp = calculateCPForTest(eevee.baseStats, ivs, cpm);
      const hp = Math.round(calculateBattleStatsForTest(eevee.baseStats, ivs, cpm).hp);

      const matchesAnyTrashTier = trashConditions.some(
        (tier) =>
          rangesInclude(tier.cpRanges, cp) &&
          rangesInclude(tier.hpRanges, hp) &&
          rangesInclude(tier.atkBuckets, atkBucket) &&
          rangesInclude(tier.defBuckets, defBucket) &&
          rangesInclude(tier.staBuckets, staBucket)
      );

      assert.ok(
        !matchesAnyTrashTier,
        `qualifying member atk=${member.atk} def=${member.def} hp=${member.hp} at level ${level} (CP ${cp}, HP ${hp}) must not match any Trash tier`
      );
    }
  }

  assert.ok(generalConditions.length > 0, 'sanity check: the general-mode conditions should not be empty for this example');
});

test('formatRangeList joins closed ranges and single values with commas, and formats an open tail with a trailing dash', () => {
  assert.equal(formatRangeList([{ start: 12, end: 15 }, { start: 20, end: 20 }, { start: 30, end: null }]), '12-15,20,30-');
});

test('formatRangeList formats a single closed range without a trailing dash', () => {
  assert.equal(formatRangeList([{ start: 5, end: 5 }]), '5');
});

test('generateGlobalIvExtremeString returns null when neither toggle is on', () => {
  assert.equal(generateGlobalIvExtremeString(false, false, 'en'), null);
});

test('generateGlobalIvExtremeString returns the fixed 4-star condition for 100% IV', () => {
  const result = generateGlobalIvExtremeString(true, false, 'en');
  assert.equal(result, '4atk*&4def*&4sta*');
});

test('generateGlobalIvExtremeString returns the fixed 0-star condition for 0% IV', () => {
  const result = generateGlobalIvExtremeString(false, true, 'en');
  assert.equal(result, '0atk*&0def*&0sta*');
});

test('generateGlobalIvExtremeString OR-combines both conditions when both toggles are on', () => {
  const result = generateGlobalIvExtremeString(true, true, 'en');
  assert.equal(result, '4atk*&4def*&4sta*,0atk*&0def*&0sta*');
});

test('generateGlobalIvExtremeString does not depend on species or league', () => {
  const withoutSpecies = generateGlobalIvExtremeString(true, false, 'zh-TW');
  assert.ok(!withoutSpecies.includes('#'));
});

test('generateGeneralModeString returns null when no evolution items are checked', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateGeneralModeString(
    { baseSpecies: eevee, checkedItems: [], leagues: ['great'], topN: 20, maxLevel: 50, language: 'en' },
    cache
  );
  assert.equal(result, null);
});

test('generateGeneralModeString includes the base species name as the scoping term and the 4-star condition for a perfect-IV-only example', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateGeneralModeString(
    { baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 1, maxLevel: 50, language: 'en' },
    cache
  );
  assert.ok(result.startsWith('Eevee'));
  assert.ok(result.includes('4atk*'));
});

test('generateTrashModeString produces output that respects trashExcludePerfect (no 4atk*&4def*&4sta* clause)', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateTrashModeString(
    {
      baseSpecies: eevee,
      checkedItems: [eevee],
      leagues: ['great'],
      topN: 20,
      maxLevel: 50,
      language: 'en',
      excludePerfect: true,
      excludeZero: true,
      excludeXXL: false,
      excludeXXS: false,
      excludeXL: false,
      excludeXS: false,
      excludeTagged: false,
      excludeFavorited: false,
    },
    cache
  );
  assert.ok(!result.includes('4atk*&4def*&4sta*'), 'the fully-protected 4-star tier must not appear as a standalone AND clause');
});

const DEFAULT_STATE_FOR_TEST = {
  species: null,
  league: 'great',
  language: 'en',
  find100IV: false,
  find0IV: false,
  includedFamilyMembers: new Set(),
  topN: 10,
  maxLevel: 50,
  trash: false,
  trashExcludePerfect: true,
  trashExcludeZero: true,
};

test('serializeStateToQuery omits every field that is still at its default value', () => {
  assert.equal(serializeStateToQuery(DEFAULT_STATE_FOR_TEST), '');
});

test('serializeStateToQuery includes only the fields that differ from default', () => {
  const query = serializeStateToQuery({ ...DEFAULT_STATE_FOR_TEST, species: 'eevee', league: 'ultra', topN: 20 });
  const params = new URLSearchParams(query);
  assert.equal(params.get('mon'), 'eevee');
  assert.equal(params.get('league'), 'ultra');
  assert.equal(params.get('topN'), '20');
  assert.equal(params.has('lang'), false);
});

test('parseQueryToState reads back only the fields present in the query string', () => {
  const parsed = parseQueryToState('mon=eevee&league=ultra&topN=20', pokemonList);
  assert.deepEqual(parsed, { species: 'eevee', league: 'ultra', topN: 20 });
});

test('parseQueryToState round-trips through serializeStateToQuery', () => {
  const original = { ...DEFAULT_STATE_FOR_TEST, species: 'charmander', find100IV: true, trash: true, trashExcludePerfect: false };
  const query = serializeStateToQuery(original);
  const parsed = parseQueryToState(query, pokemonList);
  assert.equal(parsed.species, 'charmander');
  assert.equal(parsed.find100IV, true);
  assert.equal(parsed.trash, true);
  assert.equal(parsed.trashExcludePerfect, false);
});

test('serializeStateToQuery includes the evolution checklist selection whenever a species is selected', () => {
  const query = serializeStateToQuery({
    ...DEFAULT_STATE_FOR_TEST,
    species: 'eevee',
    includedFamilyMembers: new Set(['eevee', 'vaporeon']),
  });
  const params = new URLSearchParams(query);
  assert.equal(params.get('evo'), 'eevee,vaporeon');
});

test('serializeStateToQuery omits the evo param when no species is selected', () => {
  const query = serializeStateToQuery(DEFAULT_STATE_FOR_TEST);
  assert.equal(new URLSearchParams(query).has('evo'), false);
});

test('serializeStateToQuery still writes an (empty) evo param when every family member is unchecked', () => {
  // Regression test: omitting evo here is indistinguishable from "no evo param was ever set",
  // so a restored link would fall back to "everything checked" instead of "nothing checked".
  const query = serializeStateToQuery({ ...DEFAULT_STATE_FOR_TEST, species: 'eevee', includedFamilyMembers: new Set() });
  const params = new URLSearchParams(query);
  assert.equal(params.has('evo'), true);
  assert.equal(params.get('evo'), '');
});

test('parseQueryToState parses the evo param into an array of speciesIds', () => {
  const parsed = parseQueryToState('mon=eevee&evo=eevee,vaporeon', pokemonList);
  assert.deepEqual(parsed.includedFamilyMembers, ['eevee', 'vaporeon']);
});

test('parseQueryToState round-trips an all-unchecked evolution list back to an empty (not full) selection', () => {
  const parsed = parseQueryToState('mon=eevee&evo=', pokemonList);
  assert.deepEqual(parsed.includedFamilyMembers, []);
});

test('parseQueryToState drops evo ids that are not part of the given species\' own evolution family', () => {
  // "mewtwo" is a real, existing species, but not part of Eevee's family — it must not be
  // silently trusted just because it exists somewhere in pokemonList.
  const parsed = parseQueryToState('mon=eevee&evo=mewtwo', pokemonList);
  assert.deepEqual(parsed.includedFamilyMembers, []);
});

test('parseQueryToState keeps only the evo ids that are genuinely part of the species\' family', () => {
  const parsed = parseQueryToState('mon=eevee&evo=eevee,vaporeon,mewtwo', pokemonList);
  assert.deepEqual(parsed.includedFamilyMembers, ['eevee', 'vaporeon']);
});

test('parseQueryToState rejects a species id that does not exist in pokemonList', () => {
  const parsed = parseQueryToState('mon=not-a-real-species', pokemonList);
  assert.equal(parsed.species, undefined);
});

test('parseQueryToState rejects a league value outside the known set', () => {
  const parsed = parseQueryToState('league=bogus', pokemonList);
  assert.equal(parsed.league, undefined);
});

test('parseQueryToState accepts every known league value', () => {
  for (const league of ['great', 'ultra', 'master', 'all']) {
    assert.equal(parseQueryToState(`league=${league}`, pokemonList).league, league);
  }
});

test('parseQueryToState rejects a language value outside the known set', () => {
  const parsed = parseQueryToState('lang=klingon', pokemonList);
  assert.equal(parsed.language, undefined);
});

test('parseQueryToState rejects a non-integer or out-of-range topN', () => {
  assert.equal(parseQueryToState('topN=not-a-number', pokemonList).topN, undefined);
  assert.equal(parseQueryToState('topN=0', pokemonList).topN, undefined);
  assert.equal(parseQueryToState('topN=4097', pokemonList).topN, undefined);
  assert.equal(parseQueryToState('topN=12.5', pokemonList).topN, undefined);
  assert.equal(parseQueryToState('topN=4096', pokemonList).topN, 4096);
});

test('parseQueryToState rejects a maxLevel outside the engine\'s supported 1-51 range', () => {
  // This is the case that previously crashed the page outright: getCpmForLevel(999) throws
  // a RangeError as soon as ranking starts, since the engine only supports levels 1-55 and
  // this page only ever exposes 1-51 as a selectable option.
  assert.equal(parseQueryToState('maxLevel=999', pokemonList).maxLevel, undefined);
  assert.equal(parseQueryToState('maxLevel=0', pokemonList).maxLevel, undefined);
  assert.equal(parseQueryToState('maxLevel=51', pokemonList).maxLevel, 51);
});

test('parseQueryToState rejects a boolean field value that is neither "true" nor "false"', () => {
  const parsed = parseQueryToState('xp=anything', pokemonList);
  assert.equal(parsed.trashExcludePerfect, undefined);
});
