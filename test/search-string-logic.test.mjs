import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCpmForLevel as getCpmForLevelForTest } from '../static/js/pvp/cpm.js';
import { calculateCP as calculateCPForTest, calculateBattleStats as calculateBattleStatsForTest } from '../static/js/pvp/stats.js';
import {
  collectNormalEvolutionChain,
  collectMegaForms,
  buildEvolutionChecklist,
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
  buildTrashModeTierConditions,
  LANGUAGE_VOCAB,
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

// #1
test('collectNormalEvolutionChain collects self and all branching evolutions (Eevee family)', () => {
  const chain = collectNormalEvolutionChain('eevee', pokemonList);
  assert.deepEqual(chain, ['eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon']);
});

// #2
test('collectNormalEvolutionChain skips a missing evolution reference instead of throwing', () => {
  const chain = collectNormalEvolutionChain('girafarig', pokemonList);
  assert.deepEqual(chain, ['girafarig']);
});

// #3
test('collectNormalEvolutionChain returns just the species itself when it has no further evolutions', () => {
  const chain = collectNormalEvolutionChain('mewtwo_armored', pokemonList);
  assert.deepEqual(chain, ['mewtwo_armored']);
});

// #4
test('collectMegaForms attaches Mega forms whose base ID is reachable from the chain (Charizard)', () => {
  const chain = collectNormalEvolutionChain('charmander', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas.sort(), ['charizard_mega_x', 'charizard_mega_y']);
});

// #5
test('collectMegaForms does NOT attach Raichu Mega forms to Alolan Raichu (same dex, not an evolution relation)', () => {
  const chain = collectNormalEvolutionChain('raichu_alolan', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, []);
});

// #6
test('collectMegaForms attaches Primal forms the same way as Megas (Kyogre)', () => {
  const chain = collectNormalEvolutionChain('kyogre', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.deepEqual(megas, ['kyogre_primal']);
});

// #7
test('collectMegaForms does NOT false-positive match on species whose name merely contains "mega" (Meganium, Yanmega)', () => {
  const chain = collectNormalEvolutionChain('chikorita', pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  assert.ok(!megas.includes('meganium'));
});

// #8
test('createRankingCache computes separately for different league or maxLevel keys', () => {
  const jolteon = { speciesId: 'jolteon', baseStats: pokemonList.find((p) => p.speciesId === 'jolteon').baseStats };
  const cache = createRankingCache();
  const great = cache.getRanking(jolteon, 'great', 50);
  const ultra = cache.getRanking(jolteon, 'ultra', 50);
  assert.notEqual(great, ultra);
  assert.ok(ultra.some((c) => c.ivs.atk === 0 && c.ivs.def === 12 && c.ivs.hp === 15 && c.level === 35));
});

// #9
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

// #10
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

// #11
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

// #12
test('computeProjectedCpHpSets caps enumeration at PROJECTION_MAX_LEVEL (35) even when the member qualified at a higher level', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const { cpSet } = computeProjectedCpHpSets([{ atk: 15, def: 15, hp: 15, maxLevel: 50 }], eevee.baseStats);
  assert.equal(cpSet.has(1210), false, 'CP reachable only above the projection cap (Lv50) must not appear');
});

// #13
test('computeProjectedCpHpSets enumerates whole levels only, never half levels', () => {
  // Only powering up puts a Pokemon on a half level, so the projection skips them — even when
  // the member qualifies up to one.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const { cpSet } = computeProjectedCpHpSets([{ atk: 0, def: 8, hp: 14, maxLevel: 18.5 }], eevee.baseStats);
  assert.ok(cpSet.has(466), 'projected CP at the whole level 18 must be present');
  assert.ok(!cpSet.has(479), 'projected CP at the half level 18.5 must NOT be present');
});

// #14
test('computeApprBucketSets collects the bucket values seen across all tier members', () => {
  const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets([
    { atk: 0, def: 12, hp: 15 },
    { atk: 1, def: 10, hp: 14 },
  ]);
  assert.deepEqual([...atkBucketSet].sort(), [0, 1]);
  assert.deepEqual([...defBucketSet].sort(), [2, 3]);
  assert.deepEqual([...staBucketSet].sort(), [3, 4]);
});

// #15
test('compressToRanges merges consecutive runs but keeps gaps separate', () => {
  assert.deepEqual(compressToRanges([1, 2, 3, 5, 7, 8, 9]), [
    { start: 1, end: 3 },
    { start: 5, end: 5 },
    { start: 7, end: 9 },
  ]);
});

// #16
test('complementForTrash inverts a value set into safe ranges, always ending in an open tail', () => {
  assert.deepEqual(complementForTrash(new Set([12, 13, 15]), 10), [
    { start: 10, end: 11 },
    { start: 14, end: 14 },
    { start: 16, end: null },
  ]);

  assert.deepEqual(complementForTrash(new Set(), 10), [{ start: 10, end: null }]);
});

// #17
test('complementBucketSet returns the missing bucket values within the closed 0-4 range', () => {
  assert.deepEqual(complementBucketSet(new Set([0, 4])), [1, 2, 3]);
  assert.deepEqual(complementBucketSet(new Set([0, 1, 2, 3, 4])), []);
});

// #18
test('generateTrashModeString with trashExcludeZero appends the reference "at least one bucket >= 1" clause protecting exactly 0/0/0', () => {
  // Only an exact 0/0/0 has every bucket at 0, and one match is enough to flag a mon, so this
  // cannot be done by carving values out of the tier complements — it needs its own clause.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const baseContext = {
    baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 20, language: 'en',
    excludePerfect: true, excludeZero: true,
    excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
    excludeTagged: false, excludeFavorited: false,
  };

  assert.ok(generateTrashModeString(baseContext, cache).endsWith('&1-4attack,1-4defense,1-4hp'));
  assert.ok(!generateTrashModeString({ ...baseContext, excludeZero: false }, cache).includes('1-4attack'));
});

// #19
test('generateTrashModeString renders the favorited exclusion with the localized favorite word, not a symbol', () => {
  // The game only understands the translated favorite word. The old "&!<3" symbol did nothing.
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
  assert.ok(generateTrashModeString({ ...context, language: 'ja' }, cache).endsWith('&!お気に入り'));
});

// #20
test('generateTrashModeString emits the 4-star tier clause when a hundo itself qualifies and blanket protection is off (regression)', () => {
  // Master League's Top N always contains the hundo. With blanket protection off there used to
  // be no 4-star clause at all, so even the rank-1 hundo got flagged as trash.
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
  // Tier 4 is all 15/15/15, so its complements are 0-3 and a real hundo matches none of them.
  assert.ok(result.includes('&!4*,0-3attack,0-3defense,0-3hp,'), 'the 4-star clause must be present with its bucket complements');
});

function rangesInclude(ranges, value) {
  return ranges.some((r) => value >= r.start && (r.end === null || value <= r.end));
}

// A mon's own tier is the only clause that isn't trivially true for it, so it gets flagged when
// any one of that tier's five complement groups matches. Checking all five instead once hid a
// real leak. With no clause for its tier at all, nothing filters the mon and every remaining
// clause passes, so it is flagged — see #22, which guards against losing a tier's clause.
function trashConditionsFlag(trashConditions, member, cp, hp) {
  const star = starTierForIvSum(member.atk + member.def + member.hp);
  const tier = trashConditions.find((c) => c.star === star);
  if (!tier) return true;
  return (
    rangesInclude(tier.cpRanges, cp) ||
    rangesInclude(tier.hpRanges, hp) ||
    rangesInclude(tier.atkBuckets, apprBucket(member.atk)) ||
    rangesInclude(tier.defBuckets, apprBucket(member.def)) ||
    rangesInclude(tier.staBuckets, apprBucket(member.hp))
  );
}

// #21
test('the Trash safety invariant holds for the real Eevee family / Great League / Top 20', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const checklist = buildEvolutionChecklist('eevee', pokemonList); // Eevee + 8 Eeveelutions, no Mega
  const cache = createRankingCache();

  const pool = mergeQualifyingRecords(
    checklist.map((speciesId) => {
      const mon = pokemonList.find((p) => p.speciesId === speciesId);
      return sliceTopN(cache.getRanking(mon, 'great', RANKING_MAX_LEVEL), 20);
    })
  );
  const trashConditions = buildTrashModeTierConditions(groupPoolByStarTier(pool), eevee.baseStats);

  // Nothing worth keeping may be flagged by its own tier's clause. The guarantee covers whole
  // levels only — a powered-up keeper on a half level is left to the favorited filter.
  let checkedAboveWildCeiling = 0;

  for (const member of pool.values()) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };

    for (let level = 1; level <= member.maxLevel; level += 1) {
      const cpm = getCpmForLevelForTest(level);
      const cp = calculateCPForTest(eevee.baseStats, ivs, cpm);
      const hp = calculateBattleStatsForTest(eevee.baseStats, ivs, cpm).hp;
      if (level > PROJECTION_MAX_LEVEL) checkedAboveWildCeiling++;

      assert.ok(
        !trashConditionsFlag(trashConditions, member, cp, hp),
        `qualifying member atk=${member.atk} def=${member.def} hp=${member.hp} at level ${level} (CP ${cp}, HP ${hp}) must not be flagged by its own Trash tier clause`
      );
    }
  }

  // Capping Trash's projection at the wild-catch ceiling once left the open tail sitting just
  // above the level-35 CP, declaring every powered-up keeper beyond it safe to delete. If this
  // scenario ever stops reaching past that ceiling, it no longer covers that case.
  assert.ok(checkedAboveWildCeiling > 0, 'this scenario must exercise levels above the wild-catch ceiling, or it proves nothing');
});

