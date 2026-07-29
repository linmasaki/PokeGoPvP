import { searchPokemon, getCpCapForLeague, findAbsoluteRank, computePerfectPercent, filterAchievableTop, applyShadowMultiplier } from './rankings-logic.js';
import { rankIVCombinations } from '../pvp/ranker.js';

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

const searchInput = document.getElementById('rankings-search-input');
const searchResultsList = document.getElementById('rankings-search-results');

let pokemonList = [];
let activeSuggestionIndex = -1;

const MIN_LEVEL = 1;

const state = {
  species: null,
  league: 'ultra',
  ivs: [{ atk: 15, def: 15, hp: 15 }],
  ivFloor: 0,
  maxLevel: 50,
  shadow: false,
};

async function loadPokemonData() {
  const response = await fetch(POKEMON_DATA_URL);
  pokemonList = await response.json();
}

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

const TOP_N = 20;

function getRankTierClass(rank) {
  if (rank <= 100) return 'rank-tier--top100';
  if (rank <= 500) return 'rank-tier--mid';
  return 'rank-tier--low';
}

function formatIvTriplet(ivs) {
  return `${ivs.atk}/${ivs.def}/${ivs.hp}`;
}

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
    String(Math.round(battle.hp)),
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
}

function runQuery() {
  if (!state.species) {
    showEmptyState();
    return;
  }

  const pokemon = pokemonList.find((p) => p.speciesId === state.species);
  if (!pokemon) {
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
    showNoResultsState();
    return;
  }

  state.rank1StatProduct = ranked[0].statProduct;

  clearResults();
  speciesLabel.textContent = pokemon.speciesName;

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

function renderSuggestions(matches) {
  searchResultsList.innerHTML = '';
  activeSuggestionIndex = -1;

  if (matches.length === 0) {
    searchResultsList.hidden = true;
    return;
  }

  for (const pokemon of matches) {
    const item = document.createElement('li');
    item.className = 'autocomplete-list__item';
    item.dataset.speciesId = pokemon.speciesId;

    const dexSpan = document.createElement('span');
    dexSpan.className = 'autocomplete-list__dex';
    dexSpan.textContent = `#${String(pokemon.dex).padStart(3, '0')}`;
    item.appendChild(dexSpan);

    item.appendChild(document.createTextNode(pokemon.speciesName));

    item.addEventListener('click', () => selectSpecies(pokemon.speciesId));
    searchResultsList.appendChild(item);
  }

  searchResultsList.hidden = false;
}

function selectSpecies(speciesId) {
  const pokemon = pokemonList.find((p) => p.speciesId === speciesId);
  if (!pokemon) return;

  state.species = speciesId;
  searchInput.value = pokemon.speciesName;
  searchResultsList.hidden = true;
  searchResultsList.innerHTML = '';
  runQuery();
}

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    item.classList.toggle('autocomplete-list__item--active', index === activeSuggestionIndex);
  });
}

searchInput.addEventListener('input', () => {
  const matches = searchPokemon(searchInput.value, pokemonList);
  renderSuggestions(matches);

  if (state.species) {
    const selected = pokemonList.find((p) => p.speciesId === state.species);
    if (!selected || selected.speciesName !== searchInput.value) {
      state.species = null;
      runQuery();
    }
  }
});

searchInput.addEventListener('keydown', (event) => {
  const items = Array.from(searchResultsList.querySelectorAll('.autocomplete-list__item'));
  if (items.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
    updateActiveSuggestion(items);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    updateActiveSuggestion(items);
  } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
    event.preventDefault();
    selectSpecies(items[activeSuggestionIndex].dataset.speciesId);
  } else if (event.key === 'Escape') {
    searchResultsList.hidden = true;
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.rankings-search')) {
    searchResultsList.hidden = true;
  }
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
  state.shadow = shadowCheckbox.checked;
  runQuery();
});

loadPokemonData();
