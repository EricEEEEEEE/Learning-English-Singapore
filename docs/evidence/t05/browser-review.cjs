const { chromium, expect } = require('../../../tests/node_modules/@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('../../../node_modules/typescript');
const path = require('node:path');
const target = path.resolve('tmp/t05-browser-copy');
fs.mkdirSync(target, { recursive: true });
for (const name of ['entry-copy','guide-copy','scenario-copy']) fs.writeFileSync(`${target}/${name}.js`, ts.transpileModule(fs.readFileSync(`app/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
const { scenarioCopy } = require(`${target}/scenario-copy.js`);
const { entryCopy } = require(`${target}/entry-copy.js`);
const { guideCopy } = require(`${target}/guide-copy.js`);
const results = [], errors = [];
const base = 'http://127.0.0.1:3000';
let browser;
async function pageFor(code, width = 390, large = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    errors.push('external request'); return route.abort();
  });
  await context.routeWebSocket('**/*', route => { errors.push('WebSocket'); route.close(); });
  await context.addInitScript(({ code, large }) => {
    if (!localStorage.getItem('le-sg-entry-preferences-v1')) localStorage.setItem('le-sg-entry-preferences-v1', JSON.stringify({ language: code, largeText: large, reducedMotion: false }));
    window.__mediaCalls = [];
    HTMLMediaElement.prototype.play = () => { window.__mediaCalls.push('play'); return Promise.resolve(); };
    if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__mediaCalls.push('speech');
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__mediaCalls.push('microphone'); throw new Error('Unavailable in B1'); };
  }, { code, large });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base);
  await tap(page, guideCopy(code).entry);
  await tap(page, guideCopy(code).finish);
  await tap(page, scenarioCopy(code).entry);
  return page;
}
const tap = (page, name) => page.getByRole('button', { name, exact: true }).tap();
async function switchLanguage(page, from, name) { await tap(page, entryCopy[from].change); await page.getByRole('button', { name: new RegExp(`^${name}`) }).tap(); }
async function draft(page, code, goal) {
  const c = scenarioCopy(code);
  await tap(page, c.custom);
  await page.getByRole('textbox', { name: c.description, exact: true }).fill(goal);
  await tap(page, c.submit);
}
async function demo(page, code, name) {
  const summary = page.getByText(scenarioCopy(code).controls, { exact: true });
  const details = page.locator('details').filter({ has: summary });
  if (!(await details.evaluate(element => element.open))) await summary.tap();
  await tap(page, name);
}
async function finish(page, code) {
  const c = scenarioCopy(code);
  for (const name of [c.dialogueReady,c.mediaReady,c.checkReady]) await demo(page,code,name);
  await expect(page.getByRole('heading', { name: c.ready, exact: true })).toBeVisible();
}
async function check(name, run) {
  try { await run(); results.push({ name, result: 'pass' }); }
  catch (error) { results.push({ name, result: 'fail', message: error.message }); }
}
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= page.viewportSize().width);
  for (const button of await page.getByRole('main').getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, await button.innerText());
  }
}
async function close(page) {
  assert.deepEqual(await page.evaluate(() => window.__mediaCalls), []);
  await page.context().close();
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')));
const active = state => state.versions.find(version => version.id === state.active_version_id);

(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  await check('unsubmitted description survives language switch and refresh', async () => {
    const page = await pageFor('zh-Hans');
    try {
      await tap(page, scenarioCopy('zh-Hans').custom);
      await page.getByRole('textbox').fill('希望确认邻居的维修时间');
      await switchLanguage(page, 'zh-Hans', 'English');
      await expect(page.getByRole('textbox', { name: scenarioCopy('en').description, exact: true })).toHaveValue('希望确认邻居的维修时间');
      await page.reload();
      await expect(page.getByRole('textbox')).toHaveValue('希望确认邻居的维修时间');
      assert.equal((await saved(page)).versions.length, 0);
    } finally { await close(page); }
  });
  await check('unsubmitted goal edit survives language switch and refresh without creating a version', async () => {
    const page = await pageFor('zh-Hans');
    try {
      await draft(page, 'zh-Hans', '确认旧的维修地点');
      await tap(page, scenarioCopy('zh-Hans').confirm);
      await tap(page, scenarioCopy('zh-Hans').editGoal);
      await page.getByRole('textbox').fill('改为询问新的检查时间');
      await switchLanguage(page, 'zh-Hans', 'English');
      await expect(page.getByRole('textbox', { name: scenarioCopy('en').goal, exact: true })).toHaveValue('改为询问新的检查时间');
      await page.reload();
      await expect(page.getByRole('textbox')).toHaveValue('改为询问新的检查时间');
      assert.equal((await saved(page)).versions.length, 1);
      assert.equal(active(await saved(page)).user_goal, '确认旧的维修地点');
    } finally { await close(page); }
  });
  await check('confirmed instructions follow auxiliary language without rewriting user goal or stored version', async () => {
    const page = await pageFor('zh-Hans');
    try {
      await draft(page, 'zh-Hans', '确认维修地点');
      await tap(page, scenarioCopy('zh-Hans').confirm);
      await finish(page, 'zh-Hans');
      const before = active(await saved(page));
      await switchLanguage(page, 'zh-Hans', 'English');
      const steps = page.getByRole('region', { name: 'Example steps', exact: true });
      await expect(steps).toContainText('start by explaining');
      await expect(steps).toContainText('确认维修地点');
      assert.deepEqual(active(await saved(page)), before);
    } finally { await close(page); }
  });
  if (!process.argv.includes('--red')) for (const code of ['zh-Hans','id','ja','en']) for (const width of [320,390,1280]) {
    await check(`${code} large ${width}: confirmation, partial retry, cancelled history and global branch`, async () => {
      const page = await pageFor(code, width, true), c = scenarioCopy(code);
      try {
        await draft(page, code, `User goal A — ${code}: ask the building desk about repairs`);
        await fits(page);
        await page.screenshot({ path: `docs/evidence/t05/large-confirm-${code}-${width}.png`, fullPage: true });
        await tap(page, c.confirm);
        await demo(page, code, c.dialogueReady);
        const dialogue = structuredClone(active(await saved(page)).artifacts.dialogue);
        await demo(page, code, c.mediaFailureControl);
        await expect(page.getByRole('heading', { name: c.partial, exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: c.partial, exact: true })).toBeVisible();
        await tap(page, c.retry);
        assert.deepEqual(active(await saved(page)).artifacts.dialogue, dialogue);
        await demo(page, code, c.mediaReady);
        await demo(page, code, c.checkReady);
        const first = structuredClone(active(await saved(page)));
        await fits(page);
        await page.screenshot({ path: `docs/evidence/t05/large-ready-${code}-${width}.png`, fullPage: true });
        await tap(page, c.editGoal);
        await page.getByRole('textbox').fill(`User goal B — ${code}: ask about a new appointment`);
        await tap(page, c.save);
        await tap(page, c.confirm);
        await tap(page, c.cancel);
        const second = structuredClone(active(await saved(page)));
        await tap(page, c.view.replace('{n}', '1'));
        await tap(page, c.editGoal);
        await page.getByRole('textbox').fill(`User goal C — ${code}: ask about directions`);
        await tap(page, c.save);
        await tap(page, c.confirm);
        const third = structuredClone(active(await saved(page)));
        assert.equal(third.goal_revision, 3);
        await tap(page, c.view.replace('{n}', '2'));
        await page.reload();
        await expect(page.getByRole('heading', { name: c.cancelled, exact: true })).toBeVisible();
        await fits(page);
        await tap(page, c.view.replace('{n}', '3'));
        const latest = await saved(page);
        assert.deepEqual(latest.versions, [first,second,third]);
        await expect(page.getByRole('heading', { name: c.preparing, exact: true })).toBeVisible();
      } finally { await close(page); }
    });
  }
  assert.deepEqual(errors, []);
})().catch(error => { results.push({ name: 'runner', result: 'fail', message: error.message }); }).finally(async () => {
  if (browser) await browser.close();
  const suffix = process.argv.includes('--red') ? 'red' : 'green';
  fs.writeFileSync(`docs/evidence/t05/browser-review-${suffix}.json`, JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ results, errors }, null, 2));
  process.exitCode = results.every(result => result.result === 'pass') && !errors.length ? 0 : 1;
});
