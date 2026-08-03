import { searchPokemon } from './rankings-logic.js';

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

const searchInput = document.getElementById('calculator-search-input');
const searchResultsList = document.getElementById('calculator-search-results');
const emptyState = document.getElementById('calculator-empty-state');
const fieldsArea = document.getElementById('calculator-fields');
const levelInput = document.getElementById('calculator-level-input');
const cpInput = document.getElementById('calculator-cp-input');
const hpValue = document.getElementById('calculator-hp-value');
const notFoundHint = document.getElementById('calculator-not-found-hint');

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

loadPokemonData();
