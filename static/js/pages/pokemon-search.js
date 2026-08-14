// Shared species-search infrastructure for the Rankings / Calculator / Search String pages.
// All three load the same species list and drive an identical autocomplete widget over it; the
// only real differences are which elements they bind to and what they do once a species is
// picked, so those are the parameters and everything else lives here.

const POKEMON_DATA_URL = new URL('../data/pokemon.json', import.meta.url);

// A single-letter query matches hundreds of species ("a" matches ~700). The popup only shows a
// handful at a time, so building every match into a list item with its own click handler on each
// keystroke is wasted work; anyone looking further down narrows the query instead.
const MAX_SUGGESTIONS = 50;

// Every page is dead in the water without this list, and a silent failure just leaves the user
// typing into a search box that never matches anything. Surface it instead: log the real cause
// for anyone with devtools open, and let the caller decide what to show.
export async function loadPokemonList() {
  const response = await fetch(POKEMON_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Pokemon data: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Matches on species name or nickname, anywhere in the string (not just as a prefix), so "zard"
// finds Charizard and "kchu" finds Pikachu. Results are ordered by dex so the list reads in the
// order players expect; searchPriority only breaks ties within a single dex number (most entries
// have no priority set, so using it as the primary key would bury common species).
export function searchPokemon(query, pokemonList) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const matches = pokemonList.filter((p) => {
    if (p.speciesName.toLowerCase().includes(normalizedQuery)) return true;
    return (p.nicknames ?? []).some((n) => n.toLowerCase().includes(normalizedQuery));
  });

  matches.sort((a, b) => {
    if (a.dex !== b.dex) return a.dex - b.dex;
    const aPriority = a.searchPriority ?? Infinity;
    const bPriority = b.searchPriority ?? Infinity;
    return aPriority - bPriority;
  });

  return matches;
}

/**
 * Wires up the autocomplete behaviour shared by every page that picks a species.
 *
 * Follows the ARIA combobox pattern: without those attributes the popup does not exist as far as
 * a screen reader is concerned, and arrow-key movement through it is announced as nothing at all.
 *
 * @param {object}        options
 * @param {HTMLElement}   options.input             the text input to search from
 * @param {HTMLElement}   options.list              the <ul> the suggestions render into
 * @param {string}        options.containerSelector wrapper selector; a click outside it closes the list
 * @param {() => Array}   options.getPokemonList    reads the page's current species list (it loads async,
 *                                                  so this must be a getter, not a snapshot)
 * @param {(pokemon: object) => void} options.onSelect  page-specific work after a species is chosen
 * @param {(value: string) => void}  [options.onInput]  page-specific work on every keystroke
 * @returns {{ selectSpecies: (speciesId: string) => void, close: () => void }}
 */
export function createAutocomplete({ input, list, containerSelector, getPokemonList, onSelect, onInput }) {
  let activeSuggestionIndex = -1;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-autocomplete', 'list');
  list.setAttribute('role', 'listbox');

  function setExpanded(isOpen) {
    list.hidden = !isOpen;
    input.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) input.removeAttribute('aria-activedescendant');
  }

  function close() {
    setExpanded(false);
  }

  function selectSpecies(speciesId) {
    const pokemon = getPokemonList().find((p) => p.speciesId === speciesId);
    if (!pokemon) return;

    input.value = pokemon.speciesName;
    setExpanded(false);
    list.innerHTML = '';

    onSelect(pokemon);
  }

  function renderSuggestions(matches) {
    list.innerHTML = '';
    activeSuggestionIndex = -1;

    if (matches.length === 0) {
      setExpanded(false);
      return;
    }

    matches.slice(0, MAX_SUGGESTIONS).forEach((pokemon, index) => {
      const item = document.createElement('li');
      item.className = 'autocomplete-list__item';
      // aria-activedescendant points at an id, so every option needs one.
      item.id = `${list.id}-option-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.dataset.speciesId = pokemon.speciesId;

      const dexSpan = document.createElement('span');
      dexSpan.className = 'autocomplete-list__dex';
      dexSpan.textContent = `#${String(pokemon.dex).padStart(3, '0')}`;
      item.appendChild(dexSpan);

      item.appendChild(document.createTextNode(pokemon.speciesName));

      item.addEventListener('click', () => selectSpecies(pokemon.speciesId));
      list.appendChild(item);
    });

    setExpanded(true);
  }

  function updateActiveSuggestion(items) {
    items.forEach((item, index) => {
      const isActive = index === activeSuggestionIndex;
      item.classList.toggle('autocomplete-list__item--active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    const active = items[activeSuggestionIndex];
    if (active) input.setAttribute('aria-activedescendant', active.id);
    else input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('input', () => {
    renderSuggestions(searchPokemon(input.value, getPokemonList()));
    onInput?.(input.value);
  });

  input.addEventListener('keydown', (event) => {
    const items = Array.from(list.querySelectorAll('.autocomplete-list__item'));
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
      setExpanded(false);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest(containerSelector)) {
      setExpanded(false);
    }
  });

  return { selectSpecies, close };
}
