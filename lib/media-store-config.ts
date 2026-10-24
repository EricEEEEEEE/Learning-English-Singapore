import { createPrivateMediaStore } from './private-media-store';
import { createObjectMediaStore } from './object-media-store';

// C16-4 (2026-10-24, zero cost; T62 engineering only, nothing deployed): where course media lives. Without
// LES_MEDIA_STORE (or with "local") it is the local private folder, as before. With LES_MEDIA_STORE=object it is an
// S3-compatible bucket; every LES_MEDIA_S3_* variable is then required, and a missing one stops the server at once
// (the message names the missing variables, never a value). The course database stays local SQLite either way.
export type PrivateMediaStore = ReturnType<typeof createPrivateMediaStore>;
type Env = Record<string, string | undefined>;
const OBJECT_VARIABLES = ['LES_MEDIA_S3_ENDPOINT', 'LES_MEDIA_S3_BUCKET', 'LES_MEDIA_S3_REGION', 'LES_MEDIA_S3_ACCESS_KEY_ID', 'LES_MEDIA_S3_SECRET_ACCESS_KEY'] as const;

export function mediaStoreKind(env: Env = process.env): 'local' | 'object' {
  const kind = env.LES_MEDIA_STORE;
  if (kind === undefined || kind === '' || kind === 'local') return 'local';
  if (kind === 'object') return 'object';
  throw new Error('LES_MEDIA_STORE must be "local" or "object"');
}

export function createMediaStore({ directory, sessionSecret, env = process.env }: { directory: string; sessionSecret: string; env?: Env }): PrivateMediaStore {
  if (mediaStoreKind(env) === 'local') return createPrivateMediaStore({ directory, sessionSecret });
  const missing = OBJECT_VARIABLES.filter(name => !env[name]);
  if (missing.length) throw new Error(`Object media store configuration incomplete: ${missing.join(', ')}`);
  return createObjectMediaStore({
    endpoint: env.LES_MEDIA_S3_ENDPOINT!, bucket: env.LES_MEDIA_S3_BUCKET!, region: env.LES_MEDIA_S3_REGION!,
    accessKeyId: env.LES_MEDIA_S3_ACCESS_KEY_ID!, secretAccessKey: env.LES_MEDIA_S3_SECRET_ACCESS_KEY!, sessionSecret,
  });
}
