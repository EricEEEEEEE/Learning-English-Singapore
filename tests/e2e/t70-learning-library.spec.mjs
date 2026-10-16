import { test, expect } from '@playwright/test';
import { setupLearning, openLibrary, openCourse, waitVideo, seek, progressRecord, coursePointer, key, ownerA, ownerB, sceneTitle, savedStatus, noPreviousProgress, noGeneration, stallBody, observeApi } from '../fixtures/t70-learning-browser.mjs';

test.use({ locale: 'zh-CN' });

test('T70 / K6: my scenes is a secondary action and visiting it preserves the unsaved scenario draft', async ({ page, context, baseURL }) => {
  const { state, main, record } = await setupLearning(page, context, baseURL);
  await page.goto('/'); const input = main.getByRole('textbox', { name: sceneTitle, exact: true });
  await input.fill('我自己的未保存生日聚会草稿'); expect(state.catalogueReads).toEqual([]);
  await main.getByRole('button', { name: '我的场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
  await expect(main.getByRole('listitem')).toHaveCount(1); await expect(main.getByRole('listitem')).toContainText(record.content.description);
  await expect(main).toContainText('本机'); await expect(main.getByRole('link', { name: 'Google', exact: true })).toHaveCount(0);
  await main.getByRole('button', { name: '返回场景输入', exact: true }).click(); await expect(input).toHaveValue('我自己的未保存生日聚会草稿');
  noGeneration(state);
});

test('T70 / K6: catalogue errors and unreadable entries are visible rather than an invented empty library', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); state.catalogueStatus = 503;
  await openLibrary(page); await expect(main.getByRole('alert')).toContainText('重试');
  await expect(main.getByText('这里还没有可学习的场景。', { exact: true })).toHaveCount(0);
  state.catalogueStatus = 200; state.unavailable = 1;
  await main.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(main.getByRole('listitem')).toHaveCount(1); await expect(main).toContainText('有 1 个场景暂时无法读取');
  state.scenes[ownerA] = []; state.unavailable = 0;
  await main.getByRole('button', { name: '返回场景输入', exact: true }).click(); await main.getByRole('button', { name: '我的场景', exact: true }).click();
  await expect(main.getByText('这里还没有可学习的场景。', { exact: true })).toBeVisible(); noGeneration(state);
});

test('T70 / K6: all five helper languages can list open and leave and report catalogue or progress failures', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL);
  const copies = [
    ['zh-Hans', '我的场景', '继续学习', '返回我的场景', '返回场景输入', '重试加载', '暂时无法加载我的场景，请重试。', '学习位置暂时无法读取，可继续临时学习。'],
    ['id', 'Situasi saya', 'Lanjut belajar', 'Kembali ke situasi saya', 'Kembali ke masukan situasi', 'Muat ulang', 'Situasi saya belum dapat dimuat. Coba lagi.', 'Posisi belajar belum dapat dibaca. Anda masih dapat belajar sementara.'],
    ['ja', '自分の場面', '学習を続ける', '自分の場面に戻る', '場面の入力に戻る', 'もう一度読み込む', '場面を読み込めません。もう一度お試しください。', '学習位置を読み込めません。一時的に学習を続けられます。'],
    ['ko', '내 상황', '학습 계속', '내 상황으로 돌아가기', '상황 입력으로 돌아가기', '다시 불러오기', '내 상황을 불러올 수 없어요. 다시 시도해 주세요.', '학습 위치를 불러올 수 없어요. 임시로 학습을 계속할 수 있어요.'],
    ['hi', 'मेरे दृश्य', 'सीखना जारी रखें', 'मेरे दृश्यों पर लौटें', 'दृश्य के विवरण पर लौटें', 'फिर लोड करें', 'मेरे दृश्य लोड नहीं हो सके। फिर कोशिश करें।', 'सीखने की स्थिति नहीं पढ़ी जा सकी। आप अभी अस्थायी रूप से सीख सकते हैं।'],
  ];
  await page.goto('/'); await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  for (const [language, library, learn, back, input, retry, listError, progressError] of copies) {
    state.catalogueStatus = 503; state.progressReadStatus = 503;
    await page.getByRole('combobox').selectOption(language); await main.getByRole('button', { name: library, exact: true }).click();
    await expect(main.getByRole('heading', { name: library, exact: true })).toBeVisible(); await expect(main.getByRole('alert')).toHaveText(listError);
    state.catalogueStatus = 200; await main.getByRole('button', { name: retry, exact: true }).click(); await main.getByRole('button', { name: learn, exact: true }).click();
    await expect(main.getByTestId('scene-play')).toBeVisible(); await expect(savedStatus(main)).toHaveText(progressError); await main.getByRole('button', { name: back, exact: true }).click();
    await main.getByRole('button', { name: input, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  }
  noGeneration(state); expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  expect(state.progressWrites).toEqual([]);
});

