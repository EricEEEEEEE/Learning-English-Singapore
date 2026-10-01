import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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


async function targetFixture(failMedia=false) {
 const {readApprovedCourseCopy}=await import('../../lib/local-course-copy.ts');
 const {createLocalCourseLibrary}=await import('../../lib/local-course-library.ts');
 const {createPrivateMediaStore}=await import('../../lib/private-media-store.ts');
 const c=await sourceFixture(),bundle=await readApprovedCourseCopy(c.input,c.sourceStore);
 const directory=await mkdtemp(join(tmpdir(),'les-copy-target-'));
 const media=createPrivateMediaStore({directory:join(directory,'media'),sessionSecret:targetSecret});
 const options={directory,sessionSecret:targetSecret,mediaStore:failMedia?{...media,put:async()=>{throw Error('synthetic disk failure')}}:media};
 const open=()=>createLocalCourseLibrary(options);
 return {c,bundle,media,open,library:open(),session:{cookie:c.input.target.cookie,now}};
}

test('T62A target library: publishes private copy only after media saved, persists and deduplicates exact retry',async()=>{
 const t=await targetFixture();const before=structuredClone(t.bundle);
 const copied=await t.library.importCopy({...t.session,bundle:t.bundle});
 expect(copied.id).not.toBe(t.bundle.course.id);
 expect(copied.media.sha256).toBe(t.bundle.course.media.sha256);
 expect(copied.lines).toEqual(t.bundle.course.lines);
 expect(copied.phrases).toEqual(t.bundle.course.phrases);
 const read=await t.open().getCourse({...t.session,id:copied.id,revision:1,materialsRevision:1});
 expect(read).toEqual(copied);
 expect(await t.open().importCopy({...t.session,bundle:t.bundle})).toEqual(copied);
 expect(await t.open().list(t.session)).toHaveLength(1);
 const asset=await t.media.get({...t.session,courseId:copied.id,revision:1,assetId:copied.media.assetId});
 expect(Buffer.from(asset.bytes)).toEqual(Buffer.from(t.bundle.media.bytes));
 expect(t.bundle).toEqual(before);
});

test('T62A target library: invalid target and another account cannot import or read a copy',async()=>{
 const t=await targetFixture();const copy=await t.library.importCopy({...t.session,bundle:t.bundle});
 const other=await sealGoogleSession(identity('unrelated-target'),targetSecret,now);
 for(const cookie of [undefined,other]){
   await expect(t.open().importCopy({cookie,now,bundle:t.bundle})).rejects.toThrow();
   await expect(t.open().getCourse({cookie,now,id:copy.id,revision:1,materialsRevision:1})).rejects.toThrow();
 }
 expect(await t.open().list({cookie:other,now})).toEqual([]);
});

test('T62A target library: media failure never publishes a course',async()=>{
 const t=await targetFixture(true);
 await expect(t.library.importCopy({...t.session,bundle:t.bundle})).rejects.toThrow('synthetic disk failure');
 expect(await t.open().list(t.session)).toEqual([]);
});

test('T62A target library: conflicting content for same approved source cannot replace a saved copy',async()=>{
 const t=await targetFixture();const copy=await t.library.importCopy({...t.session,bundle:t.bundle});
 const changed=structuredClone(t.bundle);changed.course.lines[0].translations['zh-Hans']='different';
 await expect(t.open().importCopy({...t.session,bundle:changed})).rejects.toThrow();
 expect(await t.open().getCourse({...t.session,id:copy.id,revision:1,materialsRevision:1})).toEqual(copy);
 expect(await t.open().list(t.session)).toHaveLength(1);
});
