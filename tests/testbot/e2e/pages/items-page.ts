import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";

export const appBaseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export interface StoredItem {
  id: number;
  name: string;
  created_at: string;
}

/** The sign-in account comes only from the environment, never from this file. */
export function signInAccount(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { email, password };
}

/** Authorization header for API calls, when the run supplies a token. */
export function apiHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A name unique to this test run, so a test finds the records it made. */
export function uniqueName(base: string): string {
  return `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function createItem(request: APIRequestContext, name: string): Promise<StoredItem> {
  const res = await request.post(`${appBaseUrl}/api/items`, {
    headers: { "Content-Type": "application/json", ...apiHeaders() },
    data: { name },
  });
  expect(res.status(), `POST /api/items ${name}`).toBe(201);
  return (await res.json()) as StoredItem;
}

export async function listItems(request: APIRequestContext): Promise<StoredItem[]> {
  const res = await request.get(`${appBaseUrl}/api/items`, { headers: apiHeaders() });
  expect(res.status(), "GET /api/items").toBe(200);
  return (await res.json()) as StoredItem[];
}

/** Login page (/login). */
export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.signIn = page.getByRole("button", { name: "Sign in" });
  }

  async signInAs(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

/** Items page (/items). */
export class ItemsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userStatus: Locator;
  readonly list: Locator;
  readonly items: Locator;
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Items" });
    this.userStatus = page.getByTestId("user-status");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
  }

  async goto(): Promise<void> {
    await this.page.goto(`${appBaseUrl}/items`);
  }

  /** Texts of every list entry, in the order shown. */
  async texts(): Promise<string[]> {
    return this.items.allTextContents();
  }
}

/** Wraps the page with Skyramp's page and sets a short default timeout. */
export function skyrampPage(page: Page): Page {
  page.setDefaultTimeout(15000);
  return newSkyrampPlaywrightPage(page);
}
