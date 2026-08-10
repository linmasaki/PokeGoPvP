import { searchPokemon } from './rankings-logic.js';
import {
  buildEvolutionChecklist,
  createRankingCache,
  generateGeneralModeString,
  generateTrashModeString,
  generateGlobalIvExtremeString,
  serializeStateToQuery,
  parseQueryToState,
} from './search-string-logic.js';

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

const searchInput = document.getElementById('search-string-search-input');
const searchResultsList = document.getElementById('search-string-search-results');
const emptyState = document.getElementById('search-string-empty-state');
const speciesSettings = document.getElementById('search-string-species-settings');
const evolutionChecklist = document.getElementById('search-string-evolution-checklist');
const languageSelect = document.getElementById('search-string-language');
const leagueTabsContainer = document.getElementById('search-string-league-tabs');
const leagueSelect = document.getElementById('search-string-league-select');
const find100Checkbox = document.getElementById('search-string-find-100');
const find0Checkbox = document.getElementById('search-string-find-0');
const topNInput = document.getElementById('search-string-top-n');
const maxLevelSelect = document.getElementById('search-string-max-level');
const trashCheckbox = document.getElementById('search-string-trash');
const trashDetails = document.getElementById('search-string-trash-details');
const excludePerfectCheckbox = document.getElementById('search-string-exclude-perfect');
const excludeZeroCheckbox = document.getElementById('search-string-exclude-zero');
const excludeXXLCheckbox = document.getElementById('search-string-exclude-xxl');
const excludeXXSCheckbox = document.getElementById('search-string-exclude-xxs');
const excludeXLCheckbox = document.getElementById('search-string-exclude-xl');
const excludeXSCheckbox = document.getElementById('search-string-exclude-xs');
const excludeTaggedCheckbox = document.getElementById('search-string-exclude-tagged');
const excludeFavoritedCheckbox = document.getElementById('search-string-exclude-favorited');
const outputTextarea = document.getElementById('search-string-output');
const copyBtn = document.getElementById('search-string-copy-btn');
const shareBtn = document.getElementById('search-string-share-btn');
const copyFeedback = document.getElementById('search-string-copy-feedback');

const rankingCache = createRankingCache();

let pokemonList = [];
let activeSuggestionIndex = -1;

const state = {
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
  trashExcludeXXL: false,
  trashExcludeXXS: false,
  trashExcludeXL: false,
  trashExcludeXS: false,
  trashExcludeTagged: false,
  trashExcludeFavorited: false,
};

async function loadPokemonData() {
  const response = await fetch(POKEMON_DATA_URL);
  pokemonList = await response.json();
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

function renderEvolutionChecklist(speciesId) {
  const memberIds = buildEvolutionChecklist(speciesId, pokemonList);
  state.includedFamilyMembers = new Set(memberIds);

  evolutionChecklist.innerHTML = '';
  for (const memberId of memberIds) {
    const mon = pokemonList.find((p) => p.speciesId === memberId);
    if (!mon) continue;

    const item = document.createElement('li');
    item.className = 'evolution-checklist__item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = true;
    checkbox.id = `search-string-evo-${memberId}`;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.includedFamilyMembers.add(memberId);
      } else {
        state.includedFamilyMembers.delete(memberId);
      }
      onOutputInputsChanged();
    });

    const label = document.createElement('label');
    label.setAttribute('for', checkbox.id);
    label.textContent = mon.speciesName;

    item.appendChild(checkbox);
    item.appendChild(label);
    evolutionChecklist.appendChild(item);
  }
}

function selectSpecies(speciesId) {
  const pokemon = pokemonList.find((p) => p.speciesId === speciesId);
  if (!pokemon) return;

  state.species = speciesId;
  searchInput.value = pokemon.speciesName;
  searchResultsList.hidden = true;
  searchResultsList.innerHTML = '';

  renderEvolutionChecklist(speciesId);

  applyFindExtremeVisibility();
  onOutputInputsChanged();
}

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    item.classList.toggle('autocomplete-list__item--active', index === activeSuggestionIndex);
  });
}

