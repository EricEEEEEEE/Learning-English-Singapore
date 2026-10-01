import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
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

async function sourceFixture() {
  const input = await fixture(), bytes = Buffer.from('synthetic verified media');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  input.approval.mediaSha256 = sha256;
  const course = { id: 'synthetic-party', revision: 1, materialsRevision: 1, source: 'ai-generated', media: { courseId: 'synthetic-party', revision: 1, assetId: 'final', sha256, duration: 4 },
    lines: [{ id: 'a', role: 'partner', text: 'Hello.', start: 0, end: 2, revision: 1, translations: { 'zh-Hans': '你好', id: 'Halo', ja: 'こんにちは', ko: '안녕하세요', hi: 'नमस्ते' } },
      { id: 'b', role: 'learner', text: 'Hi.', start: 2, end: 4, revision: 1, translations: { 'zh-Hans': '你好', id: 'Halo', ja: 'こんにちは', ko: '안녕하세요', hi: 'नमस्ते' } }],
    phrases: [{id:'p',text:'Hello',lineId:'a',translations:{'zh-Hans':'你好',id:'Halo',ja:'こんにちは',ko:'안녕하세요',hi:'नमस्ते'}}], turns:[{partnerLineId:'a',learnerLineId:'b'}] };
  const media = { courseId: course.id, revision: 1, assetId: 'final', sha256, size: bytes.length, bytes };
  const calls = [];
  const sourceStore = {
    getCourse: async request => { calls.push(['course',request]); return course; },
    getCourseMedia: async request => { calls.push(['media',request]); return media; },
  };
  return { input, course, media, sourceStore, calls };
}

test('T62A copy source: reads exact approved source through owner session and snapshots checked materials and bytes', async () => {
  const { readApprovedCourseCopy } = await import('../../lib/local-course-copy.ts');
  expect(typeof readApprovedCourseCopy).toBe('function');
  const c = await sourceFixture();
  const bundle = await readApprovedCourseCopy(c.input, c.sourceStore);
  expect(c.calls).toEqual([
    ['course',{cookie:c.input.source.cookie,now,id:'synthetic-party',revision:1,materialsRevision:1}],
    ['media',{cookie:c.input.source.cookie,now,id:'synthetic-party',revision:1}],
  ]);
  expect(bundle.approval).toEqual(c.input.approval);
  expect(bundle.course).toEqual(c.course);
  expect(Buffer.from(bundle.media.bytes)).toEqual(c.media.bytes);
  c.media.bytes.fill(0);c.course.lines[0].text='changed';
  expect(Buffer.from(bundle.media.bytes).toString()).toBe('synthetic verified media');
  expect(bundle.course.lines[0].text).toBe('Hello.');
  expect(JSON.stringify(bundle)).not.toContain(c.input.source.cookie);
});

const broken = {
  wrongCourse:c=>{c.course.id='other';}, wrongRevision:c=>{c.course.revision=2;},
  wrongMaterials:c=>{c.course.materialsRevision=2;}, wrongMediaHash:c=>{c.media.sha256='b'.repeat(64);},
  wrongMediaOwnerLocator:c=>{c.media.courseId='other';}, wrongAsset:c=>{c.media.assetId='other';},
  corruptedBytes:c=>{c.media.bytes[0]=0;}, wrongSize:c=>{c.media.size++;},
  missingTranslation:c=>{delete c.course.lines[0].translations.hi;},
  missingSource:c=>{c.sourceStore.getCourse=async()=>{throw Error('Course unavailable');};},
};
for(const [name,change] of Object.entries(broken))test(`T62A copy source: rejects ${name} before returning any copy bundle`,async()=>{
  const {readApprovedCourseCopy}=await import('../../lib/local-course-copy.ts');
  expect(typeof readApprovedCourseCopy).toBe('function');
  const c=await sourceFixture();change(c);
  await expect(readApprovedCourseCopy(c.input,c.sourceStore)).rejects.toThrow();
});

test('T62A copy source: invalid target never even reads source data',async()=>{
 const {readApprovedCourseCopy}=await import('../../lib/local-course-copy.ts');
 expect(typeof readApprovedCourseCopy).toBe('function');
 const c=await sourceFixture();c.input.target.cookie=undefined;
 await expect(readApprovedCourseCopy(c.input,c.sourceStore)).rejects.toThrow();
 expect(c.calls).toEqual([]);
});
