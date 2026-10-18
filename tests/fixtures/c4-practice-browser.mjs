import { expect } from '@playwright/test';
import { setupGuided, enterTerms } from './t69-guided-browser.mjs';
import { startPracticeSetup } from './c10-shell.mjs';

// Shared helpers for the C4 listening/help pages. Same synthetic microphone and practice route as T63B:
// no real microphone, no network beyond the page's own routes, no model calls.
export const voice = 'synthetic learner voice';
export const replyWav = Buffer.from('RIFF$\u0000\u0000\u0000WAVEfmt ').toString('base64');
export const reply = (over = {}) => ({ kind: 'reply', transcript: 'Yes, I booked a room.', understood: true, reply: { text: 'Great. May I see your passport?', audioBase64: replyWav, mimeType: 'audio/wav' }, ...over });

export async function installMic(page) {
  await page.evaluate(voice => {
    window.t63Stopped = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.t69MicCalls++; window.t63Constraints = constraints;
      return { getTracks: () => [{ stop: () => { window.t63Stopped++; } }] };
    };
    class SyntheticRecorder extends EventTarget {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor(stream) { super(); this.stream = stream; this.mimeType = 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; this.fire('start'); }
      stop() {
        if (this.state !== 'recording') return;
        this.state = 'inactive';
        this.fire('dataavailable', { data: new Blob([voice], { type: 'audio/webm' }) });
        this.fire('stop');
      }
      fire(type, extra = {}) { const event = Object.assign(new Event(type), extra); this.dispatchEvent(event); this[`on${type}`]?.(event); }
    }
    window.MediaRecorder = SyntheticRecorder;
  }, voice);
}

export async function routePractice(page, responses) {
  const bodies = [];
  await page.route('**/api/practice-turn', async route => {
    bodies.push(route.request().postDataJSON());
    const next = responses[Math.min(bodies.length - 1, responses.length - 1)];
    return route.fulfill({ status: next.status ?? 200, json: next.json });
  });
  return bodies;
}

export async function openSentences(page, context, baseURL, options) {
  const guided = await setupGuided(page, context, baseURL, options);
  await enterTerms(guided.main);
  await guided.main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  return guided;
}
export async function openPrompt(page, context, baseURL, options) {
  const guided = await openSentences(page, context, baseURL, options);
  await guided.main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  return guided;
}
export async function openPractice(page, context, baseURL, options) {
  const guided = await openPrompt(page, context, baseURL, options);
  await guided.main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(guided.main.getByRole('heading', { name: '开口对练', exact: true })).toBeVisible();
  // C10-4: the first-turn settings sheet; `keepSetup` leaves it open for tests about the settings themselves.
  if (!options?.keepSetup) await startPracticeSetup(guided.main);
  return guided;
}
export const panel = main => main.getByTestId('scene-panel-5');
export const twoTurns = course => {
  const [partner, learner] = course.lines;
  course.lines.push({ ...structuredClone(partner), id: 'line-2', text: 'May I see your passport?', start: 8, end: 9.5 }, { ...structuredClone(learner), id: 'line-3', text: 'Here you are.', start: 10, end: 11.5 });
  course.turns.push({ partnerLineId: 'line-2', learnerLineId: 'line-3' });
};
export async function mediaReady(video) { await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2); }
// Record every playback position the page reaches so loops and jumps can be checked after the fact.
export async function trackTimes(video) {
  await video.evaluate(v => { window.c4Times = []; v.addEventListener('timeupdate', () => window.c4Times.push(v.currentTime)); });
}