test('T70 / K6: watch position restores from the exact course and materials paused across refresh', async ({ page, context, baseURL }) => {
  const previous = progressRecord(), { state, main } = await setupLearning(page, context, baseURL, { progress: previous });
  await openLibrary(page); await openCourse(main); let video = await waitVideo(main);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(1.25, 1); await expect(video).toHaveJSProperty('paused', true);
  await expect(main.getByTestId('scene-caption')).toHaveText('Hello. Checking in?');
  await expect(savedStatus(main)).toContainText('暂停'); expect(state.progressWrites).toEqual([]);
  await seek(video, 6.4); await expect.poll(() => state.progress[key(ownerA)]?.position.time).toBeCloseTo(6.4, 1);
  await expect(savedStatus(main)).toContainText('已保存在本机');
  await page.reload(); await main.getByRole('button', { name: '我的场景', exact: true }).click(); await openCourse(main); video = await waitVideo(main);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(6.4, 1); await expect(video).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => window.t70PlayCalls)).toBe(0); expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  for (const pointer of state.courseReads) expect(pointer).toEqual(coursePointer);
  for (const read of state.progressReads) expect(read.course).toEqual(coursePointer); noGeneration(state);
});

test('T70 / K6: each learning page and the second turn restore without automatic partner speech', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { extraTurn: true });
  for (const [positionPage, target] of [['role', 'role'], ['terms', 'scene-panel-2'], ['sentences', 'scene-panel-3'], ['prompt', 'scene-panel-4']]) {
    state.progress[key(ownerA)] = progressRecord({ page: positionPage, time: 8.2, turnIndex: positionPage === 'prompt' ? 1 : 0 });
    await openLibrary(page); await openCourse(main);
    if (target === 'role') {
      await expect(main.getByRole('heading', { name: '现在轮到你', exact: true })).toBeVisible();
      await expect(main.getByTestId('scene-learner-role')).toContainText('住客'); await expect(main).not.toContainText('新草稿中的导游');
    } else await expect(main.getByTestId(target)).toBeVisible();
    const video = await waitVideo(main); await expect(video).toHaveJSProperty('paused', true); await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(8.2, 1);
    if (positionPage === 'prompt') { await expect(main.getByTestId('scene-partner')).toHaveText('May I see your ID?'); await expect(main.getByTestId('scene-answer')).toHaveText('Here it is.'); }
    expect(await page.evaluate(() => window.t70PlayCalls)).toBe(0); expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  }
  expect(state.progressWrites).toEqual([]); noGeneration(state);
});

