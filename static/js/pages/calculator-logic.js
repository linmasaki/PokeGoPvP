export function sanitizeLevel(rawValue) {
  const rounded = Math.round(rawValue * 2) / 2;
  return Math.min(51, Math.max(1, rounded));
}
