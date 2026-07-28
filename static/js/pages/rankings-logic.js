export function getCpCapForLeague(league) {
  const caps = { great: 1500, ultra: 2500, master: Infinity };
  return caps[league];
}

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

export function findAbsoluteRank(rankedList, ivs) {
  const index = rankedList.findIndex(
    (c) => c.ivs.atk === ivs.atk && c.ivs.def === ivs.def && c.ivs.hp === ivs.hp
  );
  return index === -1 ? null : index + 1;
}

export function computePerfectPercent(statProduct, rank1StatProduct) {
  return (statProduct / rank1StatProduct) * 100;
}

export function filterAchievableTop(rankedList, ivFloor, limit) {
  const results = [];
  for (let i = 0; i < rankedList.length && results.length < limit; i++) {
    const combo = rankedList[i];
    if (combo.ivs.atk >= ivFloor && combo.ivs.def >= ivFloor && combo.ivs.hp >= ivFloor) {
      results.push({ ...combo, rank: i + 1 });
    }
  }
  return results;
}

export function applyShadowMultiplier(battle) {
  return { atk: battle.atk * 1.2, def: battle.def * 0.8, hp: battle.hp };
}