test('T70 / K6: explicit role learning saves each page and only explicit prompted entry starts the partner', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); await waitVideo(main);
  await noPreviousProgress(main);
  for (const [button, positionPage] of [['进入角色学习', 'role'], ['开始学词组', 'terms'], ['下一步：句子', 'sentences'], ['下一步：提示接话', 'prompt']]) {
    await main.getByRole('button', { name: button, exact: true }).click(); await expect.poll(() => state.progress[key(ownerA)]?.position.page).toBe(positionPage);
  }
  await expect.poll(() => page.evaluate(() => window.t70PlayCalls)).toBe(1);
  await page.getByRole('combobox').selectOption('ko'); await expect(main.getByTestId('scene-panel-4')).toBeVisible();
  await expect(main.getByTestId('scene-answer')).toHaveText('Yes. I booked a room.');
  await expect.poll(() => state.progress[key(ownerA)]?.position.page).toBe('prompt');
  for (const write of state.progressWrites) {
    expect(Object.keys(write.body).sort()).toEqual(['course', 'expectedVersion', 'position']); expect(write.body.course).toEqual(coursePointer);
    expect(Object.keys(write.body.position).sort()).toEqual(['page', 'time', 'turnIndex']);
  }
  noGeneration(state);
});

test('T70 / K6: an unread progress record never overwrites the previous position with defaults and can be read again', async ({ page, context, baseURL }) => {
  const previous = progressRecord({ page: 'sentences', time: 6.4, turnIndex: 0 });
  const { state, main } = await setupLearning(page, context, baseURL, { progress: previous }); state.progressReadStatus = 503;
  await openLibrary(page); await openCourse(main); await expect(savedStatus(main)).toContainText('临时学习');
  await expect(main.getByTestId('scene-play')).toBeVisible(); await main.getByRole('button', { name: '进入角色学习', exact: true }).click();
  await main.getByRole('button', { name: '开始学词组', exact: true }).click();
  expect(state.progressWrites).toEqual([]); expect(state.progress[key(ownerA)]).toEqual(previous);
  state.progressReadStatus = 200; await main.getByRole('button', { name: '重试读取', exact: true }).click();
  await expect(main.getByTestId('scene-panel-3')).toBeVisible(); await expect(savedStatus(main)).toContainText('暂停');
  expect(state.progressWrites).toEqual([]); noGeneration(state);
});

test('T70 / K6: pending restoration may allow temporary learning but cannot save a guessed version', async ({ page, context, baseURL }) => {
  const previous = progressRecord(), { state, main } = await setupLearning(page, context, baseURL, { progress: previous });
  let release; state.progressReadGates[ownerA] = new Promise(resolve => { release = resolve; });
  try {
    await openLibrary(page); await openCourse(main); await expect.poll(() => state.progressReads.length).toBe(1);
    await expect(savedStatus(main)).toContainText('恢复'); expect(state.progressWrites).toEqual([]); expect(state.progress[key(ownerA)]).toEqual(previous);
    release(); await expect(savedStatus(main)).toContainText('暂停'); expect(state.progressWrites).toEqual([]);
  } finally { release(); }
});

test('T70 / K6: malformed or mismatched progress cannot restore or become writable as an empty record', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL);
  const cases = [
    value => { value.course.id = 'unrelated-course'; }, value => { value.course.revision = 99; },
    value => { value.course.materialsRevision = 4; }, value => { value.course.mediaSha256 = 'b'.repeat(64); },
    value => { value.position.time = 100; }, value => { value.position.page = 'invented'; },
    value => { value.position.turnIndex = 99; }, value => { value.version = 0; },
  ];
  for (const mutate of cases) {
    const invalid = progressRecord(); mutate(invalid); state.progress[key(ownerA)] = invalid;
    await openLibrary(page); await openCourse(main); await expect(savedStatus(main)).toContainText('临时学习');
    await expect(main.getByTestId('scene-panel-4')).toHaveCount(0); expect(state.progressWrites).toEqual([]); expect(state.progress[key(ownerA)]).toEqual(invalid);
  }
  noGeneration(state);
});