// #22
test('when a star tier has no section in the Trash string, even the good ones in it count as trash', () => {
  // Only a mon's own tier restricts it — every other tier's section opens with "not N stars",
  // which is trivially true for it. Drop a tier's section and nothing filters that tier at all,
  // so its keepers pass the whole string and land in the delete list. The 4-star tier is left
  // out here: under blanket protection it is a bare "&!4*", and #20 covers the other case.
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const checkedItems = buildEvolutionChecklist('eevee', pokemonList).map((speciesId) =>
    pokemonList.find((p) => p.speciesId === speciesId));
  const cache = createRankingCache();

  const pool = mergeQualifyingRecords(
    checkedItems.map((mon) => sliceTopN(cache.getRanking(mon, 'great', RANKING_MAX_LEVEL), 20))
  );
  const populatedTiers = [...groupPoolByStarTier(pool).keys()].filter((star) => star <= 3);

  const result = generateTrashModeString(
    {
      baseSpecies: eevee, checkedItems, leagues: ['great'], topN: 20, language: 'en',
      excludePerfect: true, excludeZero: false,
      excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
      excludeTagged: false, excludeFavorited: false,
    },
    cache
  );

  assert.ok(populatedTiers.length > 0, 'sanity check: this scenario must populate at least one star tier');
  for (const star of populatedTiers) {
    assert.ok(
      result.includes(`&!${star}*,`),
      `star tier ${star} has qualifying members, so the string must carry its own section`
    );
  }
});

