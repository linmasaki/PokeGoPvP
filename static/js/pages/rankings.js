import { searchPokemon } from './rankings-logic.js';

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

const searchInput = document.getElementById('rankings-search-input');
const searchResultsList = document.getElementById('rankings-search-results');

let pokemonList = [];
let activeSuggestionIndex = -1;

const state = {
  species: null,
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
  if (!event.target.closest('.rankings-search')) {
    searchResultsList.hidden = true;
  }
});

loadPokemonData();
