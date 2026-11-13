/**
 * A team's name as `teams.name` accepts it: trimmed, inner whitespace
 * collapsed, 2–120 characters (the column's check constraint). Returns the
 * cleaned name, or the reason it can't be used.
 */
export function cleanTeamName(raw: string): { name: string } | { problem: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { problem: "A team name needs at least two characters." };
  if (name.length > 120) return { problem: "A team name can be at most 120 characters." };
  return { name };
}
