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
  formatValueTerms,
  formatBucketTerms,
  formatGeneralTierGroups,
  formatTrashTierGroups,
  assembleGeneralModeString,
  generateGeneralModeString,
  generateTrashModeString,
  generateGlobalIvExtremeString,
  serializeStateToQuery,
  parseQueryToState,
  RANKING_MAX_LEVEL,
  PROJECTION_MAX_LEVEL,
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

test('collectMegaForms attaches Primal forms the same way as Megas (Kyogre)', () => {
  const chain = collectNormalEvolutionChain('kyogre', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, ['kyogre_primal']);
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

test('ranking at RANKING_MAX_LEVEL still gets CP-cap-aware optimization for leagues whose cap a species can only reach above the wild-catch level (regression)', () => {
  // Dusknoir can't reach Ultra League's 2500 CP cap by level 35 (only ~2218 even at 15/15/15) —
  // a ranking capped at the wild-catch level therefore has no CP cap to trade off against, and
  // degenerates into "highest IV sum wins" (always 15/15/15), losing all PvP relevance. This is
  // exactly the bug found when Max Level was still a shared, user-set field capped at 35: ranking
  // and the wild-catch projection cap must be independent so this can't regress.
  const dusknoir = pokemonList.find((p) => p.speciesId === 'dusknoir');
  const ranked = rankEvaluatedSpecies(dusknoir.baseStats, 'ultra', RANKING_MAX_LEVEL);
  assert.notDeepEqual(ranked[0].ivs, { atk: 15, def: 15, hp: 15 });
  assert.ok(ranked[0].cp >= 2450, `rank 1 CP (${ranked[0].cp}) should be close to Ultra League's 2500 cap, proving levels above 35 are reachable`);
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
  // Eevee's own 15/15/15 at Lv35 (within the wild-catch projection cap) qualifies at maxLevel 50
  const { cpSet } = computeProjectedCpHpSets([{ atk: 15, def: 15, hp: 15, maxLevel: 50 }], eevee.baseStats);
  assert.ok(cpSet.has(994), 'Eevee 15/15/15 at Lv35 should be CP 994 when projected onto Eevee itself');
  assert.ok(!cpSet.has(1500), 'must not contain a Vaporeon-scale CP number for the same IV/level');
});

test('computeProjectedCpHpSets caps enumeration at PROJECTION_MAX_LEVEL (35) even when the member qualified at a higher level', () => {
  // Wild-caught Pokémon never spawn above level 35, so a member whose qualifying maxLevel is
  // higher (e.g. 50, from a fully-invested evolved form) must still only project CP/HP for
  // levels a wild catch could realistically be at.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const { cpSet } = computeProjectedCpHpSets([{ atk: 15, def: 15, hp: 15, maxLevel: 50 }], eevee.baseStats);
  assert.equal(cpSet.has(1210), false, 'CP reachable only above the projection cap (Lv50) must not appear');
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

test('buildTrashModeTierConditions builds all five tiers and shares the one global CP/HP complement between them', () => {
  const pool = mergeQualifyingRecords([[{ ivs: { atk: 15, def: 15, hp: 15 }, level: 50 }]]);
  const grouped = groupPoolByStarTier(pool);
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');

  const conditions = buildTrashModeTierConditions(grouped, eevee.baseStats);
  assert.deepEqual(conditions.map((c) => c.star), [0, 1, 2, 3, 4], 'the string assembler decides which tiers to emit, the builder always builds all five');
  assert.equal(conditions[0].cpRanges, conditions[4].cpRanges, 'every tier complements the same global CP union, so the ranges are one shared computation');
  assert.deepEqual(conditions[4].atkBuckets, [{ start: 0, end: 3 }], 'the 4-star tier excludes only non-perfect buckets');
});

test('generateTrashModeString with trashExcludeZero appends the reference "at least one bucket >= 1" clause protecting exactly 0/0/0', () => {
  // "&1-4attack,1-4defense,1-4hp" is one OR clause: a mon can only be flagged as trash if at
  // least one of its appraisal buckets is >= 1 — which is false only for an exact 0/0/0
  // (bucket 0 means IV exactly 0). This protection is structural, independent of which star
  // tiers have qualifying members. A prior revision instead carved 0/0/0's projected CP/HP out
  // of the star-0 complements, which cannot work: the tier clause is an OR of five groups, so
  // 0/0/0 still matched through any bucket complement containing bucket 0.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const baseContext = {
    baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 20, language: 'en',
    excludePerfect: true, excludeZero: true,
    excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
    excludeTagged: false, excludeFavorited: false,
  };

  const withProtection = generateTrashModeString(baseContext, cache);
  const withoutProtection = generateTrashModeString({ ...baseContext, excludeZero: false }, cache);
  assert.ok(withProtection.endsWith('&1-4attack,1-4defense,1-4hp'));
  assert.ok(!withoutProtection.includes('1-4attack'));
});

test('generateTrashModeString renders the favorited exclusion with the localized favorite word, not a symbol', () => {
  // The reference tool emits "&!favorite" / "&!我的最愛" / "&!お気に入り" (its language table);
  // the previous "&!<3" has no known basis in the game's search grammar and would silently
  // do nothing if the game treats it as a name substring.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const context = {
    baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 20, language: 'zh-TW',
    excludePerfect: true, excludeZero: false,
    excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
    excludeTagged: false, excludeFavorited: true,
  };
  assert.ok(generateTrashModeString(context, cache).endsWith('&!我的最愛'));
  assert.ok(generateTrashModeString({ ...context, language: 'en' }, cache).endsWith('&!favorite'));
});

test('generateTrashModeString emits the 4-star tier clause when a hundo itself qualifies and blanket protection is off (regression)', () => {
  // In Master League the Top N always contains 15/15/15. With trashExcludePerfect unchecked
  // there used to be neither a "&!4*" flag nor any 4-star clause, so every clause in the string
  // was trivially true for a hundo — flagging even the qualifying rank-1 hundo as trash.
  const dusknoir = pokemonList.find((p) => p.speciesId === 'dusknoir');
  const cache = createRankingCache();
  const result = generateTrashModeString(
    {
      baseSpecies: dusknoir, checkedItems: [dusknoir], leagues: ['master'], topN: 10, language: 'en',
      excludePerfect: false, excludeZero: false,
      excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
      excludeTagged: false, excludeFavorited: false,
    },
    cache
  );
  // Tier-4 members are all 15/15/15, so its bucket complements are exactly 0-3 in each stat;
  // a real hundo (all buckets 4, CP/HP on the enumerated curve) matches none of the clause's
  // OR terms and is therefore never flagged.
  assert.ok(result.includes('&!4*,0-3attack,0-3defense,0-3hp,'), 'the 4-star clause must be present with its bucket complements');
});

function rangesInclude(ranges, value) {
  return ranges.some((r) => value >= r.start && (r.end === null || value <= r.end));
}

// In-game the whole trash string is an AND of per-tier clauses "(!{i}* OR complement-groups)".
// For a mon of star tier s, every clause with i ≠ s is trivially true via its !{i}* term, so the
// string flags the mon iff ANY of the five complement groups of its OWN tier's clause matches —
// an OR, not an AND. (Modelling this as an AND-across-all-five once masked a real leak: a
// single-dimension escape, e.g. through one appraisal-bucket complement alone, flags the mon
// in-game but sails through an all-five check.) No clause for the mon's tier means it can never
// be flagged (e.g. a hundo protected by a bare "&!4*").
function trashConditionsFlag(trashConditions, member, cp, hp) {
  const star = starTierForIvSum(member.atk + member.def + member.hp);
  const tier = trashConditions.find((c) => c.star === star);
  if (!tier) return false;
  return (
    rangesInclude(tier.cpRanges, cp) ||
    rangesInclude(tier.hpRanges, hp) ||
    rangesInclude(tier.atkBuckets, apprBucket(member.atk)) ||
    rangesInclude(tier.defBuckets, apprBucket(member.def)) ||
    rangesInclude(tier.staBuckets, apprBucket(member.hp))
  );
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
  const trashConditions = buildTrashModeTierConditions(grouped, eevee.baseStats);

  // Exhaustively check every qualifying (IV, level) pair projected onto Eevee: it must NOT be
  // flagged by its own tier's Trash clause (see trashConditionsFlag for the game semantics).
  // Checked over the member's FULL qualifying level range (which can exceed the wild-catch
  // ceiling), not just wild levels — the box a Trash string deletes from holds powered-up
  // Pokémon too, so the "never flags a keeper" guarantee has to hold up there as well.
  for (const member of pool.values()) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };

    for (let level = 1; level <= member.maxLevel; level += 0.5) {
      const cpm = getCpmForLevelForTest(level);
      const cp = calculateCPForTest(eevee.baseStats, ivs, cpm);
      const hp = calculateBattleStatsForTest(eevee.baseStats, ivs, cpm).hp;

      assert.ok(
        !trashConditionsFlag(trashConditions, member, cp, hp),
        `qualifying member atk=${member.atk} def=${member.def} hp=${member.hp} at level ${level} (CP ${cp}, HP ${hp}) must not be flagged by its own Trash tier clause`
      );
    }
  }

  assert.ok(generalConditions.length > 0, 'sanity check: the general-mode conditions should not be empty for this example');
});

