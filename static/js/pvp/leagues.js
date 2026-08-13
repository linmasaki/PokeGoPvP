// League CP caps — game rules, shared by every page that ranks IVs. Lives in the engine layer
// (next to cpm/stats/ranker) rather than in any one page's logic module, because both the
// Rankings page and the Search String page rank against these caps.

const CP_CAPS = { great: 1500, ultra: 2500, master: Infinity };

// Throws rather than returning undefined for an unknown league: an undefined cap silently
// poisons the whole ranking pass (every `cp <= undefined` is false, so findLevelForCpCap
// returns null for all 4096 IV combos and the page just shows "no results" with no clue why).
// Callers pass either a hardcoded league or a value already validated against VALID_LEAGUES,
// so reaching this is a bug worth surfacing immediately.
export function getCpCapForLeague(league) {
  const cap = CP_CAPS[league];
  if (cap === undefined) {
    throw new Error(`Unknown league: ${league}`);
  }
  return cap;
}
