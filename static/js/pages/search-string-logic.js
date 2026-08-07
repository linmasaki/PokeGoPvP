import { rankIVCombinations } from '../pvp/ranker.js';
import { getCpCapForLeague } from './rankings-logic.js';
import { getCpmForLevel } from '../pvp/cpm.js';
import { calculateCP, calculateBattleStats } from '../pvp/stats.js';

const MEGA_SUFFIX_PATTERN = /_mega(_[xy])?$/;

export function collectNormalEvolutionChain(speciesId, pokemonList) {
  const chain = [];
  const visited = new Set();
  const queue = [speciesId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const mon = pokemonList.find((p) => p.speciesId === currentId);
    if (!mon) {
      console.warn(`collectNormalEvolutionChain: species "${currentId}" not found in pokemonList, skipping`);
      continue;
    }
    chain.push(currentId);

    const evolutions = mon.family?.evolutions ?? [];
    for (const evoId of evolutions) {
      if (!visited.has(evoId)) queue.push(evoId);
    }
  }

  return chain;
}

export function collectMegaForms(chainSpeciesIds, pokemonList) {
  const chainSet = new Set(chainSpeciesIds);
  const megas = [];
  for (const mon of pokemonList) {
    if (!MEGA_SUFFIX_PATTERN.test(mon.speciesId)) continue;
    const baseId = mon.speciesId.replace(MEGA_SUFFIX_PATTERN, '');
    if (chainSet.has(baseId)) megas.push(mon.speciesId);
  }
  return megas;
}

export function buildEvolutionChecklist(speciesId, pokemonList) {
  const chain = collectNormalEvolutionChain(speciesId, pokemonList);
  const megas = collectMegaForms(chain, pokemonList);
  return [...chain, ...megas];
}

export function rankEvaluatedSpecies(baseStats, league, maxLevel) {
  const cpCap = getCpCapForLeague(league);
  return rankIVCombinations(baseStats, { ivFloor: 0, minLevel: 1, maxLevel, cpCap });
}

export function createRankingCache() {
  const cache = new Map();
  return {
    getRanking(mon, league, maxLevel) {
      const key = `${mon.speciesId}:${league}:${maxLevel}`;
      if (!cache.has(key)) {
        cache.set(key, rankEvaluatedSpecies(mon.baseStats, league, maxLevel));
      }
      return cache.get(key);
    },
  };
}

export function sliceTopN(rankedList, topN) {
  return rankedList.slice(0, topN);
}

export function starTierForIvSum(ivSum) {
  if (ivSum <= 22) return 0;
  if (ivSum <= 29) return 1;
  if (ivSum <= 36) return 2;
  if (ivSum <= 44) return 3;
  return 4;
}

export function apprBucket(iv) {
  if (iv === 15) return 4;
  return Math.ceil(iv / 5);
}

export function mergeQualifyingRecords(qualifyingLists) {
  const pool = new Map();
  for (const list of qualifyingLists) {
    for (const record of list) {
      const key = `${record.ivs.atk}-${record.ivs.def}-${record.ivs.hp}`;
      const existing = pool.get(key);
      if (!existing || record.level > existing.maxLevel) {
        pool.set(key, { atk: record.ivs.atk, def: record.ivs.def, hp: record.ivs.hp, maxLevel: record.level });
      }
    }
  }
  return pool;
}

export function groupPoolByStarTier(pool) {
  const grouped = new Map();
  for (const member of pool.values()) {
    const ivSum = member.atk + member.def + member.hp;
    const star = starTierForIvSum(ivSum);
    if (!grouped.has(star)) grouped.set(star, []);
    grouped.get(star).push({ ...member, ivSum });
  }
  return grouped;
}

export function computeProjectedCpHpSets(tierMembers, baseStats) {
  const cpSet = new Set();
  const hpSet = new Set();
  for (const member of tierMembers) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };
    for (let level = 1; level <= member.maxLevel; level += 0.5) {
      const cpm = getCpmForLevel(level);
      cpSet.add(calculateCP(baseStats, ivs, cpm));
      hpSet.add(Math.round(calculateBattleStats(baseStats, ivs, cpm).hp));
    }
  }
  return { cpSet, hpSet };
}