test('T70 / K6: frequent media positions are coalesced behind one in-flight save and retain the newest explicit page', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); const video = await waitVideo(main);
  await noPreviousProgress(main); await expect.poll(() => state.progressReads.length).toBe(1);
  let release; state.progressAckGates[ownerA] = new Promise(resolve => { release = resolve; });
  try {
    await seek(video, 1); await expect.poll(() => state.progressWrites.length).toBe(1);
    for (const time of [2, 3, 4, 5]) await seek(video, time);
    await main.getByRole('button', { name: '进入角色学习', exact: true }).click();
    await main.getByRole('button', { name: '开始学词组', exact: true }).click();
    expect(state.progressWrites).toHaveLength(1); expect(state.maxActiveWrites).toBe(1); await expect(savedStatus(main)).not.toContainText('已保存在本机');
    release(); await expect(savedStatus(main)).toContainText('已保存在本机');
    await expect.poll(() => state.progress[key(ownerA)]?.position.page).toBe('terms');
    expect(state.progress[key(ownerA)].position.time).toBeCloseTo(5, 1); expect(state.progressWrites.length).toBeLessThanOrEqual(3);
    expect(state.maxActiveWrites).toBe(1); expect(state.progressWrites[1].body.expectedVersion).toBe(1);
  } finally { release(); }
  noGeneration(state);
});

test('T70 / K6: failed writes keep the previous position and never report local learning as saved', async ({ page, context, baseURL }) => {
  const previous = progressRecord(), { state, main } = await setupLearning(page, context, baseURL, { progress: previous });
  await openLibrary(page); await openCourse(main); const video = await waitVideo(main); await expect(savedStatus(main)).toContainText('暂停'); state.progressWriteStatus = 503;
  await seek(video, 6.4); await expect(savedStatus(main)).toContainText('暂未保存'); await expect(savedStatus(main)).not.toContainText('已保存在本机');
  expect(state.progress[key(ownerA)]).toEqual(previous); state.progressWriteStatus = 200;
  await main.getByRole('button', { name: '重试保存', exact: true }).click(); await expect(savedStatus(main)).toContainText('已保存在本机');
  expect(state.progress[key(ownerA)].position.time).toBeCloseTo(6.4, 1); noGeneration(state);
});

test('T70 / K6: a lost write acknowledgement is recovered without incrementing the same position twice', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); const video = await waitVideo(main); state.lostAckOnce = true;
  await noPreviousProgress(main);
  await seek(video, 6.4); await expect(savedStatus(main)).toContainText('暂未保存');
  expect(state.progress[key(ownerA)].version).toBe(1); await main.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(savedStatus(main)).toContainText('已保存在本机'); expect(state.progress[key(ownerA)].version).toBe(1);
  expect(state.progress[key(ownerA)].position.time).toBeCloseTo(6.4, 1); noGeneration(state);
});

test('T70 / K6: learning further after a lost acknowledgement retains the latest position during recovery', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); const video = await waitVideo(main); await noPreviousProgress(main);
  state.lostAckOnce = true; await seek(video, 3); await expect(savedStatus(main)).toContainText('暂未保存');
  expect(state.progress[key(ownerA)].position.time).toBeCloseTo(3, 1); expect(state.progress[key(ownerA)].version).toBe(1);
  await seek(video, 6.4); await main.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(savedStatus(main)).toContainText('已保存在本机');
  expect(state.progress[key(ownerA)].position.time).toBeCloseTo(6.4, 1); expect(state.progress[key(ownerA)].version).toBe(2);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(6.4, 1); noGeneration(state);
});

test('T70 / K6: accepted codec tail differences are normalized to the course length before saving', async ({ page, context, baseURL }) => {
  const { state, main, course } = await setupLearning(page, context, baseURL); course.media.duration = 12; state.scenes[ownerA][0].duration = 12;
  await openLibrary(page); await openCourse(main); const video = await waitVideo(main); await noPreviousProgress(main);
  const actualDuration = await video.evaluate(v => v.duration); expect(actualDuration).toBeGreaterThan(12); expect(actualDuration).toBeLessThan(12.25);
  await seek(video, actualDuration); await expect(savedStatus(main)).toContainText('已保存在本机');
  expect(state.progress[key(ownerA)].position.time).toBe(12);
  for (const write of state.progressWrites) expect(write.body.position.time).toBeLessThanOrEqual(12); noGeneration(state);
});