test('the Trash safety invariant holds above the wild-catch level ceiling too (Duskull base / Dusknoir / Ultra / Top 30 regression)', () => {
  // The Eevee case above happens to have no qualifying member reaching past the wild ceiling,
  // so it cannot catch this: when Trash mode enumerated CP/HP only up to PROJECTION_MAX_LEVEL,
  // complementForTrash's open tail (max+1 → ∞) started just above the level-35 CP and declared
  // every powered-up individual beyond it safe to delete — 734 genuinely qualifying (IV, level)
  // states, all at level 36.5–51. This scenario reproduces that, so Trash mode must keep
  // enumerating over the full reachable level range.
  const duskull = pokemonList.find((p) => p.speciesId === 'duskull');
  const dusknoir = pokemonList.find((p) => p.speciesId === 'dusknoir');
  const cache = createRankingCache();

  const pool = mergeQualifyingRecords([sliceTopN(cache.getRanking(dusknoir, 'ultra', RANKING_MAX_LEVEL), 30)]);
  const grouped = groupPoolByStarTier(pool);
  const trashConditions = buildTrashModeTierConditions(grouped, duskull.baseStats);

  let checkedAboveWildCeiling = 0;

  for (const member of pool.values()) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };

    for (let level = 1; level <= member.maxLevel; level += 0.5) {
      const cpm = getCpmForLevelForTest(level);
      const cp = calculateCPForTest(duskull.baseStats, ivs, cpm);
      const hp = calculateBattleStatsForTest(duskull.baseStats, ivs, cpm).hp;
      if (level > PROJECTION_MAX_LEVEL) checkedAboveWildCeiling++;

      assert.ok(
        !trashConditionsFlag(trashConditions, member, cp, hp),
        `qualifying member atk=${member.atk} def=${member.def} hp=${member.hp} at level ${level} (CP ${cp}, HP ${hp}) must not be flagged by its own Trash tier clause`
      );
    }
  }

  assert.ok(checkedAboveWildCeiling > 0, 'sanity check: this scenario must actually exercise levels above the wild-catch ceiling, or it proves nothing');
});

