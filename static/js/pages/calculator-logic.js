const MIN_LEVEL = 1;
const MAX_LEVEL = 51;

// A non-numeric input would sail through the Math.round/min/max chain as NaN and be written
// straight back into the level field, blanking it and leaving the page in a stuck state. The
// only current caller guards with `input.validity.valid` first so NaN is unreachable today,
// but that is the caller's invariant, not this function's — clamp to the floor explicitly.
export function sanitizeLevel(rawValue) {
  if (!Number.isFinite(rawValue)) return MIN_LEVEL;
  const rounded = Math.round(rawValue * 2) / 2;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, rounded));
}
