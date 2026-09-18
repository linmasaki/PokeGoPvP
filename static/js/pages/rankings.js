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
  ivs: [{ atk: 15, def: 15, hp: 15, shadow: false }],
  ivFloor: 0,
  maxLevel: 50,
};

const leagueTabsContainer = document.getElementById('rankings-league-tabs');
const ivRowsContainer = document.getElementById('rankings-iv-rows');
const ivFloorSelect = document.getElementById('rankings-iv-floor');
const maxLevelSelect = document.getElementById('rankings-max-level');

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

function buildRowCells(entry, rankOverride, shadow) {
  const battle = shadow ? applyShadowMultiplier(entry.battle) : entry.battle;
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

// Atk/Def are cells 5 and 6 in buildRowCells' return order
const SHADOW_STAT_CELL_INDICES = new Set([5, 6]);

function renderRow(entry, rankOverride, tierClass, shadow) {
  const tr = document.createElement('tr');
  if (tierClass) tr.className = tierClass;
  buildRowCells(entry, rankOverride, shadow).forEach((cellText, i) => {
    const td = document.createElement('td');
    td.textContent = cellText;
    if (shadow && SHADOW_STAT_CELL_INDICES.has(i)) td.className = 'shadow-stat';
    tr.appendChild(td);
  });
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
  if (!lastRanked) return;
  const { ranked, speciesName } = lastRanked;

  clearResults();
  speciesLabel.textContent = speciesName;

  // pinned rows follow input order, not rank order
  for (const userIvs of state.ivs) {
    const userRank = findAbsoluteRank(ranked, userIvs);
    if (userRank === null) continue;
    const userEntry = ranked[userRank - 1];
    const tierClass = getRankTierClass(userRank);
    pinnedRowContainer.appendChild(renderRow(userEntry, userRank, tierClass, userIvs.shadow));
  }

  // Top 20 has no associated row, so it always shows raw (non-Shadow) stats
  const top20 = filterAchievableTop(ranked, state.ivFloor, TOP_N);
  for (const entry of top20) {
    top20Body.appendChild(renderRow(entry, entry.rank, null, false));
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

const IV_FIELDS = [
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['hp', 'Sta'],
];

function createIvSelect(fieldLabel, value, onChange) {
  const select = document.createElement('select');
  select.className = 'select';
  select.setAttribute('aria-label', fieldLabel);
  for (let i = 15; i >= 0; i--) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = String(i);
    if (i === value) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(Number(select.value)));
  return select;
}

// full rebuild on every add/remove — list is always small, no need to diff it
function renderIvRows() {
  ivRowsContainer.innerHTML = '';

  state.ivs.forEach((ivs, index) => {
    const row = document.createElement('div');
    row.className = 'iv-row';

    const shadowCheckbox = document.createElement('input');
    shadowCheckbox.type = 'checkbox';
    shadowCheckbox.className = 'checkbox';
    shadowCheckbox.checked = ivs.shadow;
    shadowCheckbox.setAttribute('aria-label', `第 ${index + 1} 列 Shadow 加成`);
    shadowCheckbox.addEventListener('change', () => {
      // Shadow is display-only (doesn't affect statProduct/ranking), so re-render instead of re-ranking
      state.ivs[index].shadow = shadowCheckbox.checked;
      renderQueryResults();
    });
    row.appendChild(shadowCheckbox);

    for (const [field, label] of IV_FIELDS) {
      const select = createIvSelect(`第 ${index + 1} 列 ${label}`, ivs[field], (value) => {
        state.ivs[index][field] = value;
        renderQueryResults();
      });
      row.appendChild(select);
    }

    // first row always adds; every other row removes itself
    const isFirstRow = index === 0;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'iv-row__remove';
    toggleBtn.textContent = isFirstRow ? '+' : '−';
    toggleBtn.setAttribute('aria-label', isFirstRow ? '新增一列 IV' : `移除第 ${index + 1} 列 IV`);
    toggleBtn.addEventListener('click', () => {
      if (isFirstRow) {
        state.ivs.push({ atk: 15, def: 15, hp: 15, shadow: false });
      } else {
        state.ivs.splice(index, 1);
      }
      renderIvRows();
      renderQueryResults();
      // clicked button no longer exists post-rebuild — refocus the row that slid into its place
      const rows = ivRowsContainer.children;
      const next = rows[index] ?? rows[rows.length - 1];
      next.querySelector('.iv-row__remove').focus();
    });
    row.appendChild(toggleBtn);

    ivRowsContainer.appendChild(row);
  });
}

renderIvRows();

ivFloorSelect.addEventListener('change', () => {
  state.ivFloor = Number(ivFloorSelect.value);
  runQuery();
});

maxLevelSelect.addEventListener('change', () => {
  state.maxLevel = Number(maxLevelSelect.value);
  runQuery();
});

loadPokemonList()
  .then((list) => { pokemonList = list; })
  .catch((error) => {
    console.error(error);
    emptyState.textContent = 'Pokemon 資料載入失敗，請重新整理頁面';
  });
