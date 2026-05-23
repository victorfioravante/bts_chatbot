/**
 * Autenticação no Bitsler — baseado no bitsler-auth.js confirmado do diceroll_pro.
 *
 * FLUXO CORRETO (API key + senha juntos, bypassa captcha):
 *   POST /api/login { username, password, api_key, two_factor, fingerprint }
 *
 * FLUXO FALLBACK (senha em dois passos, pode exigir captcha):
 *   Passo 1: POST { username, password, fingerprint }
 *            → retorna { data: { token: "<temp>" } }
 *   Passo 2: POST { username, token: <temp>, two_factor, fingerprint }
 *            → retorna tokens finais
 *
 * Variáveis de ambiente:
 *   BITSLER_USERNAME    — usuário da conta
 *   BITSLER_PASSWORD    — senha plaintext (necessária mesmo usando API key)
 *   BITSLER_API_KEY     — API key gerada em Bitsler → Configurações → API key
 *   BITSLER_2FA_SECRET  — secret TOTP base32 (gera código automaticamente)
 *   BITSLER_FINGERPRINT — visitorId/fingerprint do browser (20 chars)
 *   SOCKET_TOKEN        — fallback manual (extraído via DevTools)
 */

const https = require("https");
const http = require("http");
const crypto = require("crypto");
const logger = require("./modules/logger");

const LOGIN_URL = process.env.BITSLER_LOGIN_URL || "https://www.bitsler.com/api/login";

const FORM_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
  Origin: "https://www.bitsler.com",
  Referer: "https://www.bitsler.com/en/casino/games/dice",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// ─── TOTP (RFC 6238) ────────────────────────────────────────────────────────

