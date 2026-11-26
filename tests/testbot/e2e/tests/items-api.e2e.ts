// Contract of POST/GET /api/items: the stored item carries the `name` field the Items page displays.
// Written by hand: Skyramp contract generation failed on its licence check in this run.
import { test, expect } from "@skyramp/skyramp";
import { apiBaseUrl, uniq } from "../pages/items-page";

test("an item created through POST /api/items is returned by GET /api/items with its name", async ({ request }) => {
  const name = `Legacy ${uniq()}`;

  const created = await request.post(`${apiBaseUrl}/api/items`, { data: { name } });
  expect(created.status()).toBe(201);
  const body = await created.json();
  expect(Object.keys(body).sort()).toEqual(["created_at", "id", "name"]);
  expect(body.name).toBe(name);
  expect(Number.isInteger(body.id)).toBe(true);
  expect(Number.isNaN(Date.parse(body.created_at))).toBe(false);

  const listed = await request.get(`${apiBaseUrl}/api/items`);
  expect(listed.status()).toBe(200);
  const items = await listed.json();
  expect(Array.isArray(items)).toBe(true);
  const entry = items.find((i: { id: number }) => i.id === body.id);
  expect(entry).toEqual({ id: body.id, name, created_at: body.created_at });
});
