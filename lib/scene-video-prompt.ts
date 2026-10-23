import type { GeneratedScript } from './generated-script';

// Segment-relative line timings (seconds from the start of that segment's audio). C15-4f: index / count place the
// segment in the lesson (first segment: no walk-in; last one ending on a learner line: a quiet, nodding ending).
export type SegmentLines = { lines: { lineId: string; start: number; end: number }[]; index?: number; count?: number };

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
  let speech = `${pronoun} says: ${said}.`, opening = '', ending = '';
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
    if (segment.index === 0) opening = ` ${pronoun} is already standing close in front of the camera from the first frame and does not walk in.`;
    const lastLine = timed.reduce<(typeof timed)[number] | undefined>((latest, item) => !latest || item.end >= latest.end ? item : latest, undefined);
    if (Number.isSafeInteger(segment.index) && Number.isSafeInteger(segment.count) && segment.index === segment.count! - 1 && lastLine?.line!.role === 'learner')
      ending = ` At the end of the clip ${subject} listens silently with ${possessive} lips closed and nods gently.`;
  }
  const prompt = [
    `Vertical first-person view through the eyes of a learner who stays off camera; at most the learner's hands are visible.`,
    `Setting in Singapore: ${scene.setting}`,
    `One fictional adult ${person}, ${scene.partnerLook}, faces the camera and talks directly to the viewer.`,
    // C15-4f: "face and shoulders filling the upper half of the frame" pushed attempt 6 into a big close-up; waist-up now.
    `From the very first frame ${pronoun.toLowerCase()} already stands close in front of the viewer, seen waist-up; ${pronoun.toLowerCase()} does not walk in from a distance.${opening}`,
    `Medium shot, waist-up, same framing as the reference image; the camera does not move or zoom. Even soft indoor light, natural calm expression.`,
    `${pronoun} is the only person on screen and the only one whose lips move. No one else is in the frame: no passers-by and no other people in the background. ${speech}${ending}`,
    `While the unseen viewer answers, ${pronoun.toLowerCase()} listens quietly with a closed mouth and small nods.`,
    `One steady eye-level shot, single shot, not multi-shot, in one place: same person, clothing, background and lighting throughout, no cuts, no scene changes, no other people speaking.`,
    `No readable signs, no subtitles. Match the supplied audio; do not add dialogue.`,
  ].join(' ');
  return prompt.length <= 5000 ? prompt : prompt.slice(0, 5000);
}