test('T70 / K6: a save conflict offers rereading the other page position rather than overwriting it', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { progress: progressRecord() }); await openLibrary(page); await openCourse(main); const video = await waitVideo(main); await expect(savedStatus(main)).toContainText('暂停');
  const elsewhere = progressRecord({ page: 'sentences', time: 7, turnIndex: 0 }, 5); state.progress[key(ownerA)] = elsewhere;
  await seek(video, 4); await expect(savedStatus(main)).toContainText('其他页面'); expect(state.progress[key(ownerA)]).toEqual(elsewhere);
  const before = state.progressWrites.length; await main.getByRole('button', { name: '重新读取学习位置', exact: true }).click();
  await expect(main.getByTestId('scene-panel-3')).toBeVisible(); await expect(video).toHaveJSProperty('paused', true);
  expect(state.progressWrites).toHaveLength(before); expect(state.progress[key(ownerA)]).toEqual(elsewhere); noGeneration(state);
});

test('T70 / K6: library and course and progress JSON bodies each have a recoverable five-second client deadline', async ({ page, context, baseURL }) => {
  await page.clock.install(); await stallBody(page, '/no-target'); const { state, main } = await setupLearning(page, context, baseURL);
  // Install once; set the current target after navigation so script order cannot select another endpoint.
  for (const pathname of ['/api/learning-library', '/api/generated-courses', '/api/scene-progress']) {
    await page.goto('/'); await page.evaluate(pathname => { window.t70BodyTarget = { pathname, method: 'GET' }; }, pathname);
    await main.getByRole('button', { name: '我的场景', exact: true }).click();
    if (pathname !== '/api/learning-library') await main.getByRole('button', { name: '继续学习', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.t70BodyStalls)).toBe(1); await page.clock.runFor(5100);
    await expect.poll(() => page.evaluate(() => window.t70BodyAborts)).toBe(1);
    if (pathname === '/api/learning-library') await expect(main.getByRole('button', { name: '重试加载', exact: true })).toBeVisible();
    else if (pathname === '/api/generated-courses') await expect(main.getByRole('alert')).toBeVisible();
    else await expect(savedStatus(main)).toContainText('临时学习');
    expect(state.progressWrites).toEqual([]); await page.evaluate(() => { window.t70BodyRecovered = true; });
    if (pathname === '/api/learning-library') {
      await main.getByRole('button', { name: '重试加载', exact: true }).click(); await expect(main.getByRole('listitem')).toHaveCount(1);
    } else if (pathname === '/api/generated-courses') {
      await main.getByRole('button', { name: '返回我的场景', exact: true }).click(); await openCourse(main); await waitVideo(main); await noPreviousProgress(main);
    } else { await main.getByRole('button', { name: '重试读取', exact: true }).click(); await noPreviousProgress(main); }
    expect(state.progressWrites).toEqual([]);
  }
  noGeneration(state);
});

test('T70 / K6: an incomplete save acknowledgement body times out and query recovery preserves its one committed version', async ({ page, context, baseURL }) => {
  await page.clock.install(); await stallBody(page, '/api/scene-progress', 'PUT');
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); const video = await waitVideo(main);
  await noPreviousProgress(main);
  await seek(video, 6.4); await expect.poll(() => page.evaluate(() => window.t70BodyStalls)).toBe(1); await page.clock.runFor(5100);
  await expect(savedStatus(main)).toContainText('暂未保存'); expect(await page.evaluate(() => window.t70BodyAborts)).toBe(1);
  expect(state.progress[key(ownerA)].version).toBe(1); await page.evaluate(() => { window.t70BodyRecovered = true; });
  await main.getByRole('button', { name: '重试保存', exact: true }).click(); await expect(savedStatus(main)).toContainText('已保存在本机');
  expect(state.progress[key(ownerA)].version).toBe(1); noGeneration(state);
});

