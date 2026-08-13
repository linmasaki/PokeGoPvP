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

// Presentation helpers — pure, so they live here (with the rest of the testable logic) rather
// than in the DOM module that renders with them. Tier boundaries match the rank-tier--* colour
// bands documented in the design spec.
export function getRankTierClass(rank) {
  if (rank <= 100) return 'rank-tier--top100';
  if (rank <= 500) return 'rank-tier--mid';
  return 'rank-tier--low';
}

export function formatIvTriplet(ivs) {
  return `${ivs.atk}/${ivs.def}/${ivs.hp}`;
}