function _base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.toUpperCase().replace(/[=\s]/g, "")) {
    const v = alphabet.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateTOTP(secret, digits = 6, period = 30) {
  const key = _base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[19] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;
  return code.toString().padStart(digits, "0");
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function rawPost(url, payload) {
  return new Promise((resolve, reject) => {
    const safe = { ...payload };
    if (safe.token) safe.token = safe.token.slice(0, 6) + "…";
    if (safe.password) safe.password = "***";
    if (safe.api_key) safe.api_key = safe.api_key.slice(0, 6) + "…";
    logger.debug(`[Auth] POST ${url.replace(/.*\/\/[^/]+/, "")} ${JSON.stringify(safe)}`);

    const body = new URLSearchParams(payload).toString();
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { ...FORM_HEADERS, "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const cookie = [].concat(res.headers["set-cookie"] || [])
            .map((c) => c.split(";")[0].trim())
            .filter(Boolean)
            .join("; ");

          logger.debug(`[Auth] HTTP ${res.status}: ${data.slice(0, 300)}`);

          let json;
          try { json = JSON.parse(data || "null"); } catch { json = null; }

          if (res.statusCode >= 400) {
            const e = new Error(`HTTP ${res.statusCode}: ${data.slice(0, 120)}`);
            e.status = res.statusCode;
            throw e;
          }

          if (!json || json?.success === false) {
            const errCode = json?.error ?? json?.error_code ?? "unknown";
            const e = new Error(errCode);
            e.status = 401;
            e.body = json;
            return reject(e);
          }

          resolve({ body: json, cookie });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractResult(body, cookie) {
  const data = body?.data ?? body ?? {};

  // Log all fields to identify which token is the socketToken
  logger.debug(`[Auth] Campos em data: ${Object.keys(data).join(", ")}`);
  logger.debug(`[Auth] data.socketToken=${data.socketToken ? data.socketToken.slice(0,20)+"…" : "undefined"}`);
  logger.debug(`[Auth] data.token=${data.token ? String(data.token).slice(0,20)+"…" : "undefined"}`);
  logger.debug(`[Auth] data.access_token=${data.access_token ? String(data.access_token).slice(0,20)+"…" : "undefined"}`);

  // socketToken para WebSocket é um JWT separado do access_token (REST)
  const socketToken = data.socketToken ?? data.socket_token ?? null;

  const usedField = data.socketToken ? "socketToken" : data.socket_token ? "socket_token" : "none";
  if (socketToken) logger.info(`[Auth] socketToken encontrado no campo '${usedField}'`);

  // access_token (hex) e token são para REST API — guardados separadamente
  const restToken = data.access_token ?? data.accessToken ?? data.token ?? "";

  if (!socketToken && !restToken && !cookie) return null;
  return {
    socketToken,     // JWT para WebSocket (null se não retornado pelo login)
    cookie,
    token: restToken,  // hex token para REST API
    sessionToken: data.sessionToken ?? data.session_token ?? "",
    uniqueToken: data.uniqueToken ?? data.unique_token ?? "",
    nextClient: data.nextClient ?? data.next_client ?? "",
  };
}

// ─── Busca socketToken via API autenticada ───────────────────────────────────

function getJson(url, accessToken, cookie) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const headers = {
      ...FORM_HEADERS,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    if (cookie) headers["Cookie"] = cookie;

    const req = lib.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "GET", headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: null }); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function fetchSocketTokenFromUserApi(accessToken, cookie) {
  const base = "https://www.bitsler.com";

  // Tenta múltiplos formatos de authorization header
  const authHeaders = [
    accessToken,              // token raw
    `Bearer ${accessToken}`,  // Bearer token
  ];

  const endpoints = [
    `${base}/api/users/me`,
    `${base}/api/user`,
    `${base}/api/users/info`,
    `${base}/api/chat/token`,
    `${base}/api/chat/auth`,
    `${base}/api/users/socket-token`,
    `${base}/api/auth/socket`,
  ];

  for (const authValue of authHeaders) {
    for (const url of endpoints) {
      try {
        const { status, body } = await getJson(url, authValue, cookie);
        // Log all fields to help find the socketToken
        if (status === 200 && body) {
          logger.debug(`[Auth] ${url} (${authValue.slice(0, 10)}…) → fields: ${Object.keys(body?.data ?? body ?? {}).join(", ")}`);
          const data = body?.data ?? body ?? {};
          const st = data.socketToken ?? data.socket_token ?? data.chatToken ?? data.chat_token;
          if (st) {
            logger.info(`[Auth] socketToken encontrado em ${url}`);
            return st;
          }
        } else if (status !== 404) {
          logger.debug(`[Auth] ${url} → HTTP ${status}`);
        }
      } catch (e) {
        logger.debug(`[Auth] ${url} erro: ${e.message}`);
      }
    }
  }

  logger.warn("[Auth] socketToken não encontrado nos endpoints. Verifique DevTools → Network → ws.bitsler.com → authorization header.");
  return null;
}

// ─── Fluxo de senha em dois passos ───────────────────────────────────────────

async function twoStepPassword(username, password, twoFactor, fingerprint) {
  logger.info("[Auth] Tentando senha (passo 1/2)...");
  const { body: body1, cookie: cookie1 } = await rawPost(LOGIN_URL, {
    username, password, fingerprint,
  });

  const data1 = body1?.data ?? body1 ?? {};

  if (data1.access_token ?? data1.accessToken ?? data1.socketToken) {
    return extractResult(body1, cookie1);
  }

  const interimToken = data1.token;
  if (!interimToken) {
    logger.warn("[Auth] Passo 1 não retornou token intermediário — provavelmente captcha necessário");
    return null;
  }

  if (!twoFactor) {
    logger.warn("[Auth] Servidor pediu 2FA mas BITSLER_2FA_SECRET não está configurado");
    return null;
  }

  logger.info("[Auth] Passo 2/2 — enviando TOTP...");
  const { body: body2, cookie: cookie2 } = await rawPost(LOGIN_URL, {
    username, token: interimToken, two_factor: twoFactor, fingerprint,
  });

  return extractResult(body2, cookie2);
}

// ─── Login principal ─────────────────────────────────────────────────────────

async function login() {
  const username    = process.env.BITSLER_USERNAME;
  const password    = process.env.BITSLER_PASSWORD;
  const apiKey      = process.env.BITSLER_API_KEY;
  const twoFaSecret = process.env.BITSLER_2FA_SECRET;
  const fingerprint = process.env.BITSLER_FINGERPRINT || "";

  // Fallback manual
  if (!username && process.env.SOCKET_TOKEN) {
    logger.info("[Auth] Usando SOCKET_TOKEN manual do .env");
    return process.env.SOCKET_TOKEN;
  }

  if (!username) {
    throw new Error(
      "Configure BITSLER_USERNAME + BITSLER_PASSWORD + BITSLER_API_KEY no .env"
    );
  }

  const twoFactor = twoFaSecret ? generateTOTP(twoFaSecret) : (process.env.BITSLER_2FA_CODE || "");

  // ── Fluxo 1: password + api_key juntos (sem captcha) ──
  if (password && apiKey) {
    const candidates = [];
    if (twoFactor) {
      candidates.push({
        label: "pw+apikey+2fa",
        payload: { username, password, api_key: apiKey, two_factor: twoFactor, fingerprint },
      });
    }
    candidates.push({
      label: "pw+apikey",
      payload: { username, password, api_key: apiKey, fingerprint },
    });

    for (const { label, payload } of candidates) {
      try {
        logger.info(`[Auth] Login via ${label}...`);
        const { body, cookie } = await rawPost(LOGIN_URL, payload);
        const result = extractResult(body, cookie);

        if (result?.socketToken) {
          logger.info("[Auth] Login OK — socketToken JWT obtido diretamente.");
          return result.socketToken;
        }

        // Bitsler retorna access_token (hex) no login — é o mesmo token usado
        // pelo WebSocket no header Authorization (confirmado pelo diceroll_pro).
        if (result?.token) {
          logger.info(`[Auth] Login OK (${label}) — usando access_token para WebSocket.`);
          return result.token;
        }

        logger.warn(`[Auth] ${label}: nenhum token utilizável na resposta`);
      } catch (e) {
        logger.warn(`[Auth] ${label} rejeitado: ${e.message}`);
        if (e.status !== 401 && e.status !== 422 && e.status !== 403) throw e;
      }
    }
  }

  // ── Fluxo 2: password sozinha em dois passos ──
  if (password && !apiKey) {
    try {
      const result = await twoStepPassword(username, password, twoFactor, fingerprint);
      if (result?.socketToken) {
        logger.info("[Auth] Login OK (dois passos).");
        return result.socketToken;
      }
    } catch (e) {
      logger.warn(`[Auth] Senha rejeitada: ${e.message}`);
      if (e.status !== 401 && e.status !== 422 && e.status !== 403) throw e;
    }
  }

  if (apiKey && !password) {
    throw new Error("BITSLER_API_KEY requer BITSLER_PASSWORD — configure os dois no .env");
  }

  throw new Error(
    "Login falhou. Verifique BITSLER_USERNAME, BITSLER_PASSWORD e BITSLER_API_KEY no .env"
  );
}

// ─── Cache e renovação automática ────────────────────────────────────────────

let _cachedToken = null;
let _tokenObtainedAt = 0;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

async function getSocketToken(forceRefresh = false) {
  // SOCKET_TOKEN manual só é usado quando NÃO há credenciais configuradas.
  // Se USERNAME+PASSWORD estiverem no .env, o login automático tem prioridade
  // para evitar loop com token expirado.
  const hasCredentials = process.env.BITSLER_USERNAME && process.env.BITSLER_PASSWORD;
  if (!hasCredentials && process.env.SOCKET_TOKEN) {
    logger.info("[Auth] Usando SOCKET_TOKEN manual do .env");
    return process.env.SOCKET_TOKEN;
  }

  const now = Date.now();
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

module.exports = { getSocketToken, clearCache, generateTOTP };