test('T70 / K6: an old-owner catalogue reply cannot reveal the previous account after switching', async ({ page, context, baseURL }) => {
  const { state, main, record } = await setupLearning(page, context, baseURL); let release;
  const observed = observeApi(page, '/api/learning-library');
  state.catalogueGates[ownerA] = new Promise(resolve => { release = resolve; });
  try {
    await page.goto('/'); await main.getByRole('button', { name: '我的场景', exact: true }).click(); await expect.poll(() => state.catalogueReads.length).toBe(1);
    state.owner = ownerB; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
    await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible(); await main.getByRole('button', { name: '我的场景', exact: true }).click();
    await expect(main.getByText('这里还没有可学习的场景。', { exact: true })).toBeVisible(); release(); await observed.done();
    await expect(main.getByRole('listitem')).toHaveCount(0); await expect(main).not.toContainText(record.content.description); expect(state.progressWrites).toEqual([]);
  } finally { release(); observed.dispose(); }
  noGeneration(state);
});

test('T70 / K6: late old-owner progress reads and save acknowledgements cannot restore or write for the new account', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { progress: progressRecord() });
  for (const mode of ['read', 'save']) {
    state.owner = ownerA; state.authenticated = true; let release;
    const observed = observeApi(page, '/api/scene-progress', mode === 'read' ? 'GET' : 'PUT');
    const gates = mode === 'read' ? state.progressReadGates : state.progressAckGates; gates[ownerA] = new Promise(resolve => { release = resolve; });
    try {
      const before = mode === 'read' ? state.progressReads.length : state.progressWrites.length;
      await openLibrary(page); await openCourse(main);
      if (mode === 'save') { const video = await waitVideo(main); await expect(savedStatus(main)).toContainText('暂停'); await seek(video, 4); }
      await expect.poll(() => (mode === 'read' ? state.progressReads.length : state.progressWrites.length)).toBe(before + 1);
      state.owner = ownerB; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
      await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible(); release(); await observed.done();
      await main.getByRole('button', { name: '我的场景', exact: true }).click(); await expect(main.getByRole('listitem')).toHaveCount(0);
      await expect(main.locator('video')).toHaveCount(0); expect(state.progressWrites.filter(write => write.owner === ownerB)).toEqual([]);
    } finally { release(); observed.dispose(); delete gates[ownerA]; }
  }
  noGeneration(state);
});

test('T70 / K6: uncertain session checks hide and pause private media and logout removes the previous library', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL); await openLibrary(page); await openCourse(main); const video = await waitVideo(main);
  await main.getByTestId('scene-play').click(); await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/session', async route => { await gate; return route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } }); });
  try {
    await page.evaluate(() => { window.t70OldVideo = document.querySelector('video'); window.dispatchEvent(new Event('le-sg-auth-invalid')); });
    await expect(main.locator('video')).toBeHidden(); await expect(main.getByTestId('real-scene-course')).toBeHidden(); expect(await page.evaluate(() => window.t70OldVideo.paused)).toBe(true);
    release(); await expect(main.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible();
    await page.unroute('**/api/auth/session');
    // Reinstall the known fixture after removing both page handlers.
    await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: state.authenticated, accountKey: state.authenticated ? state.owner : null } }));
    state.authenticated = false; await main.getByRole('button', { name: '重新检查登录', exact: true }).click();
    await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: '我的场景', exact: true })).toHaveCount(0); await expect(main.locator('video')).toHaveCount(0);
  } finally { release(); }
  noGeneration(state);
});

test('T70 / K6: the same account recovering from a temporary session failure restores its page time and turn paused', async ({ page, context, baseURL }) => {
  const previous = progressRecord({ page: 'prompt', time: 8.2, turnIndex: 1 });
  const { state, main } = await setupLearning(page, context, baseURL, { progress: previous, extraTurn: true });
  await openLibrary(page); await openCourse(main); await expect(main.getByTestId('scene-partner')).toHaveText('May I see your ID?');
  await page.route('**/api/auth/session', route => route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(main.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible(); await expect(main.locator('video')).toBeHidden(); await expect(main.getByTestId('real-scene-course')).toBeHidden();
  await page.unroute('**/api/auth/session'); await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: true, accountKey: ownerA } }));
  await main.getByRole('button', { name: '重新检查登录', exact: true }).click();
  await expect(main.getByTestId('scene-panel-4')).toBeVisible(); await expect(main.getByTestId('scene-partner')).toHaveText('May I see your ID?');
  const video = await waitVideo(main); await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(8.2, 1); await expect(video).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => window.t70PlayCalls)).toBe(0); expect(state.progressWrites).toEqual([]); expect(state.progress[key(ownerA)]).toEqual(previous); noGeneration(state);
});

