import { loadPokemonList, createAutocomplete } from './pokemon-search.js';
import {
  buildEvolutionChecklist,
  createRankingCache,
  generateGeneralModeString,
  generateTrashModeString,
  generateGlobalIvExtremeString,
  serializeStateToQuery,
  parseQueryToState,
} from './search-string-logic.js';

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

// One table drives both the change listeners and the URL-restore sync for every trash toggle.
const TRASH_TOGGLE_BINDINGS = [
  [excludePerfectCheckbox, 'trashExcludePerfect'],
  [excludeZeroCheckbox, 'trashExcludeZero'],
  [excludeXXLCheckbox, 'trashExcludeXXL'],
  [excludeXXSCheckbox, 'trashExcludeXXS'],
  [excludeXLCheckbox, 'trashExcludeXL'],
  [excludeXSCheckbox, 'trashExcludeXS'],
  [excludeTaggedCheckbox, 'trashExcludeTagged'],
  [excludeFavoritedCheckbox, 'trashExcludeFavorited'],
];

const rankingCache = createRankingCache();

let pokemonList = [];

const state = {
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
  trashExcludeXXL: false,
  trashExcludeXXS: false,
  trashExcludeXL: false,
  trashExcludeXS: false,
  trashExcludeTagged: false,
  trashExcludeFavorited: true,
};

function renderEvolutionChecklist(speciesId, presetSelection) {
  const memberIds = buildEvolutionChecklist(speciesId, pokemonList);
  // The searched species is normally caught wild and evaluated by what it evolves into, not by
  // its own PvP rank — so the search target itself starts unchecked whenever there's an actual
  // evolution/Mega to fall back on. A species with no family beyond itself has nothing else to
  // check, so it stays included. An explicit preset (e.g. the evo= selection restored from a
  // shared URL) wins over the default.
  const defaultIncluded = memberIds.length > 1 ? memberIds.filter((id) => id !== speciesId) : memberIds;
  state.includedFamilyMembers = presetSelection ?? new Set(defaultIncluded);

  evolutionChecklist.innerHTML = '';
  for (const memberId of memberIds) {
    const mon = pokemonList.find((p) => p.speciesId === memberId);
    if (!mon) continue;

    const item = document.createElement('li');
    item.className = 'evolution-checklist__item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = state.includedFamilyMembers.has(memberId);
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

function syncLeagueControls(league) {
  for (const tab of leagueTabsContainer.querySelectorAll('.league-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.league === league));
  }
  leagueSelect.value = league;
}

function setLeague(league) {
  state.league = league;
  syncLeagueControls(league);
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

trashCheckbox.addEventListener('change', () => {
  state.trash = trashCheckbox.checked;
  trashDetails.hidden = !state.trash;
  onOutputInputsChanged();
});

for (const [checkbox, field] of TRASH_TOGGLE_BINDINGS) {
  checkbox.addEventListener('change', () => {
    state[field] = checkbox.checked;
    onOutputInputsChanged();
  });
}

createAutocomplete({
  input: searchInput,
  list: searchResultsList,
  containerSelector: '.search-string-search',
  getPokemonList: () => pokemonList,
  onSelect: (pokemon) => {
    state.species = pokemon.speciesId;
    renderEvolutionChecklist(pokemon.speciesId);
    applyFindExtremeVisibility();
    onOutputInputsChanged();
  },
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
  // includedFamilyMembers arrives as an Array (and only alongside a valid species) — it is
  // handed to renderEvolutionChecklist as a Set instead of being Object.assign'd, so the
  // Set-typed state field is never overwritten with an Array.
  const { includedFamilyMembers: parsedEvo, ...parsed } = parseQueryToState(window.location.search.slice(1), pokemonList);
  Object.assign(state, parsed);

  languageSelect.value = state.language;
  syncLeagueControls(state.league);
  find100Checkbox.checked = state.find100IV;
  find0Checkbox.checked = state.find0IV;
  topNInput.value = state.topN;
  trashCheckbox.checked = state.trash;
  trashDetails.hidden = !state.trash;
  for (const [checkbox, field] of TRASH_TOGGLE_BINDINGS) checkbox.checked = state[field];

  if (state.species) {
    // parseQueryToState only accepts species ids that exist in pokemonList, so this lookup
    // always succeeds.
    searchInput.value = pokemonList.find((p) => p.speciesId === state.species).speciesName;
    renderEvolutionChecklist(state.species, parsedEvo && new Set(parsedEvo));
  }

  applyFindExtremeVisibility();
  onOutputInputsChanged();
}

loadPokemonList()
  .then((list) => {
    pokemonList = list;
    applyStateFromUrl();
  })
  .catch((error) => {
    console.error(error);
    emptyState.textContent = 'Pokemon 資料載入失敗，請重新整理頁面';
  });
