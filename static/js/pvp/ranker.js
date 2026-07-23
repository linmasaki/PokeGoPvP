import { getCpmForLevel } from './cpm.js';
import { calculateCP, calculateBattleStats, findLevelForCpCap } from './stats.js';

export function rankIVCombinations(baseStats, { ivFloor, minLevel, maxLevel, cpCap }) {
  const combinations = [];

  for (let atk = ivFloor; atk <= 15; atk++) {
    for (let def = ivFloor; def <= 15; def++) {
      for (let hp = ivFloor; hp <= 15; hp++) {
        const ivs = { atk, def, hp };
        const level = findLevelForCpCap(baseStats, ivs, cpCap, minLevel, maxLevel);
        if (level === null) continue;

        const cpm = getCpmForLevel(level);
        const battle = calculateBattleStats(baseStats, ivs, cpm);
        const cp = calculateCP(baseStats, ivs, cpm);
        const statProduct = Math.round(battle.atk * battle.def * battle.hp);

        combinations.push({ ivs, level, cp, battle, statProduct });
      }
    }
  }

  combinations.sort((a, b) => {
    if (b.statProduct !== a.statProduct) return b.statProduct - a.statProduct;
    if (b.battle.atk !== a.battle.atk) return b.battle.atk - a.battle.atk;
    if (b.battle.hp !== a.battle.hp) return b.battle.hp - a.battle.hp;
    if (b.cp !== a.cp) return b.cp - a.cp;
    return b.ivs.hp - a.ivs.hp;
  });

  return combinations;
}
