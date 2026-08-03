// CP and battle-stat math, reimplemented from PvPoke's calculateCP() logic
// (https://github.com/pvpoke/pvpoke, MIT License, src/js/pokemon/Pokemon.js).
import { getCpmForLevel } from './cpm.js';

export function calculateCP(baseStats, ivs, cpm) {
  const atk = baseStats.atk + ivs.atk;
  const def = baseStats.def + ivs.def;
  const hp = baseStats.hp + ivs.hp;
  const rawCp = Math.floor((atk * Math.sqrt(def) * Math.sqrt(hp) * cpm * cpm) / 10);
  return Math.max(10, rawCp);
}

export function calculateBattleStats(baseStats, ivs, cpm) {
  const atk = (baseStats.atk + ivs.atk) * cpm;
  const def = (baseStats.def + ivs.def) * cpm;
  const hp = Math.max(10, Math.floor((baseStats.hp + ivs.hp) * cpm));
  return { atk, def, hp };
}

export function findLevelForCpCap(baseStats, ivs, cpCap, minLevel, maxLevel) {
  for (let level = maxLevel; level >= minLevel; level -= 0.5) {
    const cpm = getCpmForLevel(level);
    if (calculateCP(baseStats, ivs, cpm) <= cpCap) {
      return level;
    }
  }
  return null;
}

export function findExactLevelForCp(baseStats, ivs, targetCp, minLevel = 1, maxLevel = 51) {
  for (let level = minLevel; level <= maxLevel; level += 0.5) {
    const cpm = getCpmForLevel(level);
    if (calculateCP(baseStats, ivs, cpm) === targetCp) return level;
  }
  return null;
}