function leaguesToConsider() {
  return state.league === 'all' ? ['great', 'ultra', 'master'] : [state.league];
}

function checkedItemsList() {
  return [...state.includedFamilyMembers]
    .map((speciesId) => pokemonList.find((p) => p.speciesId === speciesId))
    .filter(Boolean);
}

function renderOutput(value) {
  outputTextarea.value = value ?? '';
}

function onOutputInputsChanged() {
  if (state.find100IV || state.find0IV) {
    renderOutput(generateGlobalIvExtremeString(state.find100IV, state.find0IV, state.language));
    return;
  }

  if (!state.species) {
    renderOutput('');
    return;
  }

  const baseSpecies = pokemonList.find((p) => p.speciesId === state.species);
  const checkedItems = checkedItemsList();

  if (checkedItems.length === 0) {
    renderOutput('');
    return;
  }

  const context = {
    baseSpecies,
    checkedItems,
    leagues: leaguesToConsider(),
    topN: state.topN,
    maxLevel: state.maxLevel,
    language: state.language,
  };

  if (state.trash) {
    renderOutput(
      generateTrashModeString(
        {
          ...context,
          excludePerfect: state.trashExcludePerfect,
          excludeZero: state.trashExcludeZero,
          excludeXXL: state.trashExcludeXXL,
          excludeXXS: state.trashExcludeXXS,
          excludeXL: state.trashExcludeXL,
          excludeXS: state.trashExcludeXS,
          excludeTagged: state.trashExcludeTagged,
          excludeFavorited: state.trashExcludeFavorited,
        },
        rankingCache
      )
    );
  } else {
    renderOutput(generateGeneralModeString(context, rankingCache));
  }
}

