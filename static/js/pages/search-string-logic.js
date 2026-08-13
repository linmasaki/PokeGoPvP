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

// Two different, both fixed, level ceilings — neither is user-configurable (there used to be a
// Max Level selector; it was removed because both bounds are facts about the game, not a real
// choice for the user to make):
//
// - RANKING_MAX_LEVEL (used by rankEvaluatedSpecies, see collectQualifyingListsForContext):
//   ranking must be allowed to power a qualifying combo up as high as it takes to reach the
//   league's own CP cap — capping this at a wild-catch level produces a false "no CP cap is
//   ever reachable" result for leagues with a higher cap (e.g. Duskull/Dusclops/Dusknoir never
//   reach Ultra League's 2500 CP cap by level 35, so a level-35-capped ranking degenerates into
//   "highest IV sum wins" and loses all PvP relevance — verified empirically). 51 is the game's
//   actual real-world level ceiling (Best Buddy); the engine's CPM table technically covers up
//   to 55, but levels beyond 51 are not achievable in the real game.
// - PROJECTION_MAX_LEVEL (used by computeProjectedCpHpSets, below): wild-caught Pokémon never
//   spawn above level 35, so the search string — meant to scan a real box of wild catches —
//   should never enumerate CP/HP for levels a wild individual could never actually be at. This
//   is unrelated to ranking: an IV combo can rank well (evaluated up to RANKING_MAX_LEVEL) while
//   still being searched for at the wild-catch levels it would actually be encountered at.
export const RANKING_MAX_LEVEL = 51;
export const PROJECTION_MAX_LEVEL = 35;

