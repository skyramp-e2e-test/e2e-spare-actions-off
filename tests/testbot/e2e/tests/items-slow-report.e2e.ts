import { test, expect } from '@playwright/test';

const BASE_URL = process.env.SKYRAMP_TEST_BASE_URL || 'http://localhost:3000';
const auth = () => ({ Authorization: `Bearer ${process.env.SKYRAMP_TEST_TOKEN}` });

test('slow items report does not answer within 5 seconds', async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  let status: number | undefined;
  let errName = '';
  try {
    const res = await fetch(`${BASE_URL}/api/items/slow`, { headers: auth(), signal: ctrl.signal });
    status = res.status;
  } catch (e: any) {
    errName = e.name;
  } finally {
    clearTimeout(timer);
  }
  expect(status).toBeUndefined();
  expect(errName).toBe('AbortError');
});

test('server keeps serving while a slow report is pending', async () => {
  const slowCtrl = new AbortController();
  const slow = fetch(`${BASE_URL}/api/items/slow`, { headers: auth(), signal: slowCtrl.signal }).catch((e) => e);
  try {
    await new Promise((r) => setTimeout(r, 1000));
    const health = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const items = await fetch(`${BASE_URL}/api/items`, { headers: auth(), signal: AbortSignal.timeout(5000) });
    expect(items.status).toBe(200);
    expect(Array.isArray(await items.json())).toBe(true);
  } finally {
    slowCtrl.abort();
    await slow;
  }
});
