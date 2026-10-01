import { test, expect } from '@playwright/test';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';

const now = Date.UTC(2026, 9, 1);
const sourceSecret = 'synthetic-source-copy-secret-at-least-32';
const targetSecret = 'synthetic-target-copy-secret-at-least-32';
const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
async function fixture() {
  const sourceCookie = await sealGoogleSession(identity('source'), sourceSecret, now);
  const targetCookie = await sealGoogleSession(identity('target'), targetSecret, now);
  return {
    source: { cookie: sourceCookie, secret: sourceSecret }, target: { cookie: targetCookie, secret: targetSecret }, now,
    approval: { sourceOwner: await ownerIdFromSessionCookie(sourceCookie, sourceSecret, now), targetOwner: await ownerIdFromSessionCookie(targetCookie, targetSecret, now), courseId: 'synthetic-party', revision: 1, mediaSha256: 'a'.repeat(64), materialsRevision: 1 },
  };
}
test('T62A copy authorization: two independently verified identities bind exact approved source and material version', async () => {
  const { authorizeLocalCourseCopy } = await import('../../lib/local-course-copy.ts');
  const input = await fixture(), result = await authorizeLocalCourseCopy(input);
  expect(result).toEqual(input.approval);
  expect(JSON.stringify(result)).not.toContain(input.source.cookie);
  expect(JSON.stringify(result)).not.toContain(sourceSecret);
  input.approval.courseId = 'changed';
  expect(result.courseId).toBe('synthetic-party');
});

const invalid = {
  anonymousSource: v => { v.source.cookie = undefined; },
  anonymousTarget: v => { v.target.cookie = undefined; },
  expiredSessions: v => { v.now += 366 * 86400000; },
  forgedTarget: v => { v.target.cookie += 'tampered'; },
  wrongSourceOwner: v => { v.approval.sourceOwner = v.approval.targetOwner; },
  wrongTargetOwner: v => { v.approval.targetOwner = v.approval.sourceOwner; },
  noApproval: v => { delete v.approval; },
  wrongSecret: v => { v.target.secret = sourceSecret; },
  invalidCourse: v => { v.approval.courseId = '../private'; },
  invalidRevision: v => { v.approval.revision = 0; },
  invalidMedia: v => { v.approval.mediaSha256 = 'not-a-hash'; },
  invalidMaterials: v => { v.approval.materialsRevision = 1.5; },
};
for (const [name, change] of Object.entries(invalid)) test(`T62A copy authorization: rejects ${name}`, async () => {
  const { authorizeLocalCourseCopy } = await import('../../lib/local-course-copy.ts');
  expect(typeof authorizeLocalCourseCopy).toBe('function');
  const input = await fixture(); change(input);
  await expect(authorizeLocalCourseCopy(input)).rejects.toThrow();
});
