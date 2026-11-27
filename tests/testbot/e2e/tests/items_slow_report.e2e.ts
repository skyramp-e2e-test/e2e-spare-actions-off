import { test, expect, request } from "@playwright/test";

const BASE_URL = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

test.describe("GET /api/items/slow report", () => {
  test.setTimeout(60_000);

  test("does not answer before the 6 minute delay", async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    let status: number | null = null;
    let timedOut = false;
    try {
      const res = await ctx.get("/api/items/slow", { timeout: 20_000 });
      status = res.status();
    } catch (e) {
      timedOut = /timeout/i.test(String(e));
    }
    expect(status).toBeNull();
    expect(timedOut).toBe(true);
    await ctx.dispose();
  });

  test("health and items list answer while a slow report is pending", async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const pending = ctx.get("/api/items/slow", { timeout: 20_000 }).then(
      (r) => r.status(),
      () => null,
    );
    // Give the slow request a moment to reach the server before probing.
    await expect.poll(async () => true, { intervals: [1_000] }).toBe(true);
    const health = await ctx.get("/health", { timeout: 5_000 });
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    const items = await ctx.get("/api/items", { timeout: 5_000 });
    expect(items.status()).toBe(200);
    expect(Array.isArray(await items.json())).toBe(true);
    expect(await pending).toBeNull();
    await ctx.dispose();
  });
});