test('T70 / K6: missing background remains explicitly neutral and broken private media never becomes a public sample', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { legacy: true, progress: progressRecord({ page: 'role', time: 0, turnIndex: 0 }) });
  await openLibrary(page); await openCourse(main); await expect(main).toContainText('角色背景未记录');
  await expect(main.getByTestId('scene-learner-role')).toContainText('场景中回答的一方'); await expect(main).not.toContainText('新草稿中的导游');
  await main.getByRole('button', { name: '返回我的场景', exact: true }).click(); state.mediaStatus = 404; await openCourse(main);
  await expect(main.getByRole('alert')).toBeVisible(); expect(state.progressWrites).toEqual([]); noGeneration(state);
});

test('T70 / K6: a 401 from catalogue or progress GET or PUT rechecks the session and hides private learning', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL);
  for (const mode of ['catalogue', 'read', 'write']) {
    state.authenticated = true; state.progressReadStatus = 200; state.progressWriteStatus = 200;
    await page.goto('/'); await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
    let checked;
    try {
      if (mode === 'catalogue') { checked = observeApi(page, '/api/auth/session'); state.authenticated = false; await main.getByRole('button', { name: '我的场景', exact: true }).click(); }
      else {
        await main.getByRole('button', { name: '我的场景', exact: true }).click();
        await expect(main.getByRole('button', { name: '继续学习', exact: true })).toBeVisible();
        if (mode === 'read') {
          // Course GET intentionally stays 200 to isolate a session expiry at progress GET.
          checked = observeApi(page, '/api/auth/session'); state.authenticated = false; state.progressReadStatus = 401; await main.getByRole('button', { name: '继续学习', exact: true }).click();
        } else {
          await openCourse(main); const video = await waitVideo(main); await noPreviousProgress(main);
          checked = observeApi(page, '/api/auth/session'); state.authenticated = false; state.progressWriteStatus = 401; await seek(video, 3);
        }
      }
      await checked.done(); await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
      await expect(main.getByTestId('real-scene-course')).toBeHidden(); await expect(main.getByRole('listitem')).toHaveCount(0);
      expect(state.progress[key(ownerA)]).toBeNull();
    } finally { checked?.dispose(); }
  }
  noGeneration(state);
});

test('T70 / K6: generation watch uses the same progress API while the old demo remains independent', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { progress: progressRecord({ page: 'sentences', time: 6.4, turnIndex: 0 }) });
  await page.goto('/?generation=2'); await main.getByRole('button', { name: '观看场景', exact: true }).click();
  await expect(main.getByTestId('scene-panel-3')).toBeVisible(); const video = await waitVideo(main); await expect(video).toHaveJSProperty('paused', true);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(6.4, 1); expect(state.progressReads).toHaveLength(1);
  const before = { reads: state.progressReads.length, writes: state.progressWrites.length, catalogues: state.catalogueReads.length };
  await page.goto('/demo'); await expect(page.getByRole('main').getByRole('heading', { name: /先选你熟悉的语言|选择登录方式/ })).toBeVisible();
  if (await page.getByRole('main').getByRole('heading', { name: '先选你熟悉的语言', exact: true }).isVisible()) await page.getByRole('button', { name: /简体中文/ }).click();
  await expect(page.getByRole('main').getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
  expect(state.progressReads).toHaveLength(before.reads); expect(state.progressWrites).toHaveLength(before.writes); expect(state.catalogueReads).toHaveLength(before.catalogues);
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]); expect(state.external).toEqual([]);
});
