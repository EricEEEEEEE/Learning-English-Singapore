import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

type Options = { allowedHosts: string[]; maxBytes: number; fetch?: typeof fetch };

// Internal downloader. The runner, never browser input, selects trusted provider hosts.
// DNS/network policy and media probing are separate prerequisites for live integration.
export async function downloadGeneratedMedia(source: string, options: Options): Promise<{ bytes: Uint8Array; sha256: string }> {
  let url: URL;
  try { url = new URL(source); } catch { throw new Error('Invalid media source'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (source.length > 8192 || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || isIP(host) || host === 'localhost' || host.endsWith('.localhost') || !Array.isArray(options.allowedHosts) || !options.allowedHosts.includes(url.hostname)) throw new Error('Media source not allowed');
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 || options.maxBytes > 100_000_000) throw new Error('Invalid download limit');
  try {
    const response = await (options.fetch ?? fetch)(source, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(30_000),
      headers: { 'Accept-Encoding': 'identity' },
    });
    if (response.status !== 200 || !response.body || response.redirected) {
      await response.body?.cancel();
      throw new Error('Download response rejected');
    }
    const encoding = response.headers.get('Content-Encoding');
    const length = response.headers.get('Content-Length');
    // Node fetch decompresses responses. Reject encoding rather than compare incompatible lengths.
    if (encoding && encoding.toLowerCase() !== 'identity') { await response.body.cancel(); throw new Error('Encoded download unsupported'); }
    const expected = length === null ? undefined : Number(length);
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(expected) || expected! <= 0 || expected! > options.maxBytes)) { await response.body.cancel(); throw new Error('Invalid response length'); }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.length;
        if (size > options.maxBytes || (expected !== undefined && size > expected)) { await reader.cancel(); throw new Error('Download exceeds limit'); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
    if (!size || (expected !== undefined && size !== expected)) throw new Error('Incomplete download');
    const bytes = Buffer.concat(chunks, size);
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    // Signed URLs and upstream error bodies must not escape into logs or user-visible errors.
    throw new Error('Media download failed');
  }
}
