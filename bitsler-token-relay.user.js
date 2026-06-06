// ==UserScript==
// @name         Bitsler Token Relay
// @namespace    bitsler-token-relay
// @version      3.0.0
// @description  Captura o socketToken do Bitsler e envia automaticamente ao bot local
// @author       victorfioravante
// @match        https://www.bitsler.com/*
// @match        https://bitsler.com/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const BOT_URL      = 'http://localhost:3001';
  const SEND_DELAY   = 600;
  const RESEND_AFTER = 55 * 60 * 1000; // reenvia após 55min (renovação)

  // ── Estado ───────────────────────────────────────────────────────────────────
  let _socketToken = null;
  let _fingerprint = null;
  let _source      = null;
  let _lastSent    = null;
  let _lastSentAt  = 0;
  let _sendTimer   = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function isToken(v) {
    return typeof v === 'string' && v.length > 15 && !/\s/.test(v) && !v.startsWith('http');
  }

  // Busca recursiva por uma chave específica num objeto
  function findKey(obj, key, depth) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;
    if (key in obj && isToken(obj[key])) return obj[key];
    for (const k of Object.keys(obj)) {
      const r = findKey(obj[k], key, depth + 1);
      if (r) return r;
    }
    return null;
  }

  // ── Intercepta responses do fetch para capturar socketToken ─────────────────
  // O socketToken aparece na resposta do login/auth, não no body do request.
  // access_token (REST) ≠ socketToken (WebSocket) — são tokens distintos!
  const _origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const promise = _origFetch.apply(this, arguments);

    // Só inspeciona respostas de endpoints que podem retornar socketToken
    if (url.includes('/api/')) {
      promise.then(res => {
        // Clone para não consumir o body original
        res.clone().json().then(data => {
          captureFromObject(data, 'fetch-response');
        }).catch(() => {});
      }).catch(() => {});
    }

    return promise;
  };

  // Intercepta XHR responses também
  const _OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new _OrigXHR();
    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (m, u) { xhr._url = u; return origOpen.apply(this, arguments); };

    xhr.addEventListener('load', function () {
      if (!xhr._url?.includes('/api/')) return;
      try {
        const data = JSON.parse(xhr.responseText);
        captureFromObject(data, 'xhr-response');
      } catch {}
    });

    return xhr;
  };
  window.XMLHttpRequest.prototype = _OrigXHR.prototype;

  // Procura socketToken (e fingerprint) num objeto de resposta da API
  function captureFromObject(data, source) {
    if (!data || typeof data !== 'object') return;

    // Caminho direto mais comum: data.socketToken ou data.user.socketToken
    const st =
      data?.socketToken ||
      data?.data?.socketToken ||
      data?.user?.socketToken ||
      data?.chat?.user?.socketToken ||
      findKey(data, 'socketToken', 0);

    if (st && isToken(st) && st !== _socketToken) {
      _socketToken = st;
      _source = source;

      // Tenta pegar fingerprint junto
      _fingerprint =
        data?.fingerprint ||
        data?.fp ||
        data?.data?.fingerprint ||
        data?.user?.fingerprint ||
        findKey(data, 'fingerprint', 0) ||
        _fingerprint;

      console.info(`[BTR] socketToken capturado via ${source}:`, st.slice(0, 12) + '…');
      scheduleSend();
    }
  }

  // ── Busca no Vue store (watcher periódico) ───────────────────────────────────
  function searchStore() {
    try {
      // Caminho direto — mais confiável
      const store = window.__vue_store__;
      if (store?.state?.chat?.user?.socketToken) {
        const st = store.state.chat.user.socketToken;
        const fp = store.state.chat.user.fingerprint || null;
        if (isToken(st)) return { token: st, fp, source: 'store-direct' };
      }
    } catch {}

    try {
      // Vue 3
      const app = window.__vue_app__ || document.querySelector('#app')?.__vue_app__;
      if (app) {
        const st = findKey(app.config?.globalProperties?.$store?.state, 'socketToken', 0);
        if (st) return { token: st, fp: null, source: 'vue3-store' };
      }
    } catch {}

    try {
      // localStorage / sessionStorage (algumas versões salvam)
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i); if (!k) continue;
          const v = storage.getItem(k); if (!v) continue;
          if (k === 'socketToken' && isToken(v)) return { token: v, fp: null, source: 'storage-key' };
          if (v.startsWith('{')) {
            try {
              const st = findKey(JSON.parse(v), 'socketToken', 0);
              if (st) return { token: st, fp: null, source: 'storage-json' };
            } catch {}
          }
        }
      }
    } catch {}

    return null;
  }

  // ── Envio ao bot ─────────────────────────────────────────────────────────────
  function scheduleSend() {
    if (_sendTimer) clearTimeout(_sendTimer);
    _sendTimer = setTimeout(() => doSend(false), SEND_DELAY);
  }

  function doSend(force) {
    if (!_socketToken) return;
    if (!force && _socketToken === _lastSent) return;

    setStatus('pending', 'Enviando…');

    const payload = { token: _socketToken, autoConnect: true };
    if (_fingerprint) payload.fingerprint = _fingerprint;

    fetch(`${BOT_URL}/api/v1/socket-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          _lastSent   = _socketToken;
          _lastSentAt = Date.now();
          setStatus('ok', '✓ Conectado');
          console.info(`[BTR] ✓ Token enviado (${_source})`, data.isNew ? '— novo' : '— mesmo');
        } else {
          setStatus('error', 'Rejeitado');
          console.warn('[BTR] Bot rejeitou:', data.error);
        }
      })
      .catch(() => {
        setStatus('error', 'Bot offline?');
      });
  }

  // ── Watcher periódico ────────────────────────────────────────────────────────
  function startWatcher() {
    let ticks = 0;
    setInterval(() => {
      ticks++;

      // Tenta store a cada tick enquanto não tiver token
      if (!_socketToken) {
        const found = searchStore();
        if (found) {
          _socketToken = found.token;
          _fingerprint = found.fp || _fingerprint;
          _source      = found.source;
          console.info(`[BTR] socketToken encontrado no store (${found.source}):`, found.token.slice(0, 12) + '…');
          scheduleSend();
        }
        return;
      }

      // Tem token — verifica se mudou no store
      const found = searchStore();
      if (found && found.token !== _socketToken) {
        console.info('[BTR] socketToken rotacionado — reenviando…');
        _socketToken = found.token;
        _fingerprint = found.fp || _fingerprint;
        _source      = found.source + '-rotation';
        scheduleSend();
        return;
      }

      // Reenvia periodicamente para cobrir reconexões do bot
      if (Date.now() - _lastSentAt > RESEND_AFTER) {
        console.info('[BTR] Reenvio periódico (55min)');
        doSend(true);
      }
    }, 4000);
  }

  // ── Badge UI ─────────────────────────────────────────────────────────────────
  const STYLES = `
    #btr{position:fixed;bottom:16px;right:16px;z-index:2147483647;
      display:flex;align-items:center;gap:6px;
      background:#0f172a;border:1px solid #1e293b;border-radius:999px;
      padding:5px 11px 5px 7px;font:11px/1 ui-monospace,monospace;
      color:#94a3b8;cursor:pointer;user-select:none;
      box-shadow:0 4px 16px rgba(0,0,0,.6);transition:opacity .15s}
    #btr:hover{opacity:.8}
    #btr-d{width:7px;height:7px;border-radius:50%;background:#475569;flex-shrink:0;transition:background .25s}
    #btr-d.ok{background:#22c55e;box-shadow:0 0 5px #22c55e99}
    #btr-d.error{background:#ef4444;box-shadow:0 0 5px #ef444499}
    #btr-d.pending{background:#f59e0b;animation:btr-p .7s ease-in-out infinite alternate}
    @keyframes btr-p{from{opacity:1}to{opacity:.25}}
  `;

  function createBadge() {
    const s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);

    const el = document.createElement('div');
    el.id = 'btr';
    el.innerHTML = '<span id="btr-d"></span><span id="btr-l">Bot Relay</span>';
    el.title = 'Bitsler Token Relay — clique para forçar envio';
    el.onclick = () => {
      // Clique: força busca no store + envia
      const found = searchStore();
      if (found) {
        _socketToken = found.token;
        _fingerprint = found.fp || _fingerprint;
        _source      = found.source + '-manual';
      }
      doSend(true);
    };
    document.body.appendChild(el);
  }

  function setStatus(state, text) {
    const d = document.getElementById('btr-d');
    const l = document.getElementById('btr-l');
    if (d) d.className = state;
    if (l) l.textContent = text;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function boot() {
    createBadge();
    setStatus('pending', 'Aguardando…');
    startWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