function setLeague(league) {
  state.league = league;
  for (const tab of leagueTabsContainer.querySelectorAll('.league-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.league === league));
  }
  leagueSelect.value = league;
  onOutputInputsChanged();
}

leagueTabsContainer.addEventListener('click', (event) => {
  const tab = event.target.closest('.league-tab');
  if (!tab) return;
  setLeague(tab.dataset.league);
});

leagueSelect.addEventListener('change', () => setLeague(leagueSelect.value));

languageSelect.addEventListener('change', () => {
  state.language = languageSelect.value;
  onOutputInputsChanged();
});

function applyFindExtremeVisibility() {
  const showSpeciesSettings = !state.find100IV && !state.find0IV && state.species !== null;
  const showEmptyState = !state.find100IV && !state.find0IV && state.species === null;
  speciesSettings.hidden = !showSpeciesSettings;
  emptyState.hidden = !showEmptyState;
}

find100Checkbox.addEventListener('change', () => {
  state.find100IV = find100Checkbox.checked;
  applyFindExtremeVisibility();
  onOutputInputsChanged();
});

find0Checkbox.addEventListener('change', () => {
  state.find0IV = find0Checkbox.checked;
  applyFindExtremeVisibility();
  onOutputInputsChanged();
});

topNInput.addEventListener('input', () => {
  if (topNInput.value === '' || !topNInput.validity.valid) return;
  state.topN = Number(topNInput.value);
  onOutputInputsChanged();
});

maxLevelSelect.addEventListener('change', () => {
  state.maxLevel = Number(maxLevelSelect.value);
  onOutputInputsChanged();
});

trashCheckbox.addEventListener('change', () => {
  state.trash = trashCheckbox.checked;
  trashDetails.hidden = !state.trash;
  onOutputInputsChanged();
});

excludePerfectCheckbox.addEventListener('change', () => {
  state.trashExcludePerfect = excludePerfectCheckbox.checked;
  onOutputInputsChanged();
});
excludeZeroCheckbox.addEventListener('change', () => {
  state.trashExcludeZero = excludeZeroCheckbox.checked;
  onOutputInputsChanged();
});
excludeXXLCheckbox.addEventListener('change', () => {
  state.trashExcludeXXL = excludeXXLCheckbox.checked;
  onOutputInputsChanged();
});
excludeXXSCheckbox.addEventListener('change', () => {
  state.trashExcludeXXS = excludeXXSCheckbox.checked;
  onOutputInputsChanged();
});
excludeXLCheckbox.addEventListener('change', () => {
  state.trashExcludeXL = excludeXLCheckbox.checked;
  onOutputInputsChanged();
});
excludeXSCheckbox.addEventListener('change', () => {
  state.trashExcludeXS = excludeXSCheckbox.checked;
  onOutputInputsChanged();
});
excludeTaggedCheckbox.addEventListener('change', () => {
  state.trashExcludeTagged = excludeTaggedCheckbox.checked;
  onOutputInputsChanged();
});
excludeFavoritedCheckbox.addEventListener('change', () => {
  state.trashExcludeFavorited = excludeFavoritedCheckbox.checked;
  onOutputInputsChanged();
});

searchInput.addEventListener('input', () => {
  const matches = searchPokemon(searchInput.value, pokemonList);
  renderSuggestions(matches);
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
  if (!event.target.closest('.search-string-search')) {
    searchResultsList.hidden = true;
  }
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.textContent = '已複製';
  } catch {
    copyFeedback.textContent = '無法複製，請手動複製';
  }
  copyFeedback.hidden = false;
  setTimeout(() => { copyFeedback.hidden = true; }, 1500);
}

copyBtn.addEventListener('click', () => {
  if (!outputTextarea.value) return;
  copyToClipboard(outputTextarea.value);
});

shareBtn.addEventListener('click', () => {
  const query = serializeStateToQuery(state);
  const url = query ? `${window.location.origin}${window.location.pathname}?${query}` : `${window.location.origin}${window.location.pathname}`;
  copyToClipboard(url);
});

function applyStateFromUrl() {
  const parsed = parseQueryToState(window.location.search.slice(1), pokemonList);
  Object.assign(state, parsed);

  languageSelect.value = state.language;
  setLeague(state.league);
  find100Checkbox.checked = state.find100IV;
  find0Checkbox.checked = state.find0IV;
  topNInput.value = state.topN;
  maxLevelSelect.value = state.maxLevel;
  trashCheckbox.checked = state.trash;
  trashDetails.hidden = !state.trash;
  excludePerfectCheckbox.checked = state.trashExcludePerfect;
  excludeZeroCheckbox.checked = state.trashExcludeZero;
  excludeXXLCheckbox.checked = state.trashExcludeXXL;
  excludeXXSCheckbox.checked = state.trashExcludeXXS;
  excludeXLCheckbox.checked = state.trashExcludeXL;
  excludeXSCheckbox.checked = state.trashExcludeXS;
  excludeTaggedCheckbox.checked = state.trashExcludeTagged;
  excludeFavoritedCheckbox.checked = state.trashExcludeFavorited;

  if (state.species) {
    const pokemon = pokemonList.find((p) => p.speciesId === state.species);
    if (pokemon) {
      searchInput.value = pokemon.speciesName;
      // renderEvolutionChecklist always resets state.includedFamilyMembers to "everything checked" —
      // if the URL carried an explicit evo= selection, re-apply it (both the state Set and the
      // checkbox DOM) afterwards so a shared link with some family members unchecked round-trips.
      renderEvolutionChecklist(state.species);

      if (parsed.includedFamilyMembers) {
        const includedSet = new Set(parsed.includedFamilyMembers);
        state.includedFamilyMembers = includedSet;
        for (const checkbox of evolutionChecklist.querySelectorAll('input[type="checkbox"]')) {
          const memberId = checkbox.id.replace('search-string-evo-', '');
          checkbox.checked = includedSet.has(memberId);
        }
      }
    }
  }

  applyFindExtremeVisibility();
  onOutputInputsChanged();
}

loadPokemonData().then(applyStateFromUrl);
