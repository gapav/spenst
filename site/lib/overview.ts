/** Greetings for the overview, in the voice Grep uses. Picked on the client only. */
export const overviewHeadlines = [
  "Ready for test day?",
  "Who got more explosive?",
  "What do the numbers say this week?",
  "Ready to measure progress?",
  "Who needs extra work on one leg?",
] as const;

export function overviewHeadline(random = Math.random()) {
  return overviewHeadlines[Math.min(overviewHeadlines.length - 1, Math.max(0, Math.floor(random * overviewHeadlines.length)))];
}

export function overviewSalutation(now: Date | null) {
  if (!now) return "Hi";
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 18 && hour < 24) return "Good evening";
  return "Hi";
}
