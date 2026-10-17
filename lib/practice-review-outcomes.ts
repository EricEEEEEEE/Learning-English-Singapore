// C9-6: pure outcome rules shared by the practice page and the review store (no server imports here).
// C9-6 (spec F10.1): what one turn of practice showed, judged only from the page's own events.
export const practiceOutcomes = ['independent', 'after_hint', 'needs_help', 'chose_meaning', 'unobserved'] as const;
export type PracticeOutcome = typeof practiceOutcomes[number];
export type PracticeHelp = { hints: number; autoHelp: number; translations: number; native: number };
export type PracticeReview = { session: string; turns: { turnIndex: number; outcome: PracticeOutcome }[]; help: PracticeHelp; at: number };

// Spoken and understood without help = independent; spoken after any help on that turn = after a hint; the partner
// still not understanding the last attempt = still needs help; a meaning picked without speaking is listening only;
// nothing at all is not yet observed. Nothing here is a score.
export function classifyPracticeTurn(turn: { spoken: boolean; understood: boolean | null; helped: boolean; chose: boolean }): PracticeOutcome {
  if (turn.spoken) return turn.understood === false ? 'needs_help' : turn.helped || turn.chose ? 'after_hint' : 'independent';
  return turn.chose ? 'chose_meaning' : 'unobserved';
}
export function countOutcomes(outcomes: PracticeOutcome[]): Record<PracticeOutcome, number> {
  const counts = Object.fromEntries(practiceOutcomes.map(outcome => [outcome, 0])) as Record<PracticeOutcome, number>;
  for (const outcome of outcomes) counts[outcome]++;
  return counts;
}
