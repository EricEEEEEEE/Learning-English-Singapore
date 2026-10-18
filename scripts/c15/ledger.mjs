// C15 paid-check ledger (user 2026-10-18 11:53 UTC: C15 kept on its own books; C15-1 <= USD0.5, C15-2 reserve <= USD0.9,
// C15-3 < USD0.1). Before each paid request the worst-case cost is reserved; reserved-in-flight plus settled may never
// pass the item's cap. A failed or unknown request keeps its whole reservation as spent and is never retried.
// The ledger file lives outside the repo (default /mnt/project-files/les-c15/ledger.json) and holds no keys or content.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Standard-tier prices in USD per 1M tokens, read from https://platform.openai.com/docs/pricing on 2026-10-18.
export const PRICES = {
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4o-mini-tts': { textInput: 0.60, audioOutput: 12.00, perMinute: 0.015 },
  // The page lists 1.25 / 5 per 1M tokens and about USD0.003 a minute; audio input is booked at the older, higher 3.00.
  'gpt-4o-mini-transcribe': { audioInput: 3.00, textInput: 1.25, output: 5.00, perMinute: 0.003 },
};
export const CAPS = { 'C15-1': 0.5, 'C15-2': 0.9, 'C15-3': 0.1 };

export function openLedger(path = process.env.LES_C15_LEDGER ?? '/mnt/project-files/les-c15/ledger.json') {
  mkdirSync(dirname(path), { recursive: true });
  const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { entries: [] };
  const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
  const total = item => state.entries.filter(e => e.item === item).reduce((sum, e) => sum + (e.status === 'settled' ? e.actual : e.reserved), 0);
  return {
    total,
    // Throws (and so stops the run) when the reservation would pass the cap.
    reserve(item, label, usd) {
      const cap = CAPS[item];
      if (!(cap > 0) || !(usd > 0)) throw new Error('bad reservation');
      if (total(item) + usd > cap) throw new Error(`${item} cap reached: ${total(item).toFixed(6)} + ${usd.toFixed(6)} > ${cap}`);
      const entry = { item, label, reserved: usd, actual: null, status: 'reserved', at: new Date().toISOString() };
      state.entries.push(entry); save();
      return {
        settle(actual, usage) { entry.actual = actual; entry.usage = usage ?? null; entry.status = 'settled'; save(); },
        unknown(reason) { entry.status = 'unknown'; entry.reason = String(reason).slice(0, 200); save(); },
      };
    },
    entries: item => state.entries.filter(e => e.item === item),
  };
}

export const responseCost = (model, usage) => (usage.input_tokens * PRICES[model].input + usage.output_tokens * PRICES[model].output) / 1e6;
// Worst case for one Responses request: every serialized character counted as a token (real ratio is about 1/4).
export const responseReserve = (model, bodyChars, maxOutput) => (bodyChars * PRICES[model].input + maxOutput * PRICES[model].output) / 1e6;

// Wraps fetch so the repo's own provider code runs unchanged while each Responses call's usage and raw output are kept.
export function capturingFetch() {
  const calls = [];
  const send = async (url, init) => {
    const call = { url: String(url), bodyChars: typeof init?.body === 'string' ? init.body.length : 0 };
    calls.push(call);
    const response = await fetch(url, init);
    call.status = response.status;
    try {
      const json = await response.clone().json();
      call.usage = json.usage ?? null; call.responseStatus = json.status ?? null; call.incomplete = json.incomplete_details ?? null;
      call.outputText = (json.output ?? []).flatMap(item => item.content ?? []).filter(c => c.type === 'output_text').map(c => c.text).join('');
    } catch { call.usage = null; }
    return response;
  };
  return { send, calls };
}