export function computeApprBucketSets(tierMembers) {
  const atkBucketSet = new Set();
  const defBucketSet = new Set();
  const staBucketSet = new Set();
  for (const member of tierMembers) {
    atkBucketSet.add(apprBucket(member.atk));
    defBucketSet.add(apprBucket(member.def));
    staBucketSet.add(apprBucket(member.hp));
  }
  return { atkBucketSet, defBucketSet, staBucketSet };
}

export function compressToRanges(sortedNumbers) {
  const ranges = [];
  let i = 0;
  while (i < sortedNumbers.length) {
    const start = sortedNumbers[i];
    let end = start;
    while (i + 1 < sortedNumbers.length && sortedNumbers[i + 1] === end + 1) {
      end = sortedNumbers[++i];
    }
    ranges.push({ start, end });
    i++;
  }
  return ranges;
}

export function complementForTrash(valueSet, floorValue) {
  if (valueSet.size === 0) return [{ start: floorValue, end: null }];

  const max = Math.max(...valueSet);
  const missing = [];
  for (let v = floorValue; v <= max; v++) {
    if (!valueSet.has(v)) missing.push(v);
  }

  const ranges = compressToRanges(missing);
  ranges.push({ start: max + 1, end: null });
  return ranges;
}

export function complementBucketSet(bucketSet) {
  return [0, 1, 2, 3, 4].filter((b) => !bucketSet.has(b));
}

export function buildGeneralModeTierConditions(starTierGroups, baseStats) {
  const conditions = [];
  for (const [star, members] of starTierGroups) {
    const { cpSet, hpSet } = computeProjectedCpHpSets(members, baseStats);
    const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets(members);

    conditions.push({
      star,
      cpRanges: compressToRanges([...cpSet].sort((a, b) => a - b)),
      hpRanges: compressToRanges([...hpSet].sort((a, b) => a - b)),
      atkBuckets: compressToRanges([...atkBucketSet].sort((a, b) => a - b)),
      defBuckets: compressToRanges([...defBucketSet].sort((a, b) => a - b)),
      staBuckets: compressToRanges([...staBucketSet].sort((a, b) => a - b)),
    });
  }
  return conditions.sort((a, b) => a.star - b.star);
}

const CP_FLOOR = 10;
const HP_FLOOR = 10;

export function buildTrashModeTierConditions(starTierGroups, baseStats, options) {
  // CP/HP must be excluded GLOBALLY (across every star tier's qualifying members, not
  // just each tier's own) before taking the complement. A per-tier-only complement only
  // protects that tier's own members — a qualifying member from a DIFFERENT tier can slip
  // through if its projected CP/HP/bucket signature happens to land inside that other
  // tier's complement, since that tier's complement was never told to exclude it. Verified
  // empirically against the Eevee/Great League/Top 20/Max Level 50 example: the per-tier-only
  // version produces 12 real safety-invariant violations. Precomputing the union once (rather
  // than recomputing every other tier's set inside the per-star loop) also avoids O(tiers²)
  // redundant work.
  const allCpValues = new Set();
  const allHpValues = new Set();
  for (const members of starTierGroups.values()) {
    const { cpSet, hpSet } = computeProjectedCpHpSets(members, baseStats);
    for (const cp of cpSet) allCpValues.add(cp);
    for (const hp of hpSet) allHpValues.add(hp);
  }

  const conditions = [];

  for (let star = 0; star <= 4; star++) {
    if (star === 4 && options.excludePerfect) continue;

    const members = starTierGroups.get(star) ?? [];
    const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets(members);
    const cpSet = new Set(allCpValues);
    const hpSet = new Set(allHpValues);

    if (star === 0 && options.excludeZero) {
      for (let level = 1; level <= 51; level += 0.5) {
        const cpm = getCpmForLevel(level);
        cpSet.add(calculateCP(baseStats, { atk: 0, def: 0, hp: 0 }, cpm));
        hpSet.add(Math.round(calculateBattleStats(baseStats, { atk: 0, def: 0, hp: 0 }, cpm).hp));
      }
    }

    conditions.push({
      star,
      cpRanges: complementForTrash(cpSet, CP_FLOOR),
      hpRanges: complementForTrash(hpSet, HP_FLOOR),
      atkBuckets: compressToRanges(complementBucketSet(atkBucketSet)),
      defBuckets: compressToRanges(complementBucketSet(defBucketSet)),
      staBuckets: compressToRanges(complementBucketSet(staBucketSet)),
    });
  }

  return conditions;
}

