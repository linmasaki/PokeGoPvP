// Extracts a slim Pokemon dataset from PvPoke (https://github.com/pvpoke/pvpoke,
// MIT License) for this project's PvP CP/IV calculations.
// Source: src/data/gamemaster/pokemon.json.
// Re-run manually (`npm run extract-data`) after PvPoke adds new Pokemon/seasons.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json';
const OUTPUT_PATH = fileURLToPath(new URL('../static/js/data/pokemon.json', import.meta.url));

// Upstream misspells the odd evolution target. A reference matching no species is silently
// dropped wherever an evolution chain is walked, so the form just vanishes from the UI with
// nothing on screen to say so — map these back onto the id the species is really filed under.
const EVOLUTION_ID_FIXES = new Map([
  ['lycranroc_dusk', 'lycanroc_dusk'],
]);

export function correctEvolutionIds(evolutionIds) {
  return evolutionIds.map((id) => EVOLUTION_ID_FIXES.get(id) ?? id);
}

// Whatever stays unresolved after those corrections is either a species upstream lists before it
// ships, or a new typo. Both are worth printing while extracting rather than leaving them to
// surface as a console warning in the browser months later.
export function findDanglingEvolutions(entries) {
  const known = new Set(entries.map((entry) => entry.speciesId));
  const dangling = [];

  for (const entry of entries) {
    for (const evolutionId of entry.family?.evolutions ?? []) {
      if (!known.has(evolutionId)) dangling.push(`${entry.speciesId} -> ${evolutionId}`);
    }
  }

  return dangling;
}

function extractEntry(p) {
  const entry = {
    speciesId: p.speciesId,
    speciesName: p.speciesName,
    dex: p.dex,
    searchPriority: p.searchPriority ?? null,
    nicknames: p.nicknames ?? [],
    types: p.types ?? [],
    baseStats: { atk: p.baseStats.atk, def: p.baseStats.def, hp: p.baseStats.hp },
  };

  if (p.family) {
    entry.family = { id: p.family.id };
    if (p.family.parent) entry.family.parent = p.family.parent;
    if (p.family.evolutions) entry.family.evolutions = correctEvolutionIds(p.family.evolutions);
  }

  return entry;
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch PvPoke pokemon.json: ${response.status} ${response.statusText}`);
  }
  const pokemonList = await response.json();

  const filtered = pokemonList.filter((p) => p.released && !(p.tags ?? []).includes('shadow'));
  const extracted = filtered.map(extractEntry);

  const dangling = findDanglingEvolutions(extracted);
  if (dangling.length > 0) {
    console.warn(`${dangling.length} evolution reference(s) match no extracted species:`);
    for (const reference of dangling) console.warn(`  ${reference}`);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(extracted, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${extracted.length} Pokemon entries to ${OUTPUT_PATH}`);
}

// Only fetch when run as a script — importing this module must not reach the network.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
