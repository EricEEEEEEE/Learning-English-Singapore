// C8-5 (spec F7.5): when the learner does not want to speak yet, they can pick which meaning they want to say.
// The choices are the help-language meanings of this course's own learner lines, never generated text: this turn's
// line plus up to two other learner lines, in the course's turn order. Empty or repeated meanings are dropped
// rather than invented, so a course with only one distinct learner meaning offers just that one.
type Line = { id: string; translations?: Partial<Record<string, string>> };
type Course = { lines: Line[]; turns: { partnerLineId: string; learnerLineId: string }[] };
export type MeaningOption = { lineId: string; meaning: string };

export function meaningOptions(course: Course, turnIndex: number, language: string): MeaningOption[] {
  const meaningOf = (lineId: string) => course.lines.find(line => line.id === lineId)?.translations?.[language]?.trim() ?? '';
  const current = course.turns[turnIndex]?.learnerLineId;
  if (!current || !meaningOf(current)) return [];
  const picked: { order: number; option: MeaningOption }[] = [{ order: turnIndex, option: { lineId: current, meaning: meaningOf(current) } }];
  const seen = new Set([picked[0].option.meaning]);
  // Nearest other turns first (after this one, then before), so the choices stay close to the conversation.
  const others = course.turns.map((turn, order) => ({ order, lineId: turn.learnerLineId })).filter(item => item.order !== turnIndex)
    .sort((a, b) => Math.abs(a.order - turnIndex) - Math.abs(b.order - turnIndex) || b.order - a.order);
  for (const item of others) {
    if (picked.length >= 3) break;
    const meaning = meaningOf(item.lineId);
    if (!meaning || seen.has(meaning) || picked.some(p => p.option.lineId === item.lineId)) continue;
    seen.add(meaning); picked.push({ order: item.order, option: { lineId: item.lineId, meaning } });
  }
  return picked.sort((a, b) => a.order - b.order).map(item => item.option);
}