test('formatValueTerms prefixes the word on every disjoint value, and only once at the start of a compressed run', () => {
  assert.equal(formatValueTerms([{ start: 10, end: 10 }, { start: 25, end: 25 }, { start: 42, end: 42 }], 'cp'), 'cp10,cp25,cp42');
  assert.equal(formatValueTerms([{ start: 12, end: 15 }], 'cp'), 'cp12-15');
});

test('formatValueTerms formats an open tail with a trailing dash and the word prefixed once', () => {
  assert.equal(formatValueTerms([{ start: 12, end: 15 }, { start: 20, end: 20 }, { start: 30, end: null }], 'hp'), 'hp12-15,hp20,hp30-');
});

test('formatBucketTerms suffixes the word on every disjoint value, and only once at the end of a compressed run', () => {
  assert.equal(formatBucketTerms([{ start: 0, end: 0 }, { start: 3, end: 3 }], 'attack'), '0attack,3attack');
  assert.equal(formatBucketTerms([{ start: 0, end: 1 }, { start: 3, end: 3 }], 'defense'), '0-1defense,3defense');
});

const SAMPLE_TIER_CONDITION = {
  star: 1,
  atkBuckets: [{ start: 0, end: 1 }],
  defBuckets: [{ start: 2, end: 2 }],
  staBuckets: [{ start: 4, end: 4 }],
  cpRanges: [{ start: 10, end: 10 }, { start: 25, end: 25 }],
  hpRanges: [{ start: 10, end: 10 }],
};