// #23
test('the star marker repeats before every group in General mode, but appears only once in Trash mode', () => {
  // General lists what a keeper looks like, so all five groups must match. Trash lists what a
  // keeper never has, so one match is enough. A prior revision made Trash mirror General.
  const condition = {
    star: 1,
    atkBuckets: [{ start: 0, end: 1 }],
    defBuckets: [{ start: 2, end: 2 }],
    staBuckets: [{ start: 4, end: 4 }],
    cpRanges: [{ start: 10, end: 10 }, { start: 25, end: 25 }],
    hpRanges: [{ start: 10, end: 10 }],
  };

  assert.equal(formatGeneralTierGroups(condition, LANGUAGE_VOCAB.en), '&!1*,0-1attack&!1*,2defense&!1*,4hp&!1*,cp10,cp25&!1*,hp10');
  assert.equal(formatTrashTierGroups(condition, LANGUAGE_VOCAB.en), '&!1*,0-1attack,2defense,4hp,cp10,cp25,hp10');
});

// #24
test('generateGlobalIvExtremeString expresses each toggle combination as AND-ed clauses', () => {
  // Both toggles at once used to emit "4attack&4defense&4hp,0attack&0defense&0hp", which the
  // game grammar reads as a single unsatisfiable condition and matches nothing.
  assert.equal(generateGlobalIvExtremeString(true, false, 'en'), '4attack&4defense&4hp');
  assert.equal(generateGlobalIvExtremeString(false, true, 'en'), '0attack&0defense&0hp');
  assert.equal(generateGlobalIvExtremeString(true, true, 'en'), '4*,0attack&4*,0defense&4*,0hp');
  assert.equal(generateGlobalIvExtremeString(false, false, 'en'), null);
});

// #25
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

