'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

const DELAY_MS = 6 * 60 * 1000;

function flush(times = 5) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    p = p.then(() => new Promise((r) => setImmediate(r)));
  }
  return p;
}

// Drives the Express app in-process with fake req/res objects (no socket).
function request(app, path) {
  const state = { done: false };
  state.promise = new Promise((resolve, reject) => {
    const headers = {};
    const req = { method: 'GET', url: path, headers: {}, socket: {}, connection: {} };
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      getHeader(name) { return headers[name.toLowerCase()]; },
      removeHeader(name) { delete headers[name.toLowerCase()]; },
      end(chunk) {
        state.done = true;
        resolve({ status: this.statusCode, type: headers['content-type'], body: JSON.parse(String(chunk)) });
      },
    };
    app.handle(req, res, reject);
  });
  return state;
}

function countingPool(count, sqls) {
  return { query: async (sql) => { sqls.push(sql); return { rows: [{ count }] }; } };
}

async function slowRequest(pool, ticks) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const app = createApp({ pool, signingSecret: 'test' });
  try {
    const req = request(app, '/api/items/slow');
    await flush();
    for (const t of ticks) {
      mock.timers.tick(t.ms);
      await flush();
      if (t.check) t.check(req);
    }
    return await req.promise;
  } finally {
    mock.timers.reset();
  }
}

async function assertCountAfterDelay(n) {
  const sqls = [];
  const res = await slowRequest(countingPool(n, sqls), [{ ms: DELAY_MS }]);
  assert.strictEqual(res.status, 200);
  assert.match(res.type, /application\/json/);
  assert.deepStrictEqual(res.body, { count: n });
  assert.strictEqual(sqls.length, 1);
  assert.match(sqls[0], /COUNT\(\*\).*FROM items/i);
}

test('slow items report answers 200 with count 3 after 6 minutes', async () => {
  await assertCountAfterDelay(3);
});

test('slow items report answers 200 with count 0 after 6 minutes', async () => {
  await assertCountAfterDelay(0);
});

test('slow items report does not answer before 6 minutes have passed', async () => {
  const res = await slowRequest(countingPool(3, []), [
    { ms: DELAY_MS - 1, check: (req) => assert.strictEqual(req.done, false) },
    { ms: 1 },
  ]);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { count: 3 });
});

test('slow items report answers 500 like GET /api/items when the query fails', async () => {
  const failing = { query: async () => { throw new Error('boom'); } };
  const slow = await slowRequest(failing, [{ ms: DELAY_MS }]);
  assert.strictEqual(slow.status, 500);
  assert.deepStrictEqual(slow.body, { error: 'Internal server error' });

  const items = await request(createApp({ pool: failing, signingSecret: 'test' }), '/api/items').promise;
  assert.strictEqual(items.status, slow.status);
  assert.deepStrictEqual(items.body, slow.body);
});