test('formatGeneralTierGroups repeats the "&!{star}*" marker before EACH of the five groups', () => {
  // This exact shape was confirmed character-for-character against a real, verified working
  // search string (see assembleGeneralModeString's Duskull regression test below) — the marker
  // is NOT a single prefix for the whole tier.
  const result = formatGeneralTierGroups(SAMPLE_TIER_CONDITION, LANGUAGE_VOCAB.en);
  assert.equal(result, '&!1*,0-1attack&!1*,2defense&!1*,4hp&!1*,cp10,cp25&!1*,hp10');
});

test('formatTrashTierGroups emits the "&!{star}*" marker only ONCE, at the very start, then plain commas', () => {
  // Deliberately different from formatGeneralTierGroups — the reference tool's own source
  // comments this exact asymmetry: "Need to intersperse &!i* between search strings, but not
  // trash strings." A prior revision made this match the General-mode shape on an unverified
  // hunch about a suspected Trash-mode leak; that leak turned out to be an unrelated mode
  // mix-up, and repeating the marker here was never actually validated. Reverted — this test
  // guards against re-introducing that unverified deviation.
  const result = formatTrashTierGroups(SAMPLE_TIER_CONDITION, LANGUAGE_VOCAB.en);
  assert.equal(result, '&!1*,0-1attack,2defense,4hp,cp10,cp25,hp10');
});

test('generateGlobalIvExtremeString returns null when neither toggle is on', () => {
  assert.equal(generateGlobalIvExtremeString(false, false, 'en'), null);
});

test('generateGlobalIvExtremeString returns the fixed 4-star condition for 100% IV', () => {
  const result = generateGlobalIvExtremeString(true, false, 'en');
  assert.equal(result, '4attack&4defense&4hp');
});

test('generateGlobalIvExtremeString returns the fixed 0-star condition for 0% IV', () => {
  const result = generateGlobalIvExtremeString(false, true, 'en');
  assert.equal(result, '0attack&0defense&0hp');
});

test('generateGlobalIvExtremeString expresses both toggles as AND-of-(4* OR 0x) clauses (regression)', () => {
  // The old "4attack&4defense&4hp,0attack&0defense&0hp" output parsed to an unsatisfiable
  // condition under the game grammar (see the implementation comment) and matched nothing.
  const result = generateGlobalIvExtremeString(true, true, 'en');
  assert.equal(result, '4*,0attack&4*,0defense&4*,0hp');
});

test('generateGlobalIvExtremeString does not depend on species or league', () => {
  const withoutSpecies = generateGlobalIvExtremeString(true, false, 'zh-TW');
  assert.ok(!withoutSpecies.includes('#'));
});

test('generateGeneralModeString returns null when no evolution items are checked', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateGeneralModeString(
    { baseSpecies: eevee, checkedItems: [], leagues: ['great'], topN: 20, language: 'en' },
    cache
  );
  assert.equal(result, null);
});

