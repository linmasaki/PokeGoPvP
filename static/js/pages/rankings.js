import { findAbsoluteRank, computePerfectPercent, filterAchievableTop, applyShadowMultiplier, getRankTierClass, formatIvTriplet } from './rankings-logic.js';
import { rankIVCombinations } from '../pvp/ranker.js';
import { getCpCapForLeague } from '../pvp/leagues.js';
import { loadPokemonList, createAutocomplete } from './pokemon-search.js';

const searchInput = document.getElementById('rankings-search-input');
const searchResultsList = document.getElementById('rankings-search-results');

let pokemonList = [];

const MIN_LEVEL = 1;

const state = {
  species: null,
  league: 'great',
  ivs: [{ atk: 15, def: 15, hp: 15 }],
  ivFloor: 0,
  maxLevel: 50,
  shadow: false,
};

const leagueTabsContainer = document.getElementById('rankings-league-tabs');
const ivAtkSelect = document.getElementById('rankings-iv-atk');
const ivDefSelect = document.getElementById('rankings-iv-def');
const ivStaSelect = document.getElementById('rankings-iv-sta');
const ivFloorSelect = document.getElementById('rankings-iv-floor');
const maxLevelSelect = document.getElementById('rankings-max-level');
const shadowCheckbox = document.getElementById('rankings-shadow');

const emptyState = document.getElementById('rankings-empty-state');
const resultsBlock = document.getElementById('rankings-results-block');
const speciesLabel = document.getElementById('rankings-species-label');
const pinnedRowContainer = document.getElementById('rankings-pinned-row-container');
const top20Body = document.getElementById('rankings-top20-body');
const noResultsState = document.getElementById('rankings-no-results-state');
const tableScroll = document.querySelector('.rankings-table-scroll');

const TOP_N = 20;

// A scrollable region needs to be keyboard-focusable so it can be scrolled without a mouse — but
// only while it actually scrolls. At desktop widths the table fits, and a permanent tabindex just
// adds a tab stop on something the user cannot interact with.
function syncTableScrollFocusability() {
  const overflows = tableScroll.scrollWidth > tableScroll.clientWidth;
  if (overflows) tableScroll.setAttribute('tabindex', '0');
  else tableScroll.removeAttribute('tabindex');
}

window.addEventListener('resize', syncTableScrollFocusability);

function buildRowCells(entry, rankOverride) {
  const battle = state.shadow ? applyShadowMultiplier(entry.battle) : entry.battle;
  const perfectPercent = computePerfectPercent(entry.statProduct, state.rank1StatProduct);
  return [
    String(rankOverride ?? entry.rank),
    String(entry.level),
    String(entry.cp),
    formatIvTriplet(entry.ivs),
    `${perfectPercent.toFixed(1)}%`,
    battle.atk.toFixed(2),
    battle.def.toFixed(2),
    String(battle.hp),
    String(entry.statProduct),
  ];
}

function renderRow(entry, rankOverride, tierClass) {
  const tr = document.createElement('tr');
  if (tierClass) tr.className = tierClass;
  for (const cellText of buildRowCells(entry, rankOverride)) {
    const td = document.createElement('td');
    td.textContent = cellText;
    tr.appendChild(td);
  }
  return tr;
}

function clearResults() {
  speciesLabel.textContent = '';
  pinnedRowContainer.innerHTML = '';
  top20Body.innerHTML = '';
}

function showEmptyState() {
  emptyState.hidden = false;
  resultsBlock.hidden = true;
  noResultsState.hidden = true;
  clearResults();
}

function showNoResultsState() {
  emptyState.hidden = true;
  resultsBlock.hidden = true;
  noResultsState.hidden = false;
  clearResults();
}

function showResults() {
  emptyState.hidden = true;
  resultsBlock.hidden = false;
  noResultsState.hidden = true;
  // Only measurable once the block is visible — a hidden element reports zero for both widths.
  syncTableScrollFocusability();
}

// Last ranking pass, kept so a display-only change can re-render without re-ranking.
let lastRanked = null;

function runQuery() {
  if (!state.species) {
    lastRanked = null;
    showEmptyState();
    return;
  }

  const pokemon = pokemonList.find((p) => p.speciesId === state.species);
  if (!pokemon) {
    lastRanked = null;
    showEmptyState();
    return;
  }

  const cpCap = getCpCapForLeague(state.league);
  const ranked = rankIVCombinations(pokemon.baseStats, {
    ivFloor: 0,
    minLevel: MIN_LEVEL,
    maxLevel: state.maxLevel,
    cpCap,
  });

  if (ranked.length === 0) {
    lastRanked = null;
    showNoResultsState();
    return;
  }

  lastRanked = { ranked, speciesName: pokemon.speciesName };
  state.rank1StatProduct = ranked[0].statProduct;
  renderQueryResults();
}

function renderQueryResults() {
  const { ranked, speciesName } = lastRanked;

  clearResults();
  speciesLabel.textContent = speciesName;

  const userIvs = state.ivs[0];
  const userRank = findAbsoluteRank(ranked, userIvs);
  if (userRank !== null) {
    const userEntry = ranked[userRank - 1];
    const tierClass = getRankTierClass(userRank);
    pinnedRowContainer.appendChild(renderRow(userEntry, userRank, tierClass));
  }

  const top20 = filterAchievableTop(ranked, state.ivFloor, TOP_N);
  for (const entry of top20) {
    top20Body.appendChild(renderRow(entry, entry.rank, null));
  }

  showResults();
}

createAutocomplete({
  input: searchInput,
  list: searchResultsList,
  containerSelector: '.rankings-search',
  getPokemonList: () => pokemonList,
  onSelect: (pokemon) => {
    state.species = pokemon.speciesId;
    runQuery();
  },
  // Typing after a species is already selected must drop that selection as soon as the text
  // stops matching it, so the results below never disagree with what the box says.
  onInput: (value) => {
    if (!state.species) return;
    const selected = pokemonList.find((p) => p.speciesId === state.species);
    if (!selected || selected.speciesName !== value) {
      state.species = null;
      runQuery();
    }
  },
});

leagueTabsContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.league-tab');
  if (!button) return;

  state.league = button.dataset.league;
  for (const tab of leagueTabsContainer.querySelectorAll('.league-tab')) {
    tab.setAttribute('aria-pressed', String(tab === button));
  }
  runQuery();
});

ivAtkSelect.addEventListener('change', () => {
  state.ivs[0].atk = Number(ivAtkSelect.value);
  runQuery();
});
ivDefSelect.addEventListener('change', () => {
  state.ivs[0].def = Number(ivDefSelect.value);
  runQuery();
});
ivStaSelect.addEventListener('change', () => {
  state.ivs[0].hp = Number(ivStaSelect.value);
  runQuery();
});

ivFloorSelect.addEventListener('change', () => {
  state.ivFloor = Number(ivFloorSelect.value);
  runQuery();
});

maxLevelSelect.addEventListener('change', () => {
  state.maxLevel = Number(maxLevelSelect.value);
  runQuery();
});

shadowCheckbox.addEventListener('change', () => {
  // Shadow only scales the displayed Atk/Def (x1.2 / x0.8) — it does not touch statProduct, so
  // the ranking is identical either way. Re-render the existing pass instead of re-running the
  // engine over all 4096 IV combos.
  state.shadow = shadowCheckbox.checked;
  if (lastRanked) renderQueryResults();
});

loadPokemonList()
  .then((list) => { pokemonList = list; })
  .catch((error) => {
    console.error(error);
    emptyState.textContent = 'Pokemon 資料載入失敗，請重新整理頁面';
  });
