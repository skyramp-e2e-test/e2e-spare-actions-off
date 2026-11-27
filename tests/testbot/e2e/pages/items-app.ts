// Page objects and API helpers for the login and Items pages, shared by the items tests.
import { expect } from "@skyramp/skyramp";
import type { APIRequestContext, Locator, Page, Response } from "@playwright/test";

export const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export interface ApiItem {
  id: number;
  name: string;
  created_at: string;
}

/** A name no other run uses, so a test finds the items it made by the names it sent. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The login credentials the run provides; never written into a test. */
export function uiCredentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { email, password };
}

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST /api/items {"name": name}, the test's own setup; returns the stored item. */
export async function createItem(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name }, headers: authHeaders() });
  expect(res.status()).toBe(201);
  return (await res.json()) as ApiItem;
}

export async function listItems(request: APIRequestContext): Promise<ApiItem[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiItem[];
}

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.signIn = page.getByRole("button", { name: "Sign in" });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${baseUrl}/login`);
  }

  async signInAs(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

export class ItemsPage {
  readonly userStatus: Locator;
  readonly list: Locator;
  readonly entries: Locator;
  readonly newItemInput: Locator;
  readonly addItem: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.list = page.getByTestId("items-list");
    this.entries = this.list.getByTestId("item");
    this.newItemInput = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
  }

  /** The page's own GET /api/items response: the items the list renders from. */
  waitForItemsLoad(): Promise<Response> {
    return this.page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items",
    );
  }

  /** Opens /items and returns the items the page loaded. */
  async open(): Promise<ApiItem[]> {
    const load = this.waitForItemsLoad();
    await this.page.goto(`${baseUrl}/items`);
    return (await (await load).json()) as ApiItem[];
  }

  /** Reloads /items and returns the items the page loaded. */
  async reload(): Promise<ApiItem[]> {
    const load = this.waitForItemsLoad();
    await this.page.reload();
    return (await (await load).json()) as ApiItem[];
  }

  /** The entry whose whole text is exactly `text`. */
  entryNamed(text: string): Locator {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.entries.filter({ hasText: new RegExp(`^${escaped}$`) });
  }

  /** Asserts the list shows one entry per loaded item, each reading that item's name, in the same order, none blank. */
  async expectListMatches(items: ApiItem[]): Promise<void> {
    await expect.soft(this.entries).toHaveCount(items.length);
    await expect.soft(this.entries).toHaveText(items.map((i) => i.name));
    await expect.soft(this.entries.filter({ hasNotText: /\S/ })).toHaveCount(0);
  }
}