test('generateGeneralModeString anchors on the dex number (once, at the front) and appends a bare ,4* for a perfect-IV-only example', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateGeneralModeString(
    { baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 1, language: 'en' },
    cache
  );
  // Eevee's Great League rank 1 is the hundo, so tiers 0-3 are empty (deferred bare markers)
  // and the 4-star tier contributes its bare ",4*" — the whole string is deterministic.
  assert.equal(result, '133&!0*&!1*&!2*&!3*,4*');
});

test('assembleGeneralModeString matches a real, verified working search string character-for-character (Duskull family / Great League / Top 10, star tiers 0-2 populated, 3 empty, 4 absent)', () => {
  // Ground truth supplied by the user after real-device testing via pvpivs.com for Duskull /
  // Dusclops / Dusknoir, Great League, Top 10, Search Levels 1-30, English. The anchor is the
  // "355" dex number, exactly as the original emitted it (and as production now does too).
  const tierConditions = [
    {
      star: 0,
      atkBuckets: [{ start: 0, end: 0 }],
      defBuckets: [{ start: 2, end: 2 }],
      staBuckets: [{ start: 3, end: 3 }],
      cpRanges: [10, 25, 42, 59, 76, 93, 110, 127, 144, 161, 177, 194, 210, 226, 242, 258, 274, 291, 307, 323, 339, 355, 371, 388, 404, 420, 436, 452, 468].map((v) => ({ start: v, end: v })),
      hpRanges: [
        { start: 10, end: 10 }, { start: 16, end: 16 }, { start: 21, end: 21 }, { start: 25, end: 25 },
        { start: 28, end: 28 }, { start: 31, end: 31 }, { start: 34, end: 34 }, { start: 36, end: 36 },
        { start: 39, end: 39 }, { start: 41, end: 41 }, { start: 43, end: 43 }, { start: 45, end: 45 },
        { start: 47, end: 48 }, { start: 50, end: 50 }, { start: 52, end: 53 }, { start: 55, end: 55 },
        { start: 57, end: 59 }, { start: 61, end: 62 }, { start: 64, end: 66 }, { start: 68, end: 70 },
      ],
    },
    {
      star: 1,
      atkBuckets: [{ start: 0, end: 1 }],
      defBuckets: [{ start: 2, end: 4 }],
      staBuckets: [{ start: 3, end: 4 }],
      cpRanges: [
        { start: 10, end: 10 }, { start: 25, end: 25 }, { start: 42, end: 43 }, { start: 59, end: 60 },
        { start: 77, end: 78 }, { start: 94, end: 96 }, { start: 111, end: 113 }, { start: 128, end: 131 },
        { start: 145, end: 148 }, { start: 163, end: 166 }, { start: 179, end: 183 }, { start: 195, end: 199 },
        { start: 212, end: 216 }, { start: 228, end: 232 }, { start: 244, end: 249 }, { start: 261, end: 266 },
        { start: 277, end: 282 }, { start: 293, end: 299 }, { start: 309, end: 314 }, { start: 316, end: 316 },
        { start: 326, end: 332 }, { start: 342, end: 346 }, { start: 348, end: 349 }, { start: 358, end: 364 },
        { start: 366, end: 366 }, { start: 375, end: 379 }, { start: 381, end: 382 }, { start: 391, end: 397 },
        { start: 399, end: 399 }, { start: 409, end: 411 }, { start: 414, end: 414 }, { start: 416, end: 416 },
        { start: 425, end: 427 }, { start: 430, end: 430 }, { start: 432, end: 432 }, { start: 442, end: 444 },
        { start: 447, end: 447 }, { start: 449, end: 449 }, { start: 458, end: 460 }, { start: 464, end: 465 },
        { start: 475, end: 477 }, { start: 480, end: 480 }, { start: 482, end: 482 },
      ],
      hpRanges: [
        { start: 10, end: 10 }, { start: 16, end: 16 }, { start: 20, end: 21 }, { start: 24, end: 25 },
        { start: 28, end: 29 }, { start: 31, end: 34 }, { start: 36, end: 71 },
      ],
    },
    {
      star: 2,
      atkBuckets: [{ start: 0, end: 1 }],
      defBuckets: [{ start: 4, end: 4 }],
      staBuckets: [{ start: 4, end: 4 }],
      cpRanges: [
        { start: 10, end: 10 }, { start: 25, end: 26 }, { start: 43, end: 44 }, { start: 60, end: 62 },
        { start: 78, end: 80 }, { start: 96, end: 98 }, { start: 113, end: 113 }, { start: 115, end: 116 },
        { start: 131, end: 131 }, { start: 133, end: 134 }, { start: 148, end: 148 }, { start: 150, end: 150 },
        { start: 152, end: 152 }, { start: 166, end: 166 }, { start: 168, end: 168 }, { start: 170, end: 170 },
        { start: 182, end: 182 }, { start: 185, end: 185 }, { start: 188, end: 188 }, { start: 199, end: 199 },
        { start: 202, end: 202 }, { start: 205, end: 205 }, { start: 216, end: 216 }, { start: 219, end: 219 },
        { start: 222, end: 222 }, { start: 232, end: 232 }, { start: 236, end: 236 }, { start: 239, end: 239 },
        { start: 249, end: 249 }, { start: 252, end: 252 }, { start: 256, end: 256 }, { start: 265, end: 265 },
        { start: 269, end: 269 }, { start: 273, end: 273 }, { start: 282, end: 282 }, { start: 286, end: 286 },
        { start: 290, end: 290 }, { start: 299, end: 299 }, { start: 303, end: 303 }, { start: 307, end: 307 },
        { start: 315, end: 315 }, { start: 320, end: 320 }, { start: 324, end: 324 }, { start: 332, end: 332 },
        { start: 337, end: 337 }, { start: 341, end: 341 }, { start: 348, end: 348 }, { start: 353, end: 353 },
        { start: 358, end: 358 }, { start: 365, end: 365 }, { start: 370, end: 370 }, { start: 376, end: 376 },
        { start: 382, end: 382 }, { start: 387, end: 387 }, { start: 393, end: 393 }, { start: 398, end: 398 },
        { start: 404, end: 404 }, { start: 415, end: 415 }, { start: 421, end: 421 }, { start: 432, end: 432 },
        { start: 438, end: 438 }, { start: 448, end: 448 }, { start: 455, end: 455 }, { start: 465, end: 465 },
        { start: 471, end: 471 }, { start: 481, end: 481 }, { start: 488, end: 488 },
      ],
      hpRanges: [
        { start: 10, end: 10 }, { start: 16, end: 16 }, { start: 21, end: 21 }, { start: 25, end: 25 },
        { start: 29, end: 29 }, { start: 32, end: 32 }, { start: 34, end: 34 }, { start: 37, end: 37 },
        { start: 39, end: 39 }, { start: 42, end: 42 }, { start: 44, end: 44 }, { start: 46, end: 46 },
        { start: 48, end: 49 }, { start: 51, end: 51 }, { start: 53, end: 53 }, { start: 55, end: 56 },
        { start: 58, end: 59 }, { start: 61, end: 62 }, { start: 64, end: 66 }, { start: 68, end: 71 },
      ],
    },
  ];

  const expected =
    '355&!0*,0attack&!0*,2defense&!0*,3hp&!0*,cp10,cp25,cp42,cp59,cp76,cp93,cp110,cp127,cp144,cp161,cp177,cp194,cp210,cp226,cp242,cp258,cp274,cp291,cp307,cp323,cp339,cp355,cp371,cp388,cp404,cp420,cp436,cp452,cp468&!0*,hp10,hp16,hp21,hp25,hp28,hp31,hp34,hp36,hp39,hp41,hp43,hp45,hp47-48,hp50,hp52-53,hp55,hp57-59,hp61-62,hp64-66,hp68-70&!1*,0-1attack&!1*,2-4defense&!1*,3-4hp&!1*,cp10,cp25,cp42-43,cp59-60,cp77-78,cp94-96,cp111-113,cp128-131,cp145-148,cp163-166,cp179-183,cp195-199,cp212-216,cp228-232,cp244-249,cp261-266,cp277-282,cp293-299,cp309-314,cp316,cp326-332,cp342-346,cp348-349,cp358-364,cp366,cp375-379,cp381-382,cp391-397,cp399,cp409-411,cp414,cp416,cp425-427,cp430,cp432,cp442-444,cp447,cp449,cp458-460,cp464-465,cp475-477,cp480,cp482&!1*,hp10,hp16,hp20-21,hp24-25,hp28-29,hp31-34,hp36-71&!2*,0-1attack&!2*,4defense&!2*,4hp&!2*,cp10,cp25-26,cp43-44,cp60-62,cp78-80,cp96-98,cp113,cp115-116,cp131,cp133-134,cp148,cp150,cp152,cp166,cp168,cp170,cp182,cp185,cp188,cp199,cp202,cp205,cp216,cp219,cp222,cp232,cp236,cp239,cp249,cp252,cp256,cp265,cp269,cp273,cp282,cp286,cp290,cp299,cp303,cp307,cp315,cp320,cp324,cp332,cp337,cp341,cp348,cp353,cp358,cp365,cp370,cp376,cp382,cp387,cp393,cp398,cp404,cp415,cp421,cp432,cp438,cp448,cp455,cp465,cp471,cp481,cp488&!2*,hp10,hp16,hp21,hp25,hp29,hp32,hp34,hp37,hp39,hp42,hp44,hp46,hp48-49,hp51,hp53,hp55-56,hp58-59,hp61-62,hp64-66,hp68-71&!3*';

  const result = assembleGeneralModeString('355', tierConditions, LANGUAGE_VOCAB.en);
  assert.equal(result, expected);
});

