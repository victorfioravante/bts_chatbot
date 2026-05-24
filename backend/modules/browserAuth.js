const logger = require("./logger");
const { generateTOTP } = require("../auth");

const PLAYWRIGHT_TTL_MS = 60 * 60 * 1000; // 1 hora

let cachedToken = null;
let cachedFp    = null;
let cachedAt    = 0;

async function acquireViaPlaywright() {
  if (Date.now() - cachedAt < PLAYWRIGHT_TTL_MS && cachedToken) {
    logger.info("[BrowserAuth] Retornando token Playwright do cache.");
    return { token: cachedToken, fp: cachedFp };
  }

  logger.info("[BrowserAuth] Iniciando Chromium headless...");
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright não instalado. Execute: npm install playwright && npx playwright install chromium");
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto("https://www.bitsler.com", { waitUntil: "domcontentloaded", timeout: 30000 });

    const loggedIn = await page.evaluate(() =>
      !!window.__vue_store__?.state?.chat?.user?.socketToken
    );

    if (!loggedIn && process.env.BITSLER_USERNAME && process.env.BITSLER_PASSWORD) {
      logger.info("[BrowserAuth] Não está logado — tentando login via Playwright...");

      try {
        await page.waitForSelector(
          'input[name="username"], input[type="email"], input[placeholder*="username" i]',
          { timeout: 10000 }
        );
      } catch {
        throw new Error("Campo de login não encontrado na página da Bitsler");
      }

      await page.fill(
        'input[name="username"], input[type="email"], input[placeholder*="username" i]',
        process.env.BITSLER_USERNAME
      );
      await page.fill('input[name="password"]', process.env.BITSLER_PASSWORD);
      await page.keyboard.press("Enter");

      // 2FA TOTP — detecta campo e preenche com código gerado
      if (process.env.BITSLER_2FA_SECRET) {
        const twoFaField = page.locator(
          'input[name="totp"], input[name="two_factor"], input[placeholder*="2FA" i], input[placeholder*="code" i], input[placeholder*="authenticator" i]'
        );
        const is2FA = await twoFaField.isVisible({ timeout: 8000 }).catch(() => false);
        if (is2FA) {
          logger.info("[BrowserAuth] Campo 2FA detectado — preenchendo TOTP...");
          const code = generateTOTP(process.env.BITSLER_2FA_SECRET);
          await twoFaField.fill(code);
          await page.keyboard.press("Enter");
        }
      }
    }

    // Aguarda fingerprint tracer ficar disponível
    await page.waitForFunction(
      () => typeof window.tracer?.getFp === "function",
      { timeout: 5000 }
    ).catch(() => {});

    // Aguarda socketToken aparecer no Vue store (até 30s)
    logger.info("[BrowserAuth] Aguardando socketToken no Vue store...");
    await page.waitForFunction(
      () => !!window.__vue_store__?.state?.chat?.user?.socketToken,
      { timeout: 30000 }
    );

    const { token, fp } = await page.evaluate(() => ({
      token: window.__vue_store__.state.chat.user.socketToken,
      fp:    window.tracer?.getFp?.() ?? "",
    }));

    // Fallback para fingerprint do .env se o browser não retornou
    const resolvedFp = fp || process.env.BITSLER_FINGERPRINT || "";

    cachedToken = token;
    cachedFp    = resolvedFp;
    cachedAt    = Date.now();

    logger.info(`[BrowserAuth] Token extraído com sucesso. FP: ${resolvedFp.slice(0, 8)}...`);
    return { token, fp: resolvedFp };
  } finally {
    await browser.close();
  }
}

function clearCache() {
  cachedToken = null;
  cachedFp    = null;
  cachedAt    = 0;
}

module.exports = { acquireViaPlaywright, clearCache };