export function computeProjectedCpHpSets(tierMembers, baseStats, levelCap = PROJECTION_MAX_LEVEL) {
  const cpSet = new Set();
  const hpSet = new Set();
  for (const member of tierMembers) {
    const ivs = { atk: member.atk, def: member.def, hp: member.hp };
    const cappedMaxLevel = Math.min(member.maxLevel, levelCap);
    for (let level = 1; level <= cappedMaxLevel; level += 0.5) {
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
  // CP/HP must be excluded GLOBALLY (across every star tier's qualifying members, not
  // just each tier's own) before taking the complement. A per-tier-only complement only
  // protects that tier's own members — a qualifying member from a DIFFERENT tier can slip
  // through if its projected CP/HP/bucket signature happens to land inside that other
  // tier's complement, since that tier's complement was never told to exclude it. Verified
  // empirically against the Eevee/Great League/Top 20/Max Level 50 example: the per-tier-only
  // version produces 12 real safety-invariant violations.
  //
  // Trash mode deliberately enumerates up to RANKING_MAX_LEVEL, NOT the wild-catch
  // PROJECTION_MAX_LEVEL that General mode uses. The two modes ask opposite questions:
  // General asks "which CP/HP could a wild catch worth keeping have?" (capping at the
  // wild ceiling is a pure precision win), while Trash asks "which CP/HP is it SAFE to
  // delete?" — and the box being deleted from holds powered-up Pokémon too, not just fresh
  // catches. complementForTrash closes with an open tail (max+1 → ∞), so a wild-level cap
  // puts that tail right above the level-35 CP and declares every powered-up individual
  // above it safe to trash. Measured on Duskull/Dusknoir/Ultra/Top 30: capping here flags
  // 734 genuinely qualifying (IV, level) states as trash, all at level 36.5–51; enumerating
  // to RANKING_MAX_LEVEL brings that to 0.
  const allCpValues = new Set();
  const allHpValues = new Set();
  for (const members of starTierGroups.values()) {
    const { cpSet, hpSet } = computeProjectedCpHpSets(members, baseStats, RANKING_MAX_LEVEL);
    for (const cp of cpSet) allCpValues.add(cp);
    for (const hp of hpSet) allHpValues.add(hp);
  }

  // Because every tier complements the same global union, the CP/HP ranges are identical for
  // all tiers — compute them once and share; tiers differ only in their bucket complements.
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

// Stamina's appraisal bucket has no word of its own in the real search grammar — it reuses
// the "hp" vocab entry, same as the numeric HP-stat term. Confirmed against a real, verified
// working search string (Duskull family / Great League / Top 10 / Max Level 30):
// "355&!0*,0attack&!0*,2defense&!0*,3hp&!0*,cp10,...,cp468&!0*,hp10,...,hp70&!1*,..."
export const LANGUAGE_VOCAB = {
  en: { cp: 'cp', hp: 'hp', atk: 'attack', def: 'defense', fav: 'favorite' },
  'zh-TW': { cp: 'cp', hp: 'hp', atk: '攻擊', def: '防禦', fav: '我的最愛' },
  ja: { cp: 'cp', hp: 'hp', atk: 'こうげき', def: 'ぼうぎょ', fav: 'お気に入り' },
};

// CP/HP terms: the unit word is a PREFIX repeated on every disjoint value/range; a consecutive
// run compresses to "{word}{start}-{end}" (word only once, at the start).
export function formatValueTerms(ranges, word) {
  return ranges
    .map((r) => {
      if (r.end === null) return `${word}${r.start}-`;
      if (r.start === r.end) return `${word}${r.start}`;
      return `${word}${r.start}-${r.end}`;
    })
    .join(',');
}

// Appraisal bucket terms: the unit word is a SUFFIX repeated on every disjoint value/range; a
// consecutive run compresses to "{start}-{end}{word}" (word only once, at the end). Bucket
// ranges are always closed (0-4), so there is no open-tail case to handle here.
export function formatBucketTerms(ranges, word) {
  return ranges
    .map((r) => (r.start === r.end ? `${r.start}${word}` : `${r.start}-${r.end}${word}`))
    .join(',');
}

// The five groups every tier chain is built from, in the reference tool's fixed order:
// atk bucket, def bucket, sta-as-hp bucket, CP list, HP list.
function tierGroupTerms(condition, vocab) {
  return [
    formatBucketTerms(condition.atkBuckets, vocab.atk),
    formatBucketTerms(condition.defBuckets, vocab.def),
    formatBucketTerms(condition.staBuckets, vocab.hp),
    formatValueTerms(condition.cpRanges, vocab.cp),
    formatValueTerms(condition.hpRanges, vocab.hp),
  ];
}

// General-mode tier chain: the "&!{star}*" tier marker is repeated before EACH of the five
// groups — not once at the end.
export function formatGeneralTierGroups(condition, vocab) {
  return tierGroupTerms(condition, vocab)
    .map((group) => `&!${condition.star}*,${group}`)
    .join('');
}

// Trash-mode tier chain: the "&!{star}*" tier marker appears once at the very start of the
// chain; the remaining groups are plain comma-joined terms (no repeated marker between them).
// This intentionally differs from General mode — the reference tool's own source comments this
// exact asymmetry directly: "Need to intersperse &!i* between search strings, but not trash
// strings." (A prior revision of this function guessed that repeating the marker here too would
// be a safe tightening and "fixed" a suspected Trash-mode leak — that guess was never validated
// and the leak it was chasing turned out to be a mode mix-up, not a real bug. Reverted to match
// the reference's actual, intentional behavior rather than deviate on unverified suspicion.)
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

// Size/tag exclusions are language-independent symbols; the favorited exclusion is NOT — the
// game only understands the localized "favorite" word (LANGUAGE_VOCAB's fav entry), so it is
// appended separately in generateTrashModeString rather than listed here.
const TRASH_SUFFIX_FLAGS = [
  ['excludeXXL', '!XXL'],
  ['excludeXXS', '!XXS'],
  ['excludeXL', '!XL'],
  ['excludeXS', '!XS'],
  ['excludeTagged', '!#'],
];

// The whole output is ONE continuous string per species: the species anchor appears exactly
// once at the very front, never repeated per star tier. Star tiers 0-3 are appended in order
// when they have qualifying members; a tier with none contributes nothing but a bare "&!{i}*"
// marker, deferred to the end (after every populated tier) rather than left in its natural
// position — this matches the reference tool's own "emptyBuf" behavior. The 4-star (hundo)
// tier never gets a CP/HP/bucket breakdown (a hundo is fully identified by its appraisal
// alone) — it contributes a bare ",4*" when present, or nothing when absent. All confirmed
// character-for-character against a real, verified working string (see LANGUAGE_VOCAB above).
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

  // The anchor is the dex NUMBER, not the species name: pokemon.json names regional/Mega forms
  // "Raichu (Alolan)"-style, which the in-game name search can never match (the mon's displayed
  // name is just "Raichu"), silently killing the whole string. A dex anchor works for every
  // form — at the reference tool's accepted cost that other forms sharing the dex also match.
  return assembleGeneralModeString(String(context.baseSpecies.dex), tierConditions, vocab);
}

// A star tier with zero qualifying members contributes no clause at all. Its complement would
// be fully open, and under the game's AND-of-clauses grammar a fully-open clause is a no-op —
// every mon of an empty tier is (correctly) flaggable either way, since nothing of that tier
// qualifies. Skipping it matches the reference tool and keeps the string short.
export function generateTrashModeString(context, rankingCache) {
  if (context.checkedItems.length === 0) return null;

  const grouped = collectStarTierGroups(context, rankingCache);
  const tierConditions = buildTrashModeTierConditions(grouped, context.baseSpecies.baseStats);
  const vocab = LANGUAGE_VOCAB[context.language];
  const byStar = new Map(tierConditions.map((c) => [c.star, c]));

  // Dex-number anchor for the same reason as generateGeneralModeString.
  let result = String(context.baseSpecies.dex);
  for (let star = 0; star <= 3; star++) {
    if (!grouped.has(star)) continue;
    result += formatTrashTierGroups(byStar.get(star), vocab);
  }

  if (context.excludePerfect) {
    result += '&!4*';
  } else if (grouped.has(4)) {
    // The user opted out of blanket hundo protection, but the safety invariant ("a QUALIFYING
    // member is never flagged") still applies to a hundo that ranks within Top N on its own —
    // emit the 4-star tier clause so those stay protected. The reference tool never emits a
    // 4-star breakdown and would flag every hundo here; deliberate safety deviation.
    result += formatTrashTierGroups(byStar.get(4), vocab);
  }

  result += TRASH_SUFFIX_FLAGS.filter(([flag]) => context[flag])
    .map(([, symbol]) => `&${symbol}`)
    .join('');

  if (context.excludeZero) {
    // "Keep 0% IV" = one OR clause requiring at least one appraisal bucket ≥ 1, i.e.
    // NOT(0-atk AND 0-def AND 0-sta) — the reference tool's own construction, and the only
    // one that works: carving 0/0/0's projected CP/HP out of the tier complements (a prior
    // revision's approach) cannot protect it, because the tier clause is an OR of five groups
    // and 0/0/0 still matches through any appraisal-bucket complement containing bucket 0.
    result += `&1-4${vocab.atk},1-4${vocab.def},1-4${vocab.hp}`;
  }
  if (context.excludeFavorited) result += `&!${vocab.fav}`;

  return result;
}

export function generateGlobalIvExtremeString(find100IV, find0IV, language) {
  if (!find100IV && !find0IV) return null;

  const vocab = LANGUAGE_VOCAB[language];
  if (find100IV && find0IV) {
    // The two AND-chains cannot simply be comma-joined: the game parses a search as an AND of
    // &-separated clauses (each clause a comma-OR of terms), so "4atk&4def&4hp,0atk&0def&0hp"
    // actually means 4atk AND 4def AND (4hp OR 0atk) AND 0def AND 0hp — matches nothing.
    // A hundo is exactly the 4-star appraisal, so hundo-or-nundo is expressible as three
    // (4* OR 0x) clauses instead.
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
  trashExcludeFavorited: false,
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

  // includedFamilyMembers is a Set keyed off the selected species, so it can't be compared
  // against a fixed default the way the other fields are — always include it once a species
  // is selected, so a shared link never silently drops which family members were unchecked.
  // This must fire even when the set is EMPTY (every family member unchecked): omitting the
  // param entirely in that case is indistinguishable from "no evo param was ever set", so a
  // restored link would fall back to evolutionChecklist's default (everything checked) instead
  // of correctly restoring to nothing checked.
  if (state.species && state.includedFamilyMembers) {
    params.set('evo', [...state.includedFamilyMembers].join(','));
  }

  return params.toString();
}

const VALID_LEAGUES = new Set(['great', 'ultra', 'master', 'all']);
const VALID_LANGUAGES = new Set(Object.keys(LANGUAGE_VOCAB));
const TOP_N_MIN = 1;
const TOP_N_MAX = 4096;

// A URL is untrusted external input (stale links, hand-edited query strings, corrupted
// copies) — unlike the page's own <select>/<input> controls, nothing here is constrained
// by native HTML validation, so every field is validated explicitly. An invalid value is
// simply omitted from the result (falls back to state's existing/default value) rather than
// applied as-is; a caller must never blindly `Object.assign(state, parsed)` without this
// validation already having run.
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

  // Only meaningful alongside a valid species: keep just the ids that belong to that species'
  // own evolution family — an evo param naming an unrelated real species (e.g. a stale or
  // hand-edited link) must not silently end up included in the ranking computation. Without a
  // valid species the param is dropped entirely (the field stays a Set in the page state).
  if (params.has('evo') && result.species) {
    const raw = params.get('evo');
    const candidateIds = raw === '' ? [] : raw.split(',');
    const familyIds = new Set(buildEvolutionChecklist(result.species, pokemonList));
    result.includedFamilyMembers = candidateIds.filter((id) => familyIds.has(id));
  }

  return result;
}