test('generateTrashModeString produces output that respects trashExcludePerfect (a bare "&!4*" flag, no 4-star CP/HP/bucket breakdown)', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateTrashModeString(
    {
      baseSpecies: eevee,
      checkedItems: [eevee],
      leagues: ['great'],
      topN: 20,
      language: 'en',
      excludePerfect: true,
      excludeZero: false,
      excludeXXL: false,
      excludeXXS: false,
      excludeXL: false,
      excludeXS: false,
      excludeTagged: false,
      excludeFavorited: false,
    },
    cache
  );
  assert.ok(result.endsWith('&!4*'), 'trashExcludePerfect must contribute a bare "&!4*" exclusion flag');
  assert.ok(!result.includes('&!4*,'), 'with blanket protection on there must be no 4-star tier breakdown clause');
  assert.ok(result.startsWith('133&'), 'the dex-number anchor appears once, at the very front');
});

const DEFAULT_STATE_FOR_TEST = {
  species: null,
  league: 'great',
  language: 'en',
  find100IV: false,
  find0IV: false,
  includedFamilyMembers: new Set(),
  topN: 10,
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

test('parseQueryToState ignores the evo param entirely when no valid species accompanies it', () => {
  // Without a species there is no family to validate against; the field must be omitted
  // (not an empty array) so the page state's Set-typed field is never overwritten.
  const parsed = parseQueryToState('evo=eevee,vaporeon', pokemonList);
  assert.equal('includedFamilyMembers' in parsed, false);
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

test('parseQueryToState ignores a maxLevel query param entirely (no longer a user-configurable field)', () => {
  // Ranking and projection level ceilings are now fixed constants (RANKING_MAX_LEVEL,
  // PROJECTION_MAX_LEVEL) rather than a page setting, so "maxLevel" is not a recognized URL
  // param at all anymore — a stale link carrying one (from before this field existed) must be
  // silently ignored, not read into the parsed state.
  const parsed = parseQueryToState('maxLevel=50', pokemonList);
  assert.equal('maxLevel' in parsed, false);
});

test('parseQueryToState rejects a boolean field value that is neither "true" nor "false"', () => {
  const parsed = parseQueryToState('xp=anything', pokemonList);
  assert.equal(parsed.trashExcludePerfect, undefined);
});
