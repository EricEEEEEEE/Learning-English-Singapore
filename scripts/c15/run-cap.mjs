// C15-4g (2026-10-23, zero cost): a hard cap for one run of the C15-4 driver (--max-usd N), checked BEFORE each paid
// request leaves this machine. An LTX audio-to-video request is priced from its own audio: the seconds of the data URI it
// sends, rounded up to whole seconds, times the model's price per second (how LTX bills); when the length cannot be read
// the model's worst-case segment price is used. An OpenAI request counts at its worst-case reservation until it is settled
// at its actual cost. A request that would take the run past the cap throws here and is never sent. Same logic as the
// attempt 7 wrapper (/mnt/project-files/les-c15/video/school-ltx-2-3-pro-a7-cap-wrapper.mjs), now inside the driver.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const usd = value => Math.round(value * 1e6) / 1e6;

// --max-usd: a positive amount of at most USD25 (the C15-4 item cap); anything else is refused before the run starts.
export function parseMaxUsd(value) {
  if (value === undefined) return undefined;
  const amount = typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 25) throw new Error('--max-usd must be a positive amount in USD, at most 25');
  return amount;
}

// Seconds of audio in a data:audio/...;base64 URI, read with ffprobe from a private temporary file; null when unreadable.
export function probeDataUriSeconds(uri, ffprobe = '/usr/bin/ffprobe') {
  const match = typeof uri === 'string' ? /^data:audio\/[a-z0-9.+-]+;base64,(.*)$/s.exec(uri) : null;
  if (!match) return null;
  const directory = mkdtempSync(join(tmpdir(), 'les-run-cap-'));
  try {
    const file = join(directory, 'audio');
    writeFileSync(file, Buffer.from(match[1], 'base64'), { mode: 0o600 });
    const seconds = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 30_000 }).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch { return null; }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

export function createRunCap({ maxUsd, ltxUsdPerSecond, ltxWorstUsd, probeSeconds = probeDataUriSeconds }) {
  if (!(maxUsd > 0) || !(ltxUsdPerSecond > 0) || !(ltxWorstUsd > 0) || typeof probeSeconds !== 'function') throw new Error('Invalid run cap');
  const entries = [];
  const total = () => usd(entries.reduce((sum, entry) => sum + entry.usd, 0));
  return {
    maxUsd, total, entries: () => entries.map(entry => ({ ...entry })),
    // kind: 'ltx' | 'script' | 'tts'. body: the request body (LTX: JSON with audio_uri). worstUsd: the OpenAI reservation.
    // Returns a ticket whose settle(actual) replaces an OpenAI estimate; throws (nothing is sent) past the cap.
    reserve({ kind, body, worstUsd }) {
      let cost, seconds = null;
      if (kind === 'ltx') {
        try { seconds = probeSeconds(JSON.parse(String(body)).audio_uri); } catch { seconds = null; }
        cost = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds - 1e-9) * ltxUsdPerSecond : ltxWorstUsd;
      } else {
        if (!(worstUsd > 0)) throw new Error('run cap: missing worst-case cost');
        cost = worstUsd;
      }
      cost = usd(cost);
      if (total() + cost > maxUsd + 1e-9) throw new Error(`run cap: ${total().toFixed(2)} + ${cost.toFixed(2)} > ${maxUsd} (--max-usd), ${kind} request not sent`);
      const entry = { kind, usd: cost, ...(seconds !== null ? { seconds: usd(seconds) } : {}), settled: kind === 'ltx' };
      entries.push(entry);
      return { usd: cost, seconds, settle(actual) { if (kind !== 'ltx' && actual >= 0 && Number.isFinite(actual)) { entry.usd = usd(actual); entry.settled = true; } } };
    },
    summary: () => ({ maxUsd, totalUsd: total(), requests: entries.length, ltxSeconds: usd(entries.filter(entry => entry.kind === 'ltx').reduce((sum, entry) => sum + Math.ceil((entry.seconds ?? 0) - 1e-9), 0)) }),
  };
}
