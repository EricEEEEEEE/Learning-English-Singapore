import type { GeneratedScript } from './generated-script';

// Segment-relative line timings (seconds from the start of that segment's audio).
export type SegmentLines = { lines: { lineId: string; start: number; end: number }[] };

// Builds the provider prompt for every segment of one course. Without a scene description (older scripts)
// the stored goal is sent unchanged, as before. C15-4c: with a segment's timings, the prompt names only that
// segment's partner words and the times she listens silently (a whole-lesson list made the model mouth words
// during the learner's silent lines).
export function sceneVideoPrompt(goal: string, script?: GeneratedScript, segment?: SegmentLines) {
  const scene = script?.scene;
  if (!scene) return goal;
  const [person, pronoun] = scene.partnerGender === 'male' ? ['man', 'He'] : ['woman', 'She'];
  const said = script.lines.filter(line => line.role === 'partner').map(line => `"${line.text}"`).join(' / ');
  const subject = pronoun.toLowerCase(), possessive = pronoun === 'He' ? 'his' : 'her', object = pronoun === 'He' ? 'him' : 'her';
  let speech = `${pronoun} says: ${said}.`;
  if (segment) {
    const byId = new Map(script.lines.map(line => [line.id, line]));
    const timed = segment.lines.map(timing => ({ ...timing, line: byId.get(timing.lineId) })).filter(item => item.line);
    const own = timed.filter(item => item.line!.role === 'partner').map(item => `"${item.line!.text}"`).join(' / ');
    const quiet = timed.filter(item => item.line!.role === 'learner')
      .map(item => `From ${item.start.toFixed(1)} s to ${item.end.toFixed(1)} s ${subject} listens silently with ${possessive} lips closed and does not speak.`);
    speech = [
      own ? `In this clip ${subject} says only: ${own}.` : `In this clip ${subject} does not speak at all.`,
      ...(own && timed[0]?.line!.role === 'learner' ? [`The clip opens with ${object} listening.`] : []),
      ...quiet,
      `${pronoun} moves ${possessive} lips only while ${possessive} own voice is heard.`,
    ].join(' ');
  }
  const prompt = [
    `Vertical first-person view through the eyes of a learner who stays off camera; at most the learner's hands are visible.`,
    `Setting in Singapore: ${scene.setting}`,
    `One fictional adult ${person}, ${scene.partnerLook}, faces the camera and talks directly to the viewer.`,
    `From the very first frame ${pronoun.toLowerCase()} already stands close in front of the viewer, face and shoulders filling the upper half of the frame; ${pronoun.toLowerCase()} does not walk in from a distance.`,
    `${pronoun} is the only person on screen and the only one whose lips move. No one else is in the frame: no passers-by and no other people in the background. ${speech}`,
    `While the unseen viewer answers, ${pronoun.toLowerCase()} listens quietly with a closed mouth and small nods.`,
    `One steady eye-level shot, single shot, not multi-shot, in one place: same person, clothing, background and lighting throughout, no cuts, no scene changes, no other people speaking.`,
    `No readable signs, no subtitles. Match the supplied audio; do not add dialogue.`,
  ].join(' ');
  return prompt.length <= 5000 ? prompt : prompt.slice(0, 5000);
}
