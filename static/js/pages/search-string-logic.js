import { rankIVCombinations } from '../pvp/ranker.js';
import { getCpCapForLeague } from '../pvp/leagues.js';
import { getCpmForLevel } from '../pvp/cpm.js';
import { calculateCP, calculateBattleStats } from '../pvp/stats.js';

// Mega and Primal are the same category: temporary battle forms whose IVs carry over from the
// base mon, listed in pokemon.json as "<base>_mega[_x|_y]" / "<base>_primal".
const MEGA_SUFFIX_PATTERN = /_(?:mega(?:_[xy])?|primal)$/;

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

// The level a Pokemon can be raised to, and the level a wild one can be caught at.
export const RANKING_MAX_LEVEL = 51;
export const PROJECTION_MAX_LEVEL = 35;

export function computeProjectedCpHpSets(tierMembers, baseStats, levelCap = PROJECTION_MAX_LEVEL) {
  const cpSet = new Set();
  const hpSet = new Set();
  for (const member of tierMembers) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };
    const cappedMaxLevel = Math.min(member.maxLevel, levelCap);
    for (let level = 1; level <= cappedMaxLevel; level += 1) {
      const cpm = getCpmForLevel(level);
      cpSet.add(calculateCP(baseStats, ivs, cpm));
      hpSet.add(calculateBattleStats(baseStats, ivs, cpm).hp);
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

const ascending = (valueSet) => [...valueSet].sort((a, b) => a - b);

export function buildGeneralModeTierConditions(starTierGroups, baseStats) {
  const conditions = [];
  for (const [star, members] of starTierGroups) {
    const { cpSet, hpSet } = computeProjectedCpHpSets(members, baseStats);
    const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets(members);

    conditions.push({
      star,
      cpRanges: compressToRanges(ascending(cpSet)),
      hpRanges: compressToRanges(ascending(hpSet)),
      atkBuckets: compressToRanges(ascending(atkBucketSet)),
      defBuckets: compressToRanges(ascending(defBucketSet)),
      staBuckets: compressToRanges(ascending(staBucketSet)),
    });
  }
  return conditions;
}

const CP_FLOOR = 10;
const HP_FLOOR = 10;

export function buildTrashModeTierConditions(starTierGroups, baseStats) {
  const allCpValues = new Set();
  const allHpValues = new Set();
  for (const members of starTierGroups.values()) {
    const { cpSet, hpSet } = computeProjectedCpHpSets(members, baseStats, RANKING_MAX_LEVEL);
    for (const cp of cpSet) allCpValues.add(cp);
    for (const hp of hpSet) allHpValues.add(hp);
  }

  // Every tier gets the same CP/HP ranges, so build them once here. Only the buckets differ.
  const cpRanges = complementForTrash(allCpValues, CP_FLOOR);
  const hpRanges = complementForTrash(allHpValues, HP_FLOOR);

  const conditions = [];
  for (let star = 0; star <= 4; star++) {
    const members = starTierGroups.get(star) ?? [];
    const { atkBucketSet, defBucketSet, staBucketSet } = computeApprBucketSets(members);
    conditions.push({
      star,
      cpRanges,
      hpRanges,
      atkBuckets: compressToRanges(complementBucketSet(atkBucketSet)),
      defBuckets: compressToRanges(complementBucketSet(defBucketSet)),
      staBuckets: compressToRanges(complementBucketSet(staBucketSet)),
    });
  }

  return conditions;
}

export const LANGUAGE_VOCAB = {
  en: { cp: 'cp', hp: 'hp', atk: 'attack', def: 'defense', fav: 'favorite' },
  'zh-TW': { cp: 'cp', hp: 'hp', atk: '攻擊', def: '防禦', fav: '我的最愛' },
  ja: { cp: 'cp', hp: 'hp', atk: 'こうげき', def: 'ぼうぎょ', fav: 'お気に入り' },
};

// A tier is built from five groups, always in this order — attack bucket, defense bucket,
// stamina bucket, CP list, HP list — and the two kinds of group word their terms differently:
//
//   0-1attack , 3-4defense , 4hp , cp10,cp25-27 , hp12-14
//
// Buckets put the word after the number, CP/HP before it. Either way a run of consecutive
// values collapses to "start-end" and carries the word just once.
export function formatValueTerms(ranges, word) {
  return ranges
    .map((r) => {
      if (r.end === null) return `${word}${r.start}-`;
      if (r.start === r.end) return `${word}${r.start}`;
      return `${word}${r.start}-${r.end}`;
    })
    .join(',');
}

export function formatBucketTerms(ranges, word) {
  return ranges
    .map((r) => (r.start === r.end ? `${r.start}${word}` : `${r.start}-${r.end}${word}`))
    .join(',');
}

function tierGroupTerms(condition, vocab) {
  return [
    formatBucketTerms(condition.atkBuckets, vocab.atk),
    formatBucketTerms(condition.defBuckets, vocab.def),
    formatBucketTerms(condition.staBuckets, vocab.hp),
    formatValueTerms(condition.cpRanges, vocab.cp),
    formatValueTerms(condition.hpRanges, vocab.hp),
  ];
}

export function formatGeneralTierGroups(condition, vocab) {
  return tierGroupTerms(condition, vocab)
    .map((group) => `&!${condition.star}*,${group}`)
    .join('');
}

// General lists what a keeper looks like — all five groups must match. Trash lists what a
// keeper never has, so one match is enough. Don't make this one look like General.
export function formatTrashTierGroups(condition, vocab) {
  return `&!${condition.star}*,${tierGroupTerms(condition, vocab).join(',')}`;
}

function collectQualifyingListsForContext(context, rankingCache) {
  const lists = [];
  for (const item of context.checkedItems) {
    for (const league of context.leagues) {
      const fullRanking = rankingCache.getRanking(item, league, RANKING_MAX_LEVEL);
      lists.push(sliceTopN(fullRanking, context.topN));
    }
  }
  return lists;
}

function collectStarTierGroups(context, rankingCache) {
  const qualifyingLists = collectQualifyingListsForContext(context, rankingCache);
  return groupPoolByStarTier(mergeQualifyingRecords(qualifyingLists));
}

// Symbols only. The favorited exclusion needs a translated word, so it is added separately.
const TRASH_SUFFIX_FLAGS = [
  ['excludeXXL', '!XXL'],
  ['excludeXXS', '!XXS'],
  ['excludeXL', '!XL'],
  ['excludeXS', '!XS'],
  ['excludeTagged', '!#'],
];

export function assembleGeneralModeString(anchor, tierConditions, vocab) {
  const byStar = new Map(tierConditions.map((c) => [c.star, c]));

  let result = anchor;
  for (let star = 0; star <= 3; star++) {
    const condition = byStar.get(star);
    if (condition) result += formatGeneralTierGroups(condition, vocab);
  }
  for (let star = 0; star <= 3; star++) {
    if (!byStar.has(star)) result += `&!${star}*`;
  }
  if (byStar.has(4)) result += ',4*';

  return result;
}

export function generateGeneralModeString(context, rankingCache) {
  if (context.checkedItems.length === 0) return null;

  const grouped = collectStarTierGroups(context, rankingCache);
  const tierConditions = buildGeneralModeTierConditions(grouped, context.baseSpecies.baseStats);
  const vocab = LANGUAGE_VOCAB[context.language];

  return assembleGeneralModeString(String(context.baseSpecies.dex), tierConditions, vocab);
}

// A tier with nothing worth keeping is skipped: it would accept everything anyway, so writing
// it out only makes the string longer.
export function generateTrashModeString(context, rankingCache) {
  if (context.checkedItems.length === 0) return null;

  const grouped = collectStarTierGroups(context, rankingCache);
  const tierConditions = buildTrashModeTierConditions(grouped, context.baseSpecies.baseStats);
  const vocab = LANGUAGE_VOCAB[context.language];
  const byStar = new Map(tierConditions.map((c) => [c.star, c]));

  let result = String(context.baseSpecies.dex);
  for (let star = 0; star <= 3; star++) {
    if (!grouped.has(star)) continue;
    result += formatTrashTierGroups(byStar.get(star), vocab);
  }

  if (context.excludePerfect) {
    result += '&!4*';
  } else if (grouped.has(4)) {
    result += formatTrashTierGroups(byStar.get(4), vocab);
  }

  result += TRASH_SUFFIX_FLAGS.filter(([flag]) => context[flag])
    .map(([, symbol]) => `&${symbol}`)
    .join('');

  if (context.excludeZero) {
    result += `&1-4${vocab.atk},1-4${vocab.def},1-4${vocab.hp}`;
  }
  if (context.excludeFavorited) result += `&!${vocab.fav}`;

  return result;
}

export function generateGlobalIvExtremeString(find100IV, find0IV, language) {
  if (!find100IV && !find0IV) return null;

  const vocab = LANGUAGE_VOCAB[language];
  if (find100IV && find0IV) {
    return `4*,0${vocab.atk}&4*,0${vocab.def}&4*,0${vocab.hp}`;
  }
  if (find100IV) return `4${vocab.atk}&4${vocab.def}&4${vocab.hp}`;
  return `0${vocab.atk}&0${vocab.def}&0${vocab.hp}`;
}

const URL_PARAM_DEFAULTS = {
  species: null,
  league: 'great',
  language: 'en',
  find100IV: false,
  find0IV: false,
  topN: 10,
  trash: false,
  trashExcludePerfect: true,
  trashExcludeZero: true,
  trashExcludeXXL: false,
  trashExcludeXXS: false,
  trashExcludeXL: false,
  trashExcludeXS: false,
  trashExcludeTagged: false,
  trashExcludeFavorited: true,
};

const URL_PARAM_KEYS = {
  species: 'mon',
  league: 'league',
  language: 'lang',
  find100IV: 'f100',
  find0IV: 'f0',
  topN: 'topN',
  trash: 'trash',
  trashExcludePerfect: 'xp',
  trashExcludeZero: 'xz',
  trashExcludeXXL: 'xxl',
  trashExcludeXXS: 'xxs',
  trashExcludeXL: 'xl',
  trashExcludeXS: 'xs',
  trashExcludeTagged: 'xt',
  trashExcludeFavorited: 'xf',
};

export function serializeStateToQuery(state) {
  const params = new URLSearchParams();
  for (const [field, paramKey] of Object.entries(URL_PARAM_KEYS)) {
    const value = state[field];
    if (value === URL_PARAM_DEFAULTS[field]) continue;
    if (value === null || value === undefined) continue;
    params.set(paramKey, String(value));
  }

  // Always written out, even when empty. A missing evo param means "nothing was ever picked",
  // which the link would restore as every member checked rather than none.
  if (state.species && state.includedFamilyMembers) {
    params.set('evo', [...state.includedFamilyMembers].join(','));
  }

  return params.toString();
}

const VALID_LEAGUES = new Set(['great', 'ultra', 'master', 'all']);
const VALID_LANGUAGES = new Set(Object.keys(LANGUAGE_VOCAB));
const TOP_N_MIN = 1;
const TOP_N_MAX = 4096;

export function parseQueryToState(queryString, pokemonList) {
  const params = new URLSearchParams(queryString);
  const result = {};

  for (const [field, paramKey] of Object.entries(URL_PARAM_KEYS)) {
    if (!params.has(paramKey)) continue;
    const raw = params.get(paramKey);

    if (field === 'species') {
      if (pokemonList.some((p) => p.speciesId === raw)) result.species = raw;
    } else if (field === 'league') {
      if (VALID_LEAGUES.has(raw)) result.league = raw;
    } else if (field === 'language') {
      if (VALID_LANGUAGES.has(raw)) result.language = raw;
    } else if (field === 'topN') {
      const num = Number(raw);
      if (Number.isInteger(num) && num >= TOP_N_MIN && num <= TOP_N_MAX) result.topN = num;
    } else if (typeof URL_PARAM_DEFAULTS[field] === 'boolean') {
      if (raw === 'true' || raw === 'false') result[field] = raw === 'true';
    }
  }

  // Keep only ids that belong to this species' own evolution family.
  if (params.has('evo') && result.species) {
    const raw = params.get('evo');
    const candidateIds = raw === '' ? [] : raw.split(',');
    const familyIds = new Set(buildEvolutionChecklist(result.species, pokemonList));
    result.includedFamilyMembers = candidateIds.filter((id) => familyIds.has(id));
  }

  return result;
}
