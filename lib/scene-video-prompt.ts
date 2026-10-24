import type { GeneratedScript } from './generated-script';

// Segment-relative line timings (seconds from the start of that segment's audio). C15-4f: index / count place the
// segment in the lesson (first segment: no walk-in; last one ending on a learner line: a quiet, nodding ending).
export type SegmentLines = { lines: { lineId: string; start: number; end: number }[]; index?: number; count?: number };

// C16-1 (2026-10-24, zero cost; hawker attempt 9 had no counter or hall, no apron, and a large cloud of steam over the
// background in segment 2): a small table of local places gives two or three fixed things to keep in view; clothing items
// named in partnerLook stay on in every frame; the background stays clear of steam, smoke and haze; people that the
// setting mentions (customers, children, parents) stay out of view, since the partner is the only person on screen.
type Place = { match: RegExp; things: (object: string) => string };
const PLACES: Place[] = [
  { match: /hawker|food court|kopitiam|coffee shop|food stall|小贩|熟食|咖啡店/i, things: o => `a food stall counter between ${o} and the viewer, and behind ${o} the open hawker centre hall with tables, stools and ceiling fans, softly out of focus and empty of people` },
  { match: /school|classroom|kindergarten|学校|教室|幼儿园|家长会/i, things: o => `a primary school corridor or classroom doorway behind ${o}, with a notice board and bright painted walls, softly out of focus and empty of people` },
  { match: /clinic|polyclinic|hospital|doctor|pharmacy|诊所|医院|药房/i, things: o => `a clinic reception counter between ${o} and the viewer, and a calm waiting area behind ${o}, softly out of focus and empty of people` },
  { match: /supermarket|grocery|minimart|超市|杂货/i, things: o => `a checkout counter between ${o} and the viewer, and supermarket shelves behind ${o}, softly out of focus and empty of people` },
  { match: /\bhdb\b|void deck|estate|neighbou?r|组屋|邻居|楼下/i, things: o => `an HDB void deck with pillars and letterboxes behind ${o}, softly out of focus and empty of people` },
  { match: /\bmrt\b|bus (stop|interchange)|train station|地铁|巴士|车站/i, things: o => `a station or bus stop sign area behind ${o}, softly out of focus and empty of people` },
  { match: /office|workplace|company|办公室|公司|同事/i, things: o => `an office desk between ${o} and the viewer, and a tidy open office behind ${o}, softly out of focus and empty of people` },
  { match: /hotel|reception desk|front desk|酒店|前台/i, things: o => `a hotel front desk between ${o} and the viewer, and a quiet lobby behind ${o}, softly out of focus and empty of people` },
];
const CLOTHING = ['apron', 'uniform', 'lanyard', 'name tag', 'scrubs', 'vest', 'cap', 'headscarf', 'tudung', 'lab coat'];
const CROWD = /\b(customers?|queue|queu(e|ing)|lined up|crowds?|children|kids|students|pupils|parents|people|passers-by|shoppers|diners|patients|commuters|colleagues)\b/i;
function sceneDetails(goal: string, setting: string, look: string, object: string, possessive: string, Pronoun: string) {
  const place = PLACES.find(item => item.match.test(setting)) ?? PLACES.find(item => item.match.test(goal));
  const lower = look.toLowerCase();
  const worn = CLOTHING.filter(item => new RegExp(`\\b${item}\\b`).test(lower));
  return [
    ...(place ? [`Keep these fixed things in view: ${place.things(object)}.`] : []),
    ...(worn.length ? [`${Pronoun} wears ${possessive} ${worn.join(' and ')} in every frame.`] : []),
    `The background stays clear and the same throughout: no steam, smoke, mist, fog or haze covering it.`,
    ...(CROWD.test(setting) ? ['Any customers, queue, crowd, children, parents or other people mentioned above stay out of view.'] : []),
  ].join(' ');
}

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
    sceneDetails(goal, scene.setting, scene.partnerLook, object, possessive, pronoun),
    `No readable signs, no subtitles. Match the supplied audio; do not add dialogue.`,
  ].join(' ');
  return prompt.length <= 5000 ? prompt : prompt.slice(0, 5000);
}
