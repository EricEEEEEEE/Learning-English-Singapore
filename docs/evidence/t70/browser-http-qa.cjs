const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto'), { DatabaseSync } = require('node:sqlite'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { chromium, expect } = require('../../tests/node_modules/@playwright/test');
const { sealGoogleSession, GOOGLE_SESSION_COOKIE } = require('../../lib/google-auth.ts');
const { ownerIdFromSessionCookie } = require('../../lib/private-owner.ts');
const { createGenerationTaskStore } = require('../../lib/generation-tasks.ts');
const { createPrivateMediaStore } = require('../../lib/private-media-store.ts');
const { createLocalCourseLibrary } = require('../../lib/local-course-library.ts');
const { readApprovedCourseCopy } = require('../../lib/local-course-copy.ts');
const { createSceneRequirementStore } = require('../../lib/scene-requirements.ts');
const root = path.resolve(__dirname, '../..'), origin = 'http://localhost:3271', alias = 'http://127.0.0.1:3271';
const secret = 't70-ui-qa-synthetic-session-secret-at-least-32', directory = path.join(root, 'tmp/generation-tasks');
const mediaStore = createPrivateMediaStore({ directory: path.join(directory, 'media'), sessionSecret: secret });
const tasks = createGenerationTaskStore({ directory, sessionSecret: secret, mediaStore });
const copies = createLocalCourseLibrary({ directory, sessionSecret: secret, mediaStore });
const requirements = createSceneRequirementStore({ directory: path.join(root, 'tmp/scene-requirements'), sessionSecret: secret });
const hotelSample = JSON.parse(fs.readFileSync(path.join(root, 'public/media/hotel-course.json'), 'utf8'));
const hotelBytes = fs.readFileSync(path.join(root, 'public/media/hotel-pov-12s.mp4'));
const partySample = JSON.parse(fs.readFileSync(path.join(root, 'outputs/t61-party-multi/course-materials-1.json'), 'utf8'));
const partyBytes = fs.readFileSync(path.join(root, 'outputs/t61-party-multi/automatic-cfr.mp4'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = label => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: `t70-ui-${label}-${randomUUID()}`, email: 'synthetic@example.invalid' });
const token = identity => sealGoogleSession(identity, secret, Date.now());
const install = (context, value) => context.addCookies([{ name: GOOGLE_SESSION_COOKIE, value, url: origin, httpOnly: true, sameSite: 'Lax' }]);
const query = pointer => new URLSearchParams(Object.entries(pointer).map(([key, value]) => [key, String(value)]));
const pointer = task => ({ id: task.id, revision: 2, materialsRevision: 3 });
const result = { realNextDefaultHttp: true, realSQLite: true, syntheticSignedIdentities: true, realGoogleOAuthProved: false, preparedSyntheticTasks: true, reusedExistingGeneratedVideos: true, newGenerationProved: false, checks: {}, screenshots: [] };
const env = { ...process.env, AUTH_SESSION_SECRET: secret, NEXT_TELEMETRY_DISABLED: '1' }; delete env.VERCEL;
const log = fs.createWriteStream(path.join(__dirname, 'server.log'));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3271'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.pipe(log); server.stderr.pipe(log); let browser;
async function ready() {
  for (let i = 0; i < 250; i++) {
    if (server.exitCode !== null) throw Error('Own server exited');
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch { /* Own-server bounded readiness polling. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Own server not ready');
}
async function prepare(cookie, sample, bytes, description, roles) {
  const content = { description, language: 'zh-Hans', keywords: { location: roles[2], learnerRole: roles[0], partnerRole: roles[1], topic: '合成QA复用已有场景', goal: '听懂并回应', special: '不证明新生成' } };
  const task = await tasks.create({ cookie, goal: description, revision: 2, requestKey: randomUUID(), requirement: { revision: 2, content } });
  const assetId = 't70-ui-existing-media', sha256 = sha(bytes);
  await mediaStore.put({ cookie, courseId: task.id, revision: 2, assetId, bytes, sha256 });
  Object.assign(task, { status: 'video_assembled', script: { lines: sample.lines.map(({ id, role, text, translations }) => ({ id, role, text, translations })), phrases: sample.phrases, turns: sample.turns }, finalVideo: { assetId, size: bytes.length, sha256, duration: sample.media.duration, decoded: true, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }, videoTimeline: { duration: sample.media.duration, segments: [], lines: sample.lines.map(({ id, start, end }) => ({ lineId: id, start, end })) } });
  const db = new DatabaseSync(path.join(directory, 'generation.sqlite'), { timeout: 5000 });
  try { expect(db.prepare('UPDATE jobs SET body=? WHERE id=? AND owner=?').run(JSON.stringify(task), task.id, task.ownerId).changes).toBe(1); } finally { db.close(); }
  await tasks.saveLearningMaterials({ cookie, id: task.id, materials: { courseId: task.id, sourceRevision: 2, mediaSha256: sha256, materialsRevision: 3, lineTranslations: task.script.lines.map(line => ({ lineId: line.id, translations: line.translations })), phrases: task.script.phrases } });
  return task;
}
async function getProgress(context, course) { const response = await context.request.get(origin + '/api/scene-progress?' + query(course)); expect(response.status()).toBe(200); return (await response.json()).progress; }
async function putProgress(context, course, position, expectedVersion = 0) { const response = await context.request.put(origin + '/api/scene-progress', { headers: { origin }, data: { course, position, expectedVersion } }); expect(response.status()).toBe(200); return (await response.json()).progress; }
async function openLibrary(page) { await page.getByRole('main').getByRole('button', { name: '我的场景', exact: true }).click(); await expect(page.getByRole('main').getByRole('heading', { name: '我的场景', exact: true })).toBeVisible(); }
async function openItem(main, description) { await main.getByRole('listitem').filter({ hasText: description }).getByRole('button', { name: '继续学习', exact: true }).click(); }
async function media(main) { const video = main.locator('video'); await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2); return video; }
async function screenshot(page, name) { await page.screenshot({ path: path.join(__dirname, name), fullPage: true }); result.screenshots.push(name); }
async function contextFor(cookie, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', serviceWorkers: 'block' }); await install(context, cookie);
  const state = { external: [], writes: [], errors: [], consoleErrors: [] };
  await context.route('**/*', route => { const request = route.request(), url = new URL(request.url()); if (![origin, alias].includes(url.origin)) { state.external.push(url.origin); return route.abort(); } if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) state.writes.push({ method: request.method(), path: url.pathname }); return route.continue(); });
  await context.addInitScript(() => { window.t70QaPlays = 0; window.t70QaEnds = 0; window.t70QaMic = 0; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.t70QaPlays++; return play.call(this); }; document.addEventListener('ended', event => { if (event.target instanceof HTMLVideoElement && event.isTrusted) window.t70QaEnds++; }, true); if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.t70QaMic++; return Promise.reject(new DOMException('Synthetic QA microphone unavailable', 'NotAllowedError')); }; });
  const page = await context.newPage(); page.on('pageerror', error => state.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push({ text: message.text(), url: message.location().url }); });
  return { context, page, main: page.getByRole('main'), state };
}
(async () => {
  try {
    await ready(); browser = await chromium.launch({ headless: true });
    const sourceIdentity = identity('source'), targetIdentity = identity('copy');
    const sourceCookie = await token(sourceIdentity), targetCookie = await token(targetIdentity), otherCookie = await token(identity('other'));
    const hotelDescription = '合成QA：酒店办理入住', partyDescription = '合成QA：孩子生日聚会';
    const hotel = await prepare(sourceCookie, hotelSample, hotelBytes, hotelDescription, ['住客', '酒店前台', '酒店前台']);
    const party = await prepare(sourceCookie, partySample, partyBytes, partyDescription, ['家长', '另一位家长', '生日聚会']);
    for (const [expectedRevision, description] of [[0, '第一版草稿'], [1, hotelDescription], [2, '较新的旅行草稿，不是旧课程背景']]) await requirements.save({ cookie: sourceCookie, expectedRevision, content: { description, language: 'zh-Hans', keywords: { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' } } });
    const now = Date.now(), bundle = await readApprovedCourseCopy({ source: { cookie: sourceCookie, secret }, target: { cookie: targetCookie, secret }, now, approval: { sourceOwner: await ownerIdFromSessionCookie(sourceCookie, secret, now), targetOwner: await ownerIdFromSessionCookie(targetCookie, secret, now), courseId: hotel.id, revision: 2, materialsRevision: 3, mediaSha256: sha(hotelBytes) } }, tasks);
    const copied = await copies.importCopy({ cookie: targetCookie, now, bundle }), copiedPointer = { id: copied.id, revision: 2, materialsRevision: 3 };
    const desktop = await contextFor(sourceCookie, 1440, 900), { context, page, main, state } = desktop;
    await putProgress(context, pointer(hotel), { page: 'watch', time: 1.25, turnIndex: 0 });
    await putProgress(context, pointer(party), { page: 'watch', time: 20.25, turnIndex: 0 });
    await page.goto(origin); await expect(main.getByRole('textbox')).toHaveValue('较新的旅行草稿，不是旧课程背景'); await openLibrary(page); await expect(main.getByRole('listitem')).toHaveCount(2); await screenshot(page, 'desktop-library.png');
    await openItem(main, hotelDescription); let video = await media(main);
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(1.25, 1); await expect(video).toHaveJSProperty('paused', true); expect(state.writes).toEqual([]);
    const naturalStart = Date.now(); await main.getByTestId('scene-replay').click(); await expect.poll(() => video.evaluate(v => v.ended), { timeout: 16000 }).toBe(true);
    const naturalWallMs = Date.now() - naturalStart; expect(naturalWallMs).toBeGreaterThanOrEqual(11000); expect(await page.evaluate(() => window.t70QaEnds)).toBe(1); await expect(main.getByTestId('scene-progress-status')).toContainText('已保存在本机');
    await main.getByRole('button', { name: '进入角色学习', exact: true }).click(); await expect(main.getByTestId('scene-learner-role')).toContainText('住客'); await main.getByRole('button', { name: '开始学词组', exact: true }).click();
    await expect(main.getByTestId('scene-progress-status')).toContainText('已保存在本机');
    let release, committed; const gate = new Promise(resolve => { release = resolve; }), wasCommitted = new Promise(resolve => { committed = resolve; });
    let held = false; const delayAck = async route => { if (route.request().method() !== 'PUT' || held) return route.continue(); held = true; const response = await route.fetch(); committed(); await gate; return route.fulfill({ response }); };
    await page.route('**/api/scene-progress', delayAck);
    try {
      await video.evaluate(v => { v.currentTime = 6.4; }); await main.getByRole('button', { name: '返回我的场景', exact: true }).click(); await wasCommitted;
      await expect(main.getByTestId('scene-back')).toBeDisabled(); await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toHaveCount(0);
      release(); await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
    } finally { release(); await page.unroute('**/api/scene-progress', delayAck); }
    let stored = await getProgress(context, pointer(hotel)); expect(stored.position.page).toBe('terms'); expect(stored.position.time).toBeCloseTo(6.4, 1);
    await openItem(main, hotelDescription); video = await media(main); await expect(main.getByTestId('scene-panel-2')).toBeVisible(); await expect(video).toHaveJSProperty('paused', true); await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(6.4, 1); await screenshot(page, 'desktop-terms.png');
    await main.getByTestId('scene-term').first().getByRole('button').click(); await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true); await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true); await expect(main.getByTestId('scene-progress-status')).toContainText('已保存在本机');
    stored = await getProgress(context, pointer(hotel)); const elsewhere = await putProgress(context, pointer(hotel), { page: 'sentences', time: 7, turnIndex: 0 }, stored.version);
    await video.evaluate(v => { v.currentTime = 4; v.dispatchEvent(new Event('timeupdate')); v.dispatchEvent(new Event('pause')); }); await expect(main.getByTestId('scene-progress-status')).toContainText('其他页面');
    await main.getByRole('button', { name: '重新读取学习位置', exact: true }).click(); await expect(main.getByTestId('scene-panel-3')).toBeVisible(); await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(7, 1); await expect(video).toHaveJSProperty('paused', true); expect(await getProgress(context, pointer(hotel))).toEqual(elsewhere);
    await main.getByRole('button', { name: '返回我的场景', exact: true }).click(); const beforeLong = await page.evaluate(() => window.t70QaPlays); await openItem(main, partyDescription); video = await media(main);
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(20.25, 1); await expect(video).toHaveJSProperty('paused', true); expect(await page.evaluate(() => window.t70QaPlays)).toBe(beforeLong); expect((await getProgress(context, pointer(party))).position.time).toBe(20.25);
    await video.evaluate(v => { v.currentTime = 21; v.dispatchEvent(new Event('timeupdate')); });
    let fail = true; const sessionFailure = route => { if (!fail) return route.continue(); fail = false; return route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } }); };
    await page.route('**/api/auth/session', sessionFailure); await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid'))); await expect(main.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible(); await expect(main.getByTestId('real-scene-course')).toBeHidden(); await page.unroute('**/api/auth/session', sessionFailure);
    await main.getByRole('button', { name: '重新检查登录', exact: true }).click(); await expect(main.getByTestId('scene-progress-status')).toContainText('暂未保存'); await main.getByRole('button', { name: '重试保存', exact: true }).click(); await expect(main.getByTestId('scene-progress-status')).toContainText('已保存在本机'); expect((await getProgress(context, pointer(party))).position.time).toBeCloseTo(21, 1);
    await main.getByRole('button', { name: '返回我的场景', exact: true }).click();
    const beforeBroken = state.writes.length; const broken = route => route.fulfill({ status: 404, headers: { 'cache-control': 'private, no-store' }, body: '' }); await page.route('**/api/generated-course-media*', broken);
    await openItem(main, hotelDescription); await expect(main.getByRole('alert')).toBeVisible(); await expect(main.getByTestId('scene-progress-status')).toContainText('暂停'); await main.getByRole('button', { name: '返回我的场景', exact: true }).click();
    expect(state.writes.length).toBe(beforeBroken); expect(await getProgress(context, pointer(hotel))).toEqual(elsewhere); await page.unroute('**/api/generated-course-media*', broken);
    await context.clearCookies(); await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid'))); await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
    await install(context, await token(sourceIdentity)); await page.goto(origin); await openLibrary(page); await openItem(main, partyDescription); video = await media(main); await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(21, 1); await expect(video).toHaveJSProperty('paused', true);
    await install(context, otherCookie); await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid'))); await expect(main.getByRole('textbox')).toBeVisible(); await expect(main.locator('video')).toHaveCount(0); await openLibrary(page); await expect(main.getByText('这里还没有可学习的场景。', { exact: true })).toBeVisible();
    expect((await context.request.get(origin + '/api/scene-progress?' + query(pointer(hotel)))).status()).toBe(404); expect((await context.request.get(origin + `/api/generated-course-media?id=${hotel.id}&revision=2`)).status()).toBe(404);
    result.checks.desktop = { viewport: [1440, 900], dpr: 2, naturalHotelEnded: true, naturalWallMs, finalFlushAwaited: true, clipConflictRestoreTime: 7, longCourseDuration: partySample.media.duration, longRestoreTime: 20.25, queuedSessionFailureThenSaved: 21, brokenMediaPreservesOldPosition: true, sameSyntheticIdentityNewCookieRestores: true, otherOwnerDenied: 404 };
    const mobile = await contextFor(targetCookie, 320, 740), mobileMain = mobile.main; await mobile.page.goto(origin); await openLibrary(mobile.page); await mobileMain.getByRole('button', { name: '继续学习', exact: true }).click(); await media(mobileMain);
    await mobileMain.getByRole('button', { name: '进入角色学习', exact: true }).click(); await expect(mobileMain).toContainText('角色背景未记录'); await mobileMain.getByRole('button', { name: '开始学词组', exact: true }).click(); await mobileMain.getByRole('button', { name: '下一步：句子', exact: true }).click(); await mobileMain.getByRole('button', { name: '下一步：提示接话', exact: true }).click(); const mobileVideo = await media(mobileMain);
    await expect.poll(() => mobileVideo.evaluate(v => !v.paused)).toBe(true); await expect.poll(() => mobileVideo.evaluate(v => v.paused), { timeout: 5000 }).toBe(true); await expect(mobileMain.getByTestId('scene-progress-status')).toContainText('已保存在本机'); await mobileMain.getByRole('button', { name: '返回我的场景', exact: true }).click();
    await mobile.page.reload(); await openLibrary(mobile.page); await mobileMain.getByRole('button', { name: '继续学习', exact: true }).click(); await expect(mobileMain.getByTestId('scene-panel-4')).toBeVisible(); await expect(await media(mobileMain)).toHaveJSProperty('paused', true); expect(await mobile.page.evaluate(() => window.t70QaPlays)).toBe(0); await screenshot(mobile.page, 'mobile-prompt.png');
    expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const copyMedia = await mobile.context.request.get(origin + `/api/generated-course-media?id=${copied.id}&revision=2`); expect(copyMedia.status()).toBe(200); expect(sha(await copyMedia.body())).toBe(sha(hotelBytes));
    const copyRange = await mobile.context.request.get(origin + `/api/generated-course-media?id=${copied.id}&revision=2`, { headers: { range: 'bytes=0-31' } }); expect(copyRange.status()).toBe(206); expect(await copyRange.body()).toEqual(hotelBytes.subarray(0, 32));
    result.checks.mobile = { viewport: [320, 740], dpr: 2, approvedSyntheticCopy: true, neutralRole: true, promptRestoredPausedAfterReload: true, mediaShaMatchesSource: true, range: 206, progress: (await getProgress(mobile.context, copiedPointer)).position };
    for (const item of [desktop, mobile]) { expect(item.state.external).toEqual([]); expect(item.state.errors).toEqual([]); for (const write of item.state.writes) expect(write).toEqual({ method: 'PUT', path: '/api/scene-progress' }); expect(await item.page.evaluate(() => window.t70QaMic)).toBe(0); }
    for (const task of [hotel, party]) { const storedTask = await tasks.get({ cookie: sourceCookie, id: task.id }); expect(storedTask.providerCalls).toBe(0); expect(storedTask.reservedMicros).toBe(0); }
    result.modelCallsOnPreparedTasks = 0; result.reservedMicrosOnPreparedTasks = 0; result.browserWrites = desktop.state.writes.length + mobile.state.writes.length; result.externalRequests = 0; result.microphoneCalls = 0; result.consoleErrors = [...desktop.state.consoleErrors, ...mobile.state.consoleErrors];
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); await context.close(); await mobile.context.close();
  } finally { if (browser) await browser.close(); if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); } log.end(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
