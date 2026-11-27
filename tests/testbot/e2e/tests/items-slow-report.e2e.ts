import { test, expect } from '@playwright/test';

const BASE = process.env.SKYRAMP_TEST_BASE_URL || process.env.SKYRAMP_TEST_SERVICE_URL_APP || 'http://localhost:3000';

test('slow items report does not answer within its first seconds', async ({ request }) => {
  let status: number | undefined;
  let timedOut = false;
  try {
    const res = await fetch(`${BASE}/api/items/slow`, { signal: AbortSignal.timeout(10000) });
    status = res.status;
  } catch (e: any) {
    timedOut = e?.name === 'TimeoutError';
  }
  expect(status).toBeUndefined();
  expect(timedOut).toBe(true);
  const notFound = await request.get(`${BASE}/api/items/does-not-exist`);
  expect(notFound.status()).toBe(404);
  expect(await notFound.json()).toEqual({ error: 'Not found' });
});

test('app keeps answering while slow reports are pending', async ({ request }) => {
  const ctrl = new AbortController();
  const pending = Array.from({ length: 12 }, () =>
    fetch(`${BASE}/api/items/slow`, { signal: ctrl.signal }).catch(() => undefined));
  try {
    const health = await request.get(`${BASE}/health`, { timeout: 2000 });
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const list = await request.get(`${BASE}/api/items`, { timeout: 2000 });
    expect(list.status()).toBe(200);
    expect(Array.isArray(await list.json())).toBe(true);
    const name = `while-slow-${Date.now()}`;
    const created = await request.post(`${BASE}/api/items`, { data: { name }, timeout: 2000 });
    expect(created.status()).toBe(201);
    expect((await created.json()).name).toBe(name);
    const after = await request.get(`${BASE}/api/items`, { timeout: 2000 });
    expect((await after.json()).map((i: any) => i.name)).toContain(name);
  } finally {
    ctrl.abort();
    await Promise.all(pending);
  }
});
