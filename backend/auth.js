/**
 * Auto-login no Bitsler para obter o socketToken sem interação manual.
 *
 * Prioridade:
 *   1. BITSLER_API_KEY + BITSLER_USERNAME  (recomendado — não expira como o JWT)
 *   2. BITSLER_PASSWORD + BITSLER_2FA_SECRET (gera código TOTP automaticamente)
 *   3. SOCKET_TOKEN direto no .env (fallback manual)
 */

const https = require("https");
const http = require("http");
const logger = require("./modules/logger");

const LOGIN_URL = "https://www.bitsler.com/api/login";

// ─── TOTP (RFC 6238) ────────────────────────────────────────────────────────

function base32Decode(str) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of str.toUpperCase().replace(/=+$/, "")) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hmacSha1(key, data) {
  const crypto = require("crypto");
  return crypto.createHmac("sha1", key).update(data).digest();
}

function generateTOTP(secret, window = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + window;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const keyBuf = base32Decode(secret);
  const hash = hmacSha1(keyBuf, counterBuf);
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "Mozilla/5.0 (compatible; BitslerBot/1.0)",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            reject(new Error(`Resposta inválida: ${data}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function login() {
  const username = process.env.BITSLER_USERNAME;
  const apiKey = process.env.BITSLER_API_KEY;
  const password = process.env.BITSLER_PASSWORD;
  const twoFaSecret = process.env.BITSLER_2FA_SECRET;
  const fingerprint = process.env.BITSLER_FINGERPRINT || "00000000000000000000";

  // Fallback: socketToken já definido manualmente
  if (!username && process.env.SOCKET_TOKEN) {
    logger.info("[Auth] Usando SOCKET_TOKEN manual do .env");
    return process.env.SOCKET_TOKEN;
  }

  if (!username) {
    throw new Error("Configure BITSLER_USERNAME + BITSLER_API_KEY (ou BITSLER_PASSWORD) no .env");
  }

  let token;
  let twoFactor = "";

  if (apiKey) {
    token = apiKey;
    logger.info("[Auth] Login via API key...");
  } else if (password) {
    token = password;
    if (twoFaSecret) {
      // Tenta o código atual e, se necessário, o código do próximo window (+30s)
      twoFactor = generateTOTP(twoFaSecret);
      logger.info("[Auth] Login via senha + TOTP...");
    } else {
      logger.info("[Auth] Login via senha (sem 2FA)...");
    }
  } else {
    throw new Error("Defina BITSLER_API_KEY ou BITSLER_PASSWORD no .env");
  }

  const payload = { username, token, two_factor: twoFactor, fingerprint };
  const result = await postJson(LOGIN_URL, payload);

  if (result.status !== 200 || !result.body?.data) {
    // Tenta próximo window TOTP se der erro de 2FA
    if (twoFaSecret && result.body?.error?.includes("2fa")) {
      const nextCode = generateTOTP(twoFaSecret, 1);
      logger.warn(`[Auth] Código TOTP expirado, tentando próximo window: ${nextCode}`);
      const retry = await postJson(LOGIN_URL, { ...payload, two_factor: nextCode });
      if (retry.status === 200 && retry.body?.data) {
        return extractSocketToken(retry.body.data);
      }
    }
    throw new Error(`Login falhou (${result.status}): ${JSON.stringify(result.body)}`);
  }

  return extractSocketToken(result.body.data);
}

function extractSocketToken(data) {
  const socketToken = data?.socketToken || data?.user?.socketToken;
  if (!socketToken) {
    throw new Error(`socketToken não encontrado na resposta: ${JSON.stringify(data)}`);
  }
  logger.info("[Auth] Login bem-sucedido, socketToken obtido.");
  return socketToken;
}

// ─── Renovação automática ─────────────────────────────────────────────────────

let _cachedToken = null;
let _tokenObtainedAt = 0;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

async function getSocketToken(forceRefresh = false) {
  const now = Date.now();

  // Token manual no env: usa direto sem cache
  if (!process.env.BITSLER_USERNAME && process.env.SOCKET_TOKEN) {
    return process.env.SOCKET_TOKEN;
  }

  if (!forceRefresh && _cachedToken && now - _tokenObtainedAt < TOKEN_TTL_MS) {
    return _cachedToken;
  }

  _cachedToken = await login();
  _tokenObtainedAt = now;
  return _cachedToken;
}

function clearCache() {
  _cachedToken = null;
  _tokenObtainedAt = 0;
}

module.exports = { getSocketToken, clearCache };
