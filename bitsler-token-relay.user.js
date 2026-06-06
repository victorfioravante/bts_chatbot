// ==UserScript==
// @name         Bitsler Token Relay
// @namespace    bitsler-token-relay
// @version      2.0.0
// @description  Intercepta o access_token do Bitsler e envia automaticamente ao bot local
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
  const SEND_DELAY   = 800;   // ms após capturar antes de enviar (evita flood)
  const RESEND_AFTER = 55 * 60 * 1000; // reenvia se ficar 55min sem enviar (renovação)

  // ── Estado ──────────────────────────────────────────────────────────────────
  let _token       = null;
  let _source      = null;   // 'intercept' | 'store' | 'storage'
  let _lastSent    = null;
  let _lastSentAt  = 0;
  let _sendTimer   = null;
  let _badge       = null;

  // ── Extração de token de qualquer formato de body/header ────────────────────
  function tryExtract(body, headers) {
    // body string form-encoded
    if (typeof body === 'string' && body.includes('access_token')) {
      const t = new URLSearchParams(body).get('access_token');
      if (t && t.length > 10) return t;
    }
    // body JSON
    if (typeof body === 'string' && body.startsWith('{')) {
      try { const t = JSON.parse(body)?.access_token; if (t) return t; } catch {}
    }
    // URLSearchParams
    if (body instanceof URLSearchParams) {
      const t = body.get('access_token'); if (t) return t;
    }
    // FormData
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const t = body.get?.('access_token'); if (t) return t;
    }
    // Authorization header
    const auth = (headers?.['Authorization'] || headers?.['authorization'] || '');
    if (auth) {
      const t = auth.replace(/^Bearer\s+/i, '');
      if (t.length > 10) return t;
    }
    return null;
  }

  // ── Monkey-patch fetch ───────────────────────────────────────────────────────
  // Roda em document-start, antes de qualquer código Bitsler — intercepta tudo
  const _origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.includes('/api/')) {
      const t = tryExtract(init?.body, init?.headers);
      if (t && t !== _token) { _token = t; _source = 'intercept'; scheduleSend(); }
    }
    return _origFetch.apply(this, arguments);
  };

  // ── Monkey-patch XMLHttpRequest ──────────────────────────────────────────────
  const _OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new _OrigXHR();
    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (m, u) { xhr._url = u; return origOpen.apply(this, arguments); };
    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      if (xhr._url?.includes('/api/')) {
        const t = tryExtract(body, {});
        if (t && t !== _token) { _token = t; _source = 'intercept'; scheduleSend(); }
      }
      return origSend.apply(this, arguments);
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = _OrigXHR.prototype;

  // ── Busca no Vue store / localStorage (fallback) ────────────────────────────
  function isToken(v) {
    return typeof v === 'string' && v.length > 15 && !v.includes(' ') && !v.startsWith('http');
  }

  function findInObj(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return null;
    for (const k of Object.keys(obj)) {
      const kl = k.toLowerCase();
      if ((kl.includes('token') || kl.includes('access')) && isToken(obj[k])) return obj[k];
      const r = findInObj(obj[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  function searchStore() {
    // Vue 2
    try {
      if (window.__vue_store__) {
        const t = findInObj(window.__vue_store__.state, 0);
        if (t) return { token: t, source: 'store' };
      }
    } catch {}
    // Vue 3
    try {
      const app = window.__vue_app__ || document.querySelector('#app')?.__vue_app__;
      if (app) {
        const t = findInObj(app.config?.globalProperties?.$store?.state, 0);
        if (t) return { token: t, source: 'store' };
      }
    } catch {}
    // localStorage / sessionStorage
    for (const st of [localStorage, sessionStorage]) {
      try {
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i); if (!k) continue;
          const kl = k.toLowerCase();
          const v = st.getItem(k); if (!v) continue;
          if ((kl.includes('token') || kl.includes('access')) && isToken(v))
            return { token: v, source: 'storage' };
          if (v.startsWith('{')) {
            try {
              const t = findInObj(JSON.parse(v), 0);
              if (t) return { token: t, source: 'storage' };
            } catch {}
          }
        }
      } catch {}
    }
    return null;
  }

  // ── Envio ao bot ─────────────────────────────────────────────────────────────
  function scheduleSend() {
    if (_sendTimer) clearTimeout(_sendTimer);
    _sendTimer = setTimeout(doSend, SEND_DELAY);
  }

  function doSend(force = false) {
    if (!_token) return;
    if (!force && _token === _lastSent) return;

    setStatus('pending', 'Enviando…');

    // @grant none: usa fetch normal — funciona para localhost (sem CORS restrito)
    fetch(`${BOT_URL}/api/v1/socket-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token: _token, autoConnect: true }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          _lastSent   = _token;
          _lastSentAt = Date.now();
          setStatus('ok', `✓ Token enviado`);
          console.info(`[BTR] Token enviado (${_source})`, data.isNew ? '— novo' : '— já conhecido');
        } else {
          setStatus('error', 'Rejeitado');
          console.warn('[BTR] Bot rejeitou:', data.error);
        }
      })
      .catch(() => {
        setStatus('error', 'Bot offline?');
        console.warn('[BTR] Bot não respondeu em', BOT_URL);
      });
  }

  // ── Watcher periódico: tenta store se intercept ainda não pegou ──────────────
  function startWatcher() {
    setInterval(() => {
      // Já capturou por intercept — só reenvia se ficar muito tempo sem enviar
      if (_token) {
        if (Date.now() - _lastSentAt > RESEND_AFTER) doSend(true);
        return;
      }
      // Ainda não tem token — tenta store/storage
      const found = searchStore();
      if (found) {
        _token  = found.token;
        _source = found.source;
        scheduleSend();
      }
    }, 5000);
  }

  // ── Badge ─────────────────────────────────────────────────────────────────────
  const STYLES = `
    #btr {
      position:fixed; bottom:16px; right:16px; z-index:2147483647;
      display:flex; align-items:center; gap:6px;
      background:#0f172a; border:1px solid #1e293b; border-radius:999px;
      padding:5px 11px 5px 7px; font:11px/1 ui-monospace,monospace;
      color:#94a3b8; cursor:pointer; user-select:none;
      box-shadow:0 4px 16px rgba(0,0,0,.6); transition:opacity .15s;
    }
    #btr:hover { opacity:.8; }
    #btr-d {
      width:7px; height:7px; border-radius:50%; background:#475569; flex-shrink:0;
      transition:background .25s;
    }
    #btr-d.ok      { background:#22c55e; box-shadow:0 0 5px #22c55e99; }
    #btr-d.error   { background:#ef4444; box-shadow:0 0 5px #ef444499; }
    #btr-d.pending { background:#f59e0b; animation:btr-p .7s ease-in-out infinite alternate; }
    @keyframes btr-p { from{opacity:1} to{opacity:.25} }
  `;

  function createBadge() {
    const s = document.createElement('style'); s.textContent = STYLES;
    document.head.appendChild(s);
    _badge = document.createElement('div'); _badge.id = 'btr';
    _badge.innerHTML = '<span id="btr-d"></span><span id="btr-l">Bot Relay</span>';
    _badge.title = 'Bitsler Token Relay — clique para forçar envio';
    _badge.onclick = () => { const f = searchStore(); if (f) { _token = f.token; _source = f.source; } doSend(true); };
    document.body.appendChild(_badge);
  }

  function setStatus(state, text) {
    const d = document.getElementById('btr-d');
    const l = document.getElementById('btr-l');
    if (!d) return;
    d.className = state;
    if (l) l.textContent = text;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  // Patches já aplicados em document-start.
  // Badge e watcher sobem quando o DOM fica pronto.
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