// #26
test('assembleGeneralModeString matches a real, verified working search string character-for-character (Duskull family / Great League / Top 10, star tiers 0-2 populated, 3 empty, 4 absent)', () => {
  // Ground truth from a real-device test (Duskull family, Great League, Top 10). That string
  // anchored on the species name; the dex anchor replaced it later and was verified separately.
  // What this pins is the assembled shape, not the anchor.
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

// #27
test('generateTrashModeString produces output that respects trashExcludePerfect (a bare "&!4*" flag, no 4-star CP/HP/bucket breakdown)', () => {
  const eevee = pokemonList.find((p) => p.speciesId === 'eevee');
  const cache = createRankingCache();
  const result = generateTrashModeString(
    {
      baseSpecies: eevee, checkedItems: [eevee], leagues: ['great'], topN: 20, language: 'en',
      excludePerfect: true, excludeZero: false,
      excludeXXL: false, excludeXXS: false, excludeXL: false, excludeXS: false,
      excludeTagged: false, excludeFavorited: false,
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

// #28
test('serializeStateToQuery writes only the fields that differ from their default', () => {
  assert.equal(serializeStateToQuery(DEFAULT_STATE_FOR_TEST), '');

  const params = new URLSearchParams(
    serializeStateToQuery({ ...DEFAULT_STATE_FOR_TEST, species: 'eevee', league: 'ultra', topN: 20 })
  );
  assert.equal(params.get('mon'), 'eevee');
  assert.equal(params.get('league'), 'ultra');
  assert.equal(params.get('topN'), '20');
  assert.equal(params.has('lang'), false);
});

// #29
test('parseQueryToState round-trips trashExcludeFavorited: false back to false (regression)', () => {
  // The page starts this switched on. If the URL default disagreed, an explicit "off" would look
  // like the default, get dropped from the link, and come back on for whoever opened it.
  const original = { ...DEFAULT_STATE_FOR_TEST, species: 'charmander', trashExcludeFavorited: false };
  const query = serializeStateToQuery(original);
  const parsed = parseQueryToState(query, pokemonList);
  assert.equal(parsed.trashExcludeFavorited, false);
});

// #30
test('serializeStateToQuery always writes the evo param once a species is selected, even with nothing checked', () => {
  // An omitted evo param is indistinguishable from "never set", which a restored link reads as
  // "everything checked" rather than "nothing checked".
  const some = new URLSearchParams(
    serializeStateToQuery({ ...DEFAULT_STATE_FOR_TEST, species: 'eevee', includedFamilyMembers: new Set(['eevee', 'vaporeon']) })
  );
  assert.equal(some.get('evo'), 'eevee,vaporeon');

  const none = new URLSearchParams(
    serializeStateToQuery({ ...DEFAULT_STATE_FOR_TEST, species: 'eevee', includedFamilyMembers: new Set() })
  );
  assert.equal(none.has('evo'), true);
  assert.equal(none.get('evo'), '');
});

// #31
test('parseQueryToState keeps only the evo ids that are genuinely part of the species\' family', () => {
  const parsed = parseQueryToState('mon=eevee&evo=eevee,vaporeon,mewtwo', pokemonList);
  assert.deepEqual(parsed.includedFamilyMembers, ['eevee', 'vaporeon']);
});

// #32
test('parseQueryToState ignores the evo param entirely when no valid species accompanies it', () => {
  // Without a species there is no family to validate against; the field must be omitted
  // (not an empty array) so the page state's Set-typed field is never overwritten.
  const parsed = parseQueryToState('evo=eevee,vaporeon', pokemonList);
  assert.equal('includedFamilyMembers' in parsed, false);
});

// #33
test('parseQueryToState keeps a field only when its value passes validation', () => {
  const rejected = [
    ['mon=not-a-real-species', 'species'],
    ['league=bogus', 'league'],
    ['lang=klingon', 'language'],
    ['xp=anything', 'trashExcludePerfect'],
    ['topN=not-a-number', 'topN'],
    ['topN=0', 'topN'],
    ['topN=4097', 'topN'],
    ['topN=12.5', 'topN'],
  ];
  for (const [query, field] of rejected) {
    assert.equal(parseQueryToState(query, pokemonList)[field], undefined, `"${query}" must not set ${field}`);
  }

  const accepted = [
    ['league=great', 'league', 'great'],
    ['league=ultra', 'league', 'ultra'],
    ['league=master', 'league', 'master'],
    ['league=all', 'league', 'all'],
    ['topN=4096', 'topN', 4096],
  ];
  for (const [query, field, expected] of accepted) {
    assert.equal(parseQueryToState(query, pokemonList)[field], expected, `"${query}" must set ${field}`);
  }
});
