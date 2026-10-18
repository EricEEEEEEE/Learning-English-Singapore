// C12 browser helpers on top of the C4 synthetic microphone. The page measures how much sound a recording has with
// the Web Audio API; here AudioContext is replaced by a stand-in whose analyser reports a level the test controls
// (0 = silence, 0.005 = near silence, 0.2 = a voice). Nothing reaches a real microphone, a model or the network.
export { installMic, routePractice, openPractice, panel, twoTurns, reply, replyWav, voice } from './c4-practice-browser.mjs';

export async function installLevel(page, level) {
  await page.evaluate(level => {
    window.c12Level = level;
    window.c12Contexts = 0; window.c12Closed = 0;
    class SyntheticAnalyser {
      constructor() { this.fftSize = 2048; }
      get frequencyBinCount() { return this.fftSize / 2; }
      getFloatTimeDomainData(array) { for (let i = 0; i < array.length; i++) array[i] = (i % 2 ? -1 : 1) * window.c12Level; }
      getByteTimeDomainData(array) { for (let i = 0; i < array.length; i++) array[i] = Math.round(128 + (i % 2 ? -1 : 1) * window.c12Level * 127); }
      connect() {} disconnect() {}
    }
    class SyntheticAudioContext {
      constructor() { window.c12Contexts++; this.state = 'running'; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return new SyntheticAnalyser(); }
      resume() { this.state = 'running'; return Promise.resolve(); }
      close() { this.state = 'closed'; window.c12Closed++; return Promise.resolve(); }
    }
    window.AudioContext = SyntheticAudioContext;
    window.webkitAudioContext = SyntheticAudioContext;
  }, level);
}
export const setLevel = (page, level) => page.evaluate(level => { window.c12Level = level; }, level);

// Records every play() call: which element, and whether its source was an in-page recording (blob:).
export async function recordPlays(page, { reject = false } = {}) {
  await page.evaluate(reject => {
    window.c12Plays = []; window.c12Reject = reject;
    HTMLMediaElement.prototype.play = function () {
      window.c12Plays.push({ tag: this.tagName.toLowerCase(), testid: this.dataset.testid ?? '', blob: String(this.currentSrc || this.src || '').startsWith('blob:'), muted: this.muted });
      return window.c12Reject ? Promise.reject(new DOMException('Synthetic autoplay rejection', 'NotAllowedError')) : Promise.resolve();
    };
  }, reject);
}
export const plays = page => page.evaluate(() => window.c12Plays);

// Object URLs the page creates and releases, so a test can prove the recording is let go when the turn changes.
export async function recordObjectUrls(page) {
  await page.evaluate(() => {
    window.c12Created = []; window.c12Revoked = [];
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = object => { const url = create(object); window.c12Created.push(url); return url; };
    URL.revokeObjectURL = url => { window.c12Revoked.push(url); return revoke(url); };
  });
}

export async function speakFor(scope, page, ms = 800) {
  await scope.getByRole('button', { name: '开始说', exact: true }).click();
  await scope.getByRole('button', { name: '说完了', exact: true }).waitFor();
  await page.waitForTimeout(ms);
  await scope.getByRole('button', { name: '说完了', exact: true }).click();
}