export const LANGUAGE_VOCAB = {
  en: { cp: 'cp', hp: 'hp', atk: 'atk', def: 'def', sta: 'sta' },
  'zh-TW': { cp: 'cp', hp: 'hp', atk: '攻擊', def: '防禦', sta: '耐力' },
  ja: { cp: 'cp', hp: 'hp', atk: 'こうげき', def: 'ぼうぎょ', sta: 'たいりょく' },
};

export function formatRangeList(ranges) {
  return ranges
    .map((r) => {
      if (r.end === null) return `${r.start}-`;
      if (r.start === r.end) return `${r.start}`;
      return `${r.start}-${r.end}`;
    })
    .join(',');
}

export function formatTierCondition(condition, language) {
  const vocab = LANGUAGE_VOCAB[language];
  const parts = [
    `${formatRangeList(condition.cpRanges)}${vocab.cp}`,
    `${formatRangeList(condition.hpRanges)}${vocab.hp}`,
    `${formatRangeList(condition.atkBuckets)}${vocab.atk}*`,
    `${formatRangeList(condition.defBuckets)}${vocab.def}*`,
    `${formatRangeList(condition.staBuckets)}${vocab.sta}*`,
  ];
  return parts.join('&');
}

function collectQualifyingListsForContext(context, rankingCache) {
  const lists = [];
  for (const item of context.checkedItems) {
    for (const league of context.leagues) {
      const fullRanking = rankingCache.getRanking(item, league, context.maxLevel);
      lists.push(sliceTopN(fullRanking, context.topN));
    }
  }
  return lists;
}

const TRASH_SUFFIX_FLAGS = [
  ['excludeXXL', '!XXL'],
  ['excludeXXS', '!XXS'],
  ['excludeXL', '!XL'],
  ['excludeXS', '!XS'],
  ['excludeTagged', '!#'],
  ['excludeFavorited', '!<3'],
];

export function generateGeneralModeString(context, rankingCache) {
  if (context.checkedItems.length === 0) return null;

  const qualifyingLists = collectQualifyingListsForContext(context, rankingCache);
  const pool = mergeQualifyingRecords(qualifyingLists);
  const grouped = groupPoolByStarTier(pool);
  const tierConditions = buildGeneralModeTierConditions(grouped, context.baseSpecies.baseStats);

  return tierConditions
    .map((c) => `${context.baseSpecies.speciesName}&${formatTierCondition(c, context.language)}`)
    .join(',');
}

export function generateTrashModeString(context, rankingCache) {
  if (context.checkedItems.length === 0) return null;

  const qualifyingLists = collectQualifyingListsForContext(context, rankingCache);
  const pool = mergeQualifyingRecords(qualifyingLists);
  const grouped = groupPoolByStarTier(pool);
  const tierConditions = buildTrashModeTierConditions(grouped, context.baseSpecies.baseStats, {
    excludePerfect: context.excludePerfect,
    excludeZero: context.excludeZero,
  });

  const suffix = TRASH_SUFFIX_FLAGS.filter(([flag]) => context[flag])
    .map(([, symbol]) => `&${symbol}`)
    .join('');

  const tierClauses = tierConditions.map((c) => `${formatTierCondition(c, context.language)}${suffix}`);
  return tierClauses.map((clause) => `${context.baseSpecies.speciesName}&${clause}`).join(',');
}

export function generateGlobalIvExtremeString(find100IV, find0IV, language) {
  if (!find100IV && !find0IV) return null;

  const vocab = LANGUAGE_VOCAB[language];
  const parts = [];
  if (find100IV) parts.push(`4${vocab.atk}*&4${vocab.def}*&4${vocab.sta}*`);
  if (find0IV) parts.push(`0${vocab.atk}*&0${vocab.def}*&0${vocab.sta}*`);
  return parts.join(',');
}
