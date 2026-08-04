import { searchPokemon } from './rankings-logic.js';
import { getCpmForLevel } from '../pvp/cpm.js';
import { calculateCP, calculateBattleStats, findExactLevelForCp } from '../pvp/stats.js';
import { sanitizeLevel } from './calculator-logic.js';

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

const searchInput = document.getElementById('calculator-search-input');
const searchResultsList = document.getElementById('calculator-search-results');
const emptyState = document.getElementById('calculator-empty-state');
const fieldsArea = document.getElementById('calculator-fields');
const levelInput = document.getElementById('calculator-level-input');
const cpInput = document.getElementById('calculator-cp-input');
const hpValue = document.getElementById('calculator-hp-value');
const notFoundHint = document.getElementById('calculator-not-found-hint');
const ivAtkSelect = document.getElementById('calculator-iv-atk');
const ivDefSelect = document.getElementById('calculator-iv-def');
const ivStaSelect = document.getElementById('calculator-iv-sta');

let pokemonList = [];
let activeSuggestionIndex = -1;

const state = {
  species: null,
  ivs: { atk: 15, def: 15, hp: 15 },
  level: null,
  cp: null,
};

async function loadPokemonData() {
  const response = await fetch(POKEMON_DATA_URL);
  pokemonList = await response.json();
}

function getPokemon() {
  return pokemonList.find((p) => p.speciesId === state.species) ?? null;
}

function updateHpDisplay() {
  const pokemon = getPokemon();
  if (!pokemon || state.level === null) {
    hpValue.textContent = '—';
    return;
  }
  const cpm = getCpmForLevel(state.level);
  const battle = calculateBattleStats(pokemon.baseStats, state.ivs, cpm);
  hpValue.textContent = String(Math.round(battle.hp));
}

function recomputeCpFromLevel() {
  const pokemon = getPokemon();
  if (!pokemon || state.level === null) return;
  const cpm = getCpmForLevel(state.level);
  const cp = calculateCP(pokemon.baseStats, state.ivs, cpm);
  state.cp = cp;
  cpInput.value = cp;
  notFoundHint.hidden = true;
  updateHpDisplay();
}

function recomputeLevelFromCp() {
  const pokemon = getPokemon();
  if (!pokemon || state.cp === null) return;
  const level = findExactLevelForCp(pokemon.baseStats, state.ivs, state.cp);
  if (level === null) {
    state.level = null;
    levelInput.value = '';
    notFoundHint.hidden = false;
  } else {
    state.level = level;
    levelInput.value = level;
    notFoundHint.hidden = true;
  }
  updateHpDisplay();
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

  emptyState.hidden = true;
  fieldsArea.hidden = false;

  // 規則 1：不分第一次選定或切換到另一隻，Level/CP/HP 一律清空，不設預設值，IV 維持目前的選擇不變
  state.level = null;
  state.cp = null;
  levelInput.value = '';
  cpInput.value = '';
  hpValue.textContent = '—';
  notFoundHint.hidden = true;
}

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    item.classList.toggle('autocomplete-list__item--active', index === activeSuggestionIndex);
  });
}

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
  if (!event.target.closest('.calculator-search')) {
    searchResultsList.hidden = true;
  }
});

cpInput.addEventListener('input', () => {
  // 規則 2：CP 不合法（<10、非整數）時不執行反推搜尋，Level/HP 維持上一次合法值，
  // 但顯示同一句提示——不合法輸入本來就找不到對應等級，用同一套訊息比維護兩套邏輯簡單
  if (cpInput.value === '') {
    state.cp = null;
    notFoundHint.hidden = true;
    return;
  }
  if (!cpInput.validity.valid) {
    state.cp = null;
    notFoundHint.hidden = false;
    return;
  }
  state.cp = Number(cpInput.value);
  recomputeLevelFromCp();
});

levelInput.addEventListener('input', () => {
  // 規則 3（打字過程中）：只有目前值合法才即時正推，避免打到一半（例如「12.」）被搶先處理
  if (levelInput.value === '' || !levelInput.validity.valid) {
    state.level = null;
    return;
  }
  state.level = Number(levelInput.value);
  recomputeCpFromLevel();
});

levelInput.addEventListener('change', () => {
  // 規則 3（離開欄位時）：非空但不合法的值，自動校正成最接近的合法值並同步更新顯示
  if (levelInput.value === '' || levelInput.validity.valid) return;
  const corrected = sanitizeLevel(Number(levelInput.value));
  levelInput.value = corrected;
  state.level = corrected;
  recomputeCpFromLevel();
});

function onIvChange() {
  // 規則 4：永遠以目前的 Level 為準重新正推，state.level 為 null 時 recomputeCpFromLevel 會直接 no-op
  state.ivs = { atk: Number(ivAtkSelect.value), def: Number(ivDefSelect.value), hp: Number(ivStaSelect.value) };
  recomputeCpFromLevel();
}
ivAtkSelect.addEventListener('change', onIvChange);
ivDefSelect.addEventListener('change', onIvChange);
ivStaSelect.addEventListener('change', onIvChange);

loadPokemonData();
