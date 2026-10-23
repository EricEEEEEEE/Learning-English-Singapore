import type { GeneratedScript } from './generated-script';

// Builds the provider prompt for every segment of one course. Without a scene description (older scripts)
// the stored goal is sent unchanged, as before.
export function sceneVideoPrompt(goal: string, script?: GeneratedScript) {
  const scene = script?.scene;
  if (!scene) return goal;
  const [person, pronoun] = scene.partnerGender === 'male' ? ['man', 'He'] : ['woman', 'She'];
  const said = script.lines.filter(line => line.role === 'partner').map(line => `"${line.text}"`).join(' / ');
  const prompt = [
    `Vertical first-person view through the eyes of a learner who stays off camera; at most the learner's hands are visible.`,
    `Setting in Singapore: ${scene.setting}`,
    `One fictional adult ${person}, ${scene.partnerLook}, faces the camera and talks directly to the viewer.`,
    `From the very first frame ${pronoun.toLowerCase()} already stands close in front of the viewer, face and shoulders filling the upper half of the frame; ${pronoun.toLowerCase()} does not walk in from a distance.`,
    `${pronoun} is the only person on screen and the only one whose lips move. No one else is in the frame: no passers-by and no other people in the background. ${pronoun} says: ${said}.`,
    `While the unseen viewer answers, ${pronoun.toLowerCase()} listens quietly with a closed mouth and small nods.`,
    `One steady eye-level shot, single shot, not multi-shot, in one place: same person, clothing, background and lighting throughout, no cuts, no scene changes, no other people speaking.`,
    `No readable signs, no subtitles. Match the supplied audio; do not add dialogue.`,
  ].join(' ');
  return prompt.length <= 5000 ? prompt : prompt.slice(0, 5000);
}
