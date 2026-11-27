import type { APIRequestContext } from "@playwright/test";
import type { StoredItem } from "./pages/items-page";

/** Every item a test here creates has this marker in its name, so .skyramp cleanup can find it. */
export const ITEM_MARKER = "TBitems";

export function uniqueSuffix(): string {
  return `${ITEM_MARKER} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates an item through POST /api/items and checks the app stored the name it was sent. */
export async function createItem(request: APIRequestContext, baseUrl: string, name: string): Promise<StoredItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  if (res.status() !== 201) throw new Error(`POST /api/items answered ${res.status()}: ${await res.text()}`);
  const item = (await res.json()) as StoredItem;
  if (item.name !== name) throw new Error(`POST /api/items stored ${JSON.stringify(item.name)}, sent ${JSON.stringify(name)}`);
  return item;
}
