// ==UserScript==
// @name         Bitsler Token Relay
// @namespace    bitsler-token-relay
// @version      5.0.0
// @description  Captura o socketToken do Bitsler e envia automaticamente ao bot local
// @author       victorfioravante
// @match        https://www.bitsler.com/*
// @match        https://bitsler.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const BOT_URL      = GM_getValue('botUrl', 'http://localhost:3001');
  const RESEND_AFTER = 55 * 60 * 1000;

  let _lastSent   = null;
  let _lastSentAt = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Script injetado no Main World da página
  // Intercepta fetch/XHR para capturar o header "authorization" que o próprio
  // Bitsler envia ao conectar no Socket.IO (ws.bitsler.com/chat/).
  // O mesmo token usado pelo site é o que nosso bot precisa.
  // ─────────────────────────────────────────────────────────────────────────────
  function injectPageScript() {
    const code = `(function() {
  'use strict';

  var _emitted = null;

  function isToken(v) {
    return typeof v === 'string' && v.length > 15 && !/\\s/.test(v) && !v.startsWith('http');
  }

  function emit(token, fp, source) {
    if (token === _emitted) return;
    _emitted = token;
    window.dispatchEvent(new CustomEvent('__btr__', {
      detail: { token: token, fp: fp || null, source: source }
    }));
    console.log('[BTR-page] token capturado via', source, token.slice(0,12) + '...');
  }

  // Normaliza headers (pode ser objeto ou Headers)
  function getHeader(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase());
    return headers[name] || headers[name.toLowerCase()] || null;
  }

  // Verifica se URL é de conexão Socket.IO do Bitsler
  function isSocketUrl(url) {
    return typeof url === 'string' && (
      url.indexOf('ws.bitsler.com') !== -1 ||
      url.indexOf('/chat/?') !== -1 ||
      url.indexOf('/chat/') !== -1
    );
  }

  // ── Intercepta fetch ────────────────────────────────────────────────────────
  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var headers = (init && init.headers) || {};

    // Captura authorization header dos requests ao Socket.IO
    var auth = getHeader(headers, 'authorization');
    var fp   = getHeader(headers, 'fp');
    if (auth && isToken(auth) && isSocketUrl(url)) {
      emit(auth, fp, 'ws-fetch-header');
    }

    // Captura socketToken de respostas JSON de qualquer /api/
    var prom = _origFetch.apply(this, arguments);
    if (url.indexOf('/api/') !== -1 || url.indexOf('bitsler.com') !== -1) {
      prom.then(function(res) {
        res.clone().json().then(function(data) {
          var st = data && (
            data.socketToken ||
            (data.data && data.data.socketToken) ||
            (data.user && data.user.socketToken)
          );
          var rfp = data && (data.fingerprint || (data.user && data.user.fingerprint));
          if (st && isToken(st)) emit(st, rfp, 'fetch-response');
        }).catch(function(){});
      }).catch(function(){});
    }
    return prom;
  };

  // ── Intercepta XHR ──────────────────────────────────────────────────────────
  var _OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    var xhr = new _OrigXHR();
    var _url = '';
    var _auth = null;
    var _fp = null;

    var origOpen = xhr.open.bind(xhr);
    xhr.open = function(m, u) { _url = u; return origOpen.apply(this, arguments); };

    var origSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function(name, value) {
      var nl = name.toLowerCase();
      if (nl === 'authorization') _auth = value;
      if (nl === 'fp') _fp = value;
      return origSetHeader.apply(this, arguments);
    };

    var origSend = xhr.send.bind(xhr);
    xhr.send = function(body) {
      // Captura auth header no momento do envio (Socket.IO polling)
      if (_auth && isToken(_auth) && isSocketUrl(_url)) {
        emit(_auth, _fp, 'ws-xhr-header');
      }
      return origSend.apply(this, arguments);
    };

    // Captura socketToken na resposta
    xhr.addEventListener('load', function() {
      try {
        var data = JSON.parse(xhr.responseText);
        var st = data && (
          data.socketToken ||
          (data.data && data.data.socketToken) ||
          (data.user && data.user.socketToken)
        );
        var rfp = data && (data.fingerprint || (data.user && data.user.fingerprint));
        if (st && isToken(st)) emit(st, rfp, 'xhr-response');
      } catch(e) {}
    });

    return xhr;
  };
  window.XMLHttpRequest.prototype = _OrigXHR.prototype;

  // ── Watcher: tenta múltiplas fontes a cada 3s ────────────────────────────────
  function scanAll() {
    // Vue store (qualquer versão)
    var paths = [
      function() { return window.__vue_store__ && window.__vue_store__.state && window.__vue_store__.state.chat && window.__vue_store__.state.chat.user && { t: window.__vue_store__.state.chat.user.socketToken, fp: window.__vue_store__.state.chat.user.fingerprint }; },
      function() { var a = window.__vue_app__ || (document.querySelector('#app') && document.querySelector('#app').__vue_app__); return a && a.config && a.config.globalProperties && a.config.globalProperties.$store && a.config.globalProperties.$store.state && a.config.globalProperties.$store.state.chat && a.config.globalProperties.$store.state.chat.user && { t: a.config.globalProperties.$store.state.chat.user.socketToken, fp: a.config.globalProperties.$store.state.chat.user.fingerprint }; },
    ];
    for (var i = 0; i < paths.length; i++) {
      try {
        var r = paths[i]();
        if (r && isToken(r.t)) { emit(r.t, r.fp, 'store-scan'); return; }
      } catch(e) {}
    }

    // localStorage / sessionStorage
    var stores = [localStorage, sessionStorage];
    for (var s = 0; s < stores.length; s++) {
      try {
        for (var k = 0; k < stores[s].length; k++) {
          var key = stores[s].key(k);
          var val = stores[s].getItem(key);
          if (!val) continue;
          if (key === 'socketToken' && isToken(val)) { emit(val, null, 'storage-key'); return; }
          if (val.charAt(0) === '{') {
            try {
              var obj = JSON.parse(val);
              var st2 = obj && (obj.socketToken || (obj.user && obj.user.socketToken) || (obj.chat && obj.chat.user && obj.chat.user.socketToken));
              if (st2 && isToken(st2)) { emit(st2, null, 'storage-json'); return; }
            } catch(e) {}
          }
        }
      } catch(e) {}
    }

    // Cookies (alguns tokens ficam em cookie)
    try {
      var cookies = document.cookie.split(';');
      for (var c = 0; c < cookies.length; c++) {
        var parts = cookies[c].trim().split('=');
        var cname = parts[0].toLowerCase();
        var cval = parts.slice(1).join('=');
        if (cname.indexOf('token') !== -1 && isToken(cval)) {
          emit(decodeURIComponent(cval), null, 'cookie'); return;
        }
      }
    } catch(e) {}
  }

  setInterval(scanAll, 3000);
  setTimeout(scanAll, 500); // tenta cedo tb

  // Diagnóstico global
  window.__btrPageDiag = function() {
    console.group('[BTR-page] diagnóstico');
    console.log('__vue_store__:', typeof window.__vue_store__, !!window.__vue_store__);
    console.log('__vue_app__:', !!window.__vue_app__);
    console.log('socketToken via store:', (function() {
      try { return window.__vue_store__ && window.__vue_store__.state.chat.user.socketToken; } catch(e) { return 'erro: ' + e.message; }
    })());
    var lsKeys = [];
    try { for (var i=0; i<localStorage.length; i++) lsKeys.push(localStorage.key(i)); } catch(e) {}
    console.log('localStorage keys:', lsKeys);
    console.log('cookie names:', document.cookie.split(';').map(function(c){return c.split('=')[0].trim();}));
    console.groupEnd();
  };

  console.log('[BTR-page] v5 ativo no Main World — rode __btrPageDiag() para diagnóstico');
})();`;

    const el = document.createElement('script');
    el.textContent = code;
    (document.head || document.documentElement).appendChild(el);
    el.remove();
  }

  injectPageScript();

  // ─────────────────────────────────────────────────────────────────────────────
  // Recebe token via CustomEvent e envia ao bot
  // ─────────────────────────────────────────────────────────────────────────────
  window.addEventListener('__btr__', function(e) {
    const { token, fp, source } = e.detail || {};
    if (!token || token === _lastSent) return;
    sendToken(token, fp, source);
  });

  function sendToken(token, fp, source) {
    setStatus('pending', 'Enviando…');
    const payload = { token, autoConnect: true };
    if (fp) payload.fingerprint = fp;

    GM_xmlhttpRequest({
      method:  'POST',
      url:     `${BOT_URL}/api/v1/socket-token`,
      headers: { 'Content-Type': 'application/json' },
      data:    JSON.stringify(payload),
      timeout: 8000,
      onload(res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.ok) {
            _lastSent   = token;
            _lastSentAt = Date.now();
            setStatus('ok', '✓ Conectado');
            console.info(`[BTR] ✓ (${source})`, data.isNew ? 'novo' : 'mesmo');
          } else {
            setStatus('error', 'Rejeitado');
          }
        } catch { setStatus('error', 'Erro'); }
      },
      onerror()  { setStatus('error', 'Bot offline?'); },
      ontimeout(){ setStatus('error', 'Timeout'); },
    });
  }

  // ── Badge ─────────────────────────────────────────────────────────────────────
  const CSS = `#btr{position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:6px;background:#0f172a;border:1px solid #1e293b;border-radius:999px;padding:5px 11px 5px 7px;font:11px/1 ui-monospace,monospace;color:#94a3b8;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(0,0,0,.6)}#btr:hover{opacity:.8}#btr-d{width:7px;height:7px;border-radius:50%;background:#475569;flex-shrink:0}#btr-d.ok{background:#22c55e;box-shadow:0 0 5px #22c55e99}#btr-d.error{background:#ef4444;box-shadow:0 0 5px #ef444499}#btr-d.pending{background:#f59e0b;animation:btr-p .7s ease-in-out infinite alternate}@keyframes btr-p{from{opacity:1}to{opacity:.25}}`;

  function boot() {
    const s = document.createElement('style'); s.textContent = CSS;
    document.head.appendChild(s);
    const el = document.createElement('div'); el.id = 'btr';
    el.innerHTML = '<span id="btr-d"></span><span id="btr-l">Bot Relay</span>';
    el.title = 'clique para reenviar';
    el.onclick = () => { if (_lastSent) sendToken(_lastSent, null, 'manual'); };
    document.body.appendChild(el);
    setStatus('pending', 'Aguardando…');
  }

  function setStatus(state, text) {
    const d = document.getElementById('btr-d');
    const l = document.getElementById('btr-l');
    if (d) d.className = state;
    if (l) l.textContent = text;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
