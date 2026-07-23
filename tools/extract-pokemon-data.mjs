// Extracts a slim Pokemon dataset from PvPoke (https://github.com/pvpoke/pvpoke,
// MIT License) for this project's PvP CP/IV calculations.
// Source: src/data/gamemaster/pokemon.json.
// Re-run manually (`npm run extract-data`) after PvPoke adds new Pokemon/seasons.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json';
const OUTPUT_PATH = fileURLToPath(new URL('../static/js/data/pokemon.json', import.meta.url));

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
    if (p.family.evolutions) entry.family.evolutions = p.family.evolutions;
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

  await writeFile(OUTPUT_PATH, JSON.stringify(extracted, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${extracted.length} Pokemon entries to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
