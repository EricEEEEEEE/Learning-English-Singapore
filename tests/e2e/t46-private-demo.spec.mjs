import { test, expect } from '@playwright/test';

const goal = '与老师确认孩子下次家长会的时间';

async function openConfirmedScenario(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^简体中文/ }).click();
  await page.getByRole('button', { name: '预览逐题引导', exact: true }).click();
  await page.getByRole('button', { name: '结束引导', exact: true }).click();
  await page.getByRole('button', { name: '选择要练的事', exact: true }).click();
  await page.getByRole('button', { name: '都不是，我想练……', exact: true }).click();
  await page.getByRole('textbox', { name: '想练的事', exact: true }).fill(goal);
  await page.getByRole('button', { name: '整理成确认卡', exact: true }).click();
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).click();
  await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toBeVisible();
}

async function mockPrivateDemo(page, state) {
  await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: state.authenticated, accountKey: state.authenticated ? state.account : null }) }));
  await page.route('**/api/private-demo**', async route => {
    const method = route.request().method();
    if (!state.authenticated) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    if (state.fail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const records = state.records[state.account] ??= [];
    const body = method === 'GET' ? {} : route.request().postDataJSON() ?? {};
    if (method !== 'GET') (state.sent ??= []).push(body);
    if (method === 'POST') {
      const record = { id: `record-${state.account}-${records.length + 1}`, goalRevision: body.goalRevision, playbackPositionMs: body.playbackPositionMs };
      records.push(record);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ record }) });
    }
    if (method === 'PATCH') {
      const record = records.find(item => item.id === body.id);
      Object.assign(record, { playbackPositionMs: body.playbackPositionMs });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record }) });
    }
    if (method === 'DELETE') {
      state.records[state.account] = records.filter(item => item.id !== body.id);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records }) });
  });
}

test('T46 / F11.1,F11.2: signed-in learner saves a confirmed version, resumes after refresh, then revokes it', async ({ page }) => {
  const state = { authenticated: true, account: 'a', records: {} };
  await mockPrivateDemo(page, state);
  await openConfirmedScenario(page);
  const panel = page.getByRole('region', { name: '本地临时记录' });
  await expect(panel).toContainText('流程演示');
  await expect(panel).toContainText('服务重启后可能消失');
  await panel.getByRole('button', { name: '保存本次场景', exact: true }).click();
  await expect(panel).toContainText('版本 1');
  expect(JSON.stringify(state.sent)).not.toContain(goal);
  expect(JSON.stringify(state.sent)).not.toContain('ownerId');
  await panel.getByRole('spinbutton', { name: '播放位置（秒）' }).fill('43');
  await panel.getByRole('button', { name: '更新播放位置', exact: true }).click();
  await expect(panel).toContainText('43 秒');
  await page.reload();
  await expect(panel).toContainText('43 秒');
  await panel.getByRole('button', { name: '撤销这条记录', exact: true }).click();
  await expect(panel).not.toContainText('43 秒');
  expect(state.records.a).toEqual([]);
});

test('T46 / F1.5,F11.2,F14.4: account switch, expired login and store failure do not expose another account record or claim success', async ({ page }) => {
  const state = { authenticated: true, account: 'a', records: {} };
  await mockPrivateDemo(page, state);
  await openConfirmedScenario(page);
  const panel = page.getByRole('region', { name: '本地临时记录' });
  await panel.getByRole('button', { name: '保存本次场景', exact: true }).click();
  expect(state.records.a).toHaveLength(1);

  state.fail = true;
  await panel.getByRole('spinbutton', { name: '播放位置（秒）' }).fill('12');
  await panel.getByRole('button', { name: '更新播放位置', exact: true }).click();
  await expect(panel).toContainText('临时记录暂时无法保存');
  expect(state.records.a[0].playbackPositionMs).toBe(0);

  state.fail = false;
  state.authenticated = false;
  await page.reload();
  await expect(page.getByRole('main')).toContainText('登录已失效');
  await expect(page.getByRole('main')).not.toContainText(goal);
  await expect(page.getByRole('button', { name: '保存本次场景', exact: true })).toHaveCount(0);

  state.authenticated = true;
  state.account = 'b';
  await page.reload();
  await expect(page.getByRole('main')).not.toContainText(goal);
  await expect(page.getByRole('main')).not.toContainText(state.records.a[0].id);
  expect(state.records.b ?? []).toEqual([]);
});
