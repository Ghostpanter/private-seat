import type { Browser, Page } from "playwright-core";

const pages = new Map<string, Page>();
let connecting: Promise<Browser> | null = null;
let tail: Promise<void> = Promise.resolve();

async function getBrowser(): Promise<Browser> {
  const endpoint = process.env.GROK_BROWSER_CDP?.trim();
  if (!endpoint) throw new Error("没有配置浏览器层");
  if (connecting) {
    const current = await connecting;
    if (current.isConnected()) return current;
    connecting = null;
  }
  connecting = (async () => {
    const { chromium } = await import("playwright-core");
    return chromium.connectOverCDP(endpoint);
  })();
  try {
    return await connecting;
  } catch (error) {
    connecting = null;
    throw error;
  }
}

async function pageFor(userId: string): Promise<Page> {
  const existing = pages.get(userId);
  if (existing && !existing.isClosed()) return existing;
  const browser = await getBrowser();
  const context = browser.contexts()[0];
  if (!context) throw new Error("浏览器层没有起来");
  const page = await context.newPage();
  pages.set(userId, page);
  await page.goto("https://grok.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  return page;
}

async function visibleTail(page: Page, content: string): Promise<string> {
  return page.evaluate((own) => {
    const root = document.querySelector("main") ?? document.body;
    const blocks: string[] = [];
    for (const el of root.querySelectorAll("div")) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest("[contenteditable='true'], textarea")) continue;
      if (el.querySelector("[contenteditable='true'], textarea")) continue;
      if (el.querySelectorAll("div").length > 4) continue;
      const text = el.innerText?.trim() ?? "";
      if (!text || text.length > 20000 || text === own) continue;
      blocks.push(text);
    }
    return blocks.at(-1) ?? "";
  }, content);
}

async function runTurn(
  userId: string,
  content: string,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const page = await pageFor(userId);
  await page.bringToFront();
  if (/accounts\.|\/login|signin/i.test(page.url())) {
    throw new Error("浏览器层还没登录。席主打开 6080 端口的画面，在里面登录 Grok。");
  }
  const box = page.locator('[contenteditable="true"], textarea').last();
  try {
    await box.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    throw new Error("浏览器层还没进入 Grok 的输入框。席主先在 6080 的画面里登录。");
  }
  const started = await visibleTail(page, content);
  await box.click();
  await page.keyboard.insertText(content);
  await page.keyboard.press("Enter");

  let emitted = "";
  let stable = 0;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    await page.waitForTimeout(400);
    const now = await visibleTail(page, content);
    if (!now || now === started) {
      stable = 0;
      continue;
    }
    if (now.startsWith(emitted)) {
      const piece = now.slice(emitted.length);
      if (piece) onDelta(piece);
      emitted = now;
    } else if (!emitted) {
      onDelta(now);
      emitted = now;
    }
    if (now === emitted) stable += 400;
    else stable = 0;
    if (emitted && stable >= 2800) return;
  }
  if (!emitted) throw new Error("浏览器层没有读到回复");
}

/** Type one user's line into their own Grok tab and stream the new reply text. */
export function askBrowser(
  userId: string,
  content: string,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const job = tail.then(() => runTurn(userId, content, onDelta, signal));
  tail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
