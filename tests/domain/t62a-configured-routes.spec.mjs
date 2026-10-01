import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';

const now = Date.now();
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


async function configuredFixture(work) {
 const {createLocalCourseLibrary}=await import('../../lib/local-course-library.ts');
 const {createPrivateMediaStore}=await import('../../lib/private-media-store.ts');
 const {readApprovedCourseCopy}=await import('../../lib/local-course-copy.ts');
 const tasks=await import('../../app/api/generation-tasks/route.ts');
 const courses=await import('../../app/api/generated-courses/route.ts');
 const videos=await import('../../app/api/generated-course-media/route.ts');
 const c=await sourceFixture(), root=await mkdtemp(join(tmpdir(),'les-default-copy-'));
 const directory=join(root,'tmp','generation-tasks');
 const library=createLocalCourseLibrary({directory,sessionSecret:targetSecret,mediaStore:createPrivateMediaStore({directory:join(directory,'media'),sessionSecret:targetSecret})});
 const copy=await library.importCopy({cookie:c.input.target.cookie,now,bundle:await readApprovedCourseCopy(c.input,c.sourceStore)});
 const cwd=process.cwd(), previous=process.env.AUTH_SESSION_SECRET, vercel=process.env.VERCEL;
 try {
  process.chdir(root);process.env.AUTH_SESSION_SECRET=targetSecret;delete process.env.VERCEL;
  const request=(path,cookie=c.input.target.cookie,headers={})=>new Request('http://localhost'+path,{headers:{...(cookie?{cookie:GOOGLE_SESSION_COOKIE+'='+cookie}:{}),...headers}});
  await work({tasks,courses,videos,c,copy,request});
 } finally {
  process.chdir(cwd);
  if(previous===undefined)delete process.env.AUTH_SESSION_SECRET;else process.env.AUTH_SESSION_SECRET=previous;
  if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel;
 }
}

test('T62A configured routes: default task list exposes saved copy and selected version with a usable label',async()=>{
 await configuredFixture(async({tasks,copy,request})=>{
  const response=await tasks.GET(request('/api/generation-tasks'));
  expect(response.status).toBe(200);
  const rows=(await response.json()).tasks;
  const row=rows.find(r=>r.id===copy.id);
  expect(row).toMatchObject({id:copy.id,revision:1,materialsRevision:1,status:'video_assembled',simulation:false,providerCalls:0});
  expect(typeof row.goal).toBe('string');expect(row.goal.trim().length).toBeGreaterThan(0);
  expect(row).not.toHaveProperty('lines');
  const single=await tasks.GET(request('/api/generation-tasks?id='+copy.id));
  expect(single.status).toBe(200);expect(await single.json()).toEqual(row);
 });
});

test('T62A configured routes: saved copy course and video range use default storage without injected handlers',async()=>{
 await configuredFixture(async({courses,videos,copy,c,request})=>{
  const course=await courses.GET(request('/api/generated-courses?id='+copy.id+'&revision=1&materialsRevision=1'));
  expect(course.status).toBe(200);expect(await course.json()).toEqual(copy);
  const media=await videos.GET(request('/api/generated-course-media?id='+copy.id+'&revision=1',undefined,{range:'bytes=0-3'}));
  expect(media.status).toBe(206);expect(Buffer.from(await media.arrayBuffer())).toEqual(Buffer.from(c.media.bytes.subarray(0,4)));
  expect(media.headers.get('cache-control')).toContain('no-store');
 });
});

test('T62A configured routes: other account and wrong material version cannot read copied course',async()=>{
 await configuredFixture(async({tasks,courses,videos,copy,request})=>{
  const other=await sealGoogleSession(identity('other'),targetSecret,now);
  const list=await tasks.GET(request('/api/generation-tasks',other));
  expect(list.status).toBe(200);expect((await list.json()).tasks).toEqual([]);
  for(const [reader,path] of [[courses,'/api/generated-courses?id='+copy.id+'&revision=1&materialsRevision=1'],[videos,'/api/generated-course-media?id='+copy.id+'&revision=1']]) {
   expect((await reader.GET(request(path,other))).status).toBe(404);
   expect((await reader.GET(request(path,null))).status).toBe(401);
  }
  expect((await courses.GET(request('/api/generated-courses?id='+copy.id+'&revision=1&materialsRevision=2'))).status).toBe(404);
 });
});
