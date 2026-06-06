// ==UserScript==
// @name         Bitsler Token Relay
// @namespace    bitsler-token-relay
// @version      4.0.0
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

  // ── Configuração ─────────────────────────────────────────────────────────────
  const BOT_URL      = GM_getValue('botUrl', 'http://localhost:3001');
  const RESEND_AFTER = 55 * 60 * 1000;

  let _lastSent   = null;
  let _lastSentAt = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // PARTE 1 — Código injetado na página (Main World)
  // Roda no contexto real do site, tem acesso a window.__vue_store__, fetch, XHR.
  // Comunica com o script Tampermonkey via CustomEvent.
  // ─────────────────────────────────────────────────────────────────────────────
  function injectPageScript() {
    const script = document.createElement('script');
    script.setAttribute('data-btr', '1');
    script.textContent = `(function() {
  'use strict';

  function emit(token, fp, source) {
    window.dispatchEvent(new CustomEvent('__btr_token__', {
      detail: { token: token, fp: fp || null, source: source }
    }));
  }

  function isToken(v) {
    return typeof v === 'string' && v.length > 15 && !/\\s/.test(v) && !v.startsWith('http');
  }

  // Busca socketToken no Vue store (caminho direto)
  function fromStore() {
    try {
      // Vue 2 global store
      var s = window.__vue_store__;
      if (s && s.state && s.state.chat && s.state.chat.user) {
        var u = s.state.chat.user;
        if (isToken(u.socketToken)) return { t: u.socketToken, fp: u.fingerprint || null };
      }
    } catch(e) {}
    try {
      // Vue 3
      var app = window.__vue_app__ || (document.querySelector('#app') && document.querySelector('#app').__vue_app__);
      if (app && app.config && app.config.globalProperties && app.config.globalProperties.$store) {
        var st = app.config.globalProperties.$store.state;
        if (st && st.chat && st.chat.user && isToken(st.chat.user.socketToken)) {
          return { t: st.chat.user.socketToken, fp: st.chat.user.fingerprint || null };
        }
      }
    } catch(e) {}
    return null;
  }

  // Intercepta respostas fetch para capturar socketToken
  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var result = _origFetch.apply(this, arguments);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') !== -1) {
      result.then(function(res) {
        res.clone().json().then(function(data) {
          var st = data && (data.socketToken || (data.data && data.data.socketToken) || (data.user && data.user.socketToken));
          var fp = data && (data.fingerprint || (data.user && data.user.fingerprint));
          if (st && isToken(st)) emit(st, fp, 'fetch-response');
        }).catch(function(){});
      }).catch(function(){});
    }
    return result;
  };

  // Intercepta XHR responses
  var _OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    var xhr = new _OrigXHR();
    xhr.addEventListener('load', function() {
      try {
        var data = JSON.parse(xhr.responseText);
        var st = data && (data.socketToken || (data.data && data.data.socketToken) || (data.user && data.user.socketToken));
        var fp = data && (data.fingerprint || (data.user && data.user.fingerprint));
        if (st && isToken(st)) emit(st, fp, 'xhr-response');
      } catch(e) {}
    });
    return xhr;
  };
  window.XMLHttpRequest.prototype = _OrigXHR.prototype;

  // Watcher: verifica store a cada 2s
  var _lastEmit = null;
  setInterval(function() {
    var found = fromStore();
    if (found && found.t !== _lastEmit) {
      _lastEmit = found.t;
      emit(found.t, found.fp, 'store-watch');
    }
  }, 2000);

  // Diagnóstico global (rode __btrPageDiag() no console)
  window.__btrPageDiag = function() {
    var s = window.__vue_store__;
    console.group('[BTR-page] diagnóstico Main World');
    console.log('__vue_store__?', !!s);
    if (s) {
      console.log('state keys:', Object.keys(s.state || {}));
      console.log('socketToken?', s.state && s.state.chat && s.state.chat.user && s.state.chat.user.socketToken
        ? s.state.chat.user.socketToken.slice(0,12) + '...' : 'não encontrado');
    }
    console.log('fromStore():', fromStore());
    console.groupEnd();
  };

  console.log('[BTR-page] injetado no Main World — rode __btrPageDiag() para diagnóstico');
})();`;

    // Injeta antes de qualquer outro script carregar
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  // Injeta imediatamente (document-start)
  injectPageScript();

  // ─────────────────────────────────────────────────────────────────────────────
  // PARTE 2 — Código Tampermonkey (Isolated World)
  // Recebe CustomEvents da página e usa GM_xmlhttpRequest para enviar ao bot.
  // ─────────────────────────────────────────────────────────────────────────────

  // Recebe token da página via CustomEvent
  window.addEventListener('__btr_token__', function(e) {
    const { token, fp, source } = e.detail || {};
    if (!token || token === _lastSent) return;

    console.info('[BTR] token recebido via', source, '→', token.slice(0,12) + '…');
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
            console.info(`[BTR] ✓ enviado (${source})`, data.isNew ? '— novo' : '— mesmo');
          } else {
            setStatus('error', 'Rejeitado');
            console.warn('[BTR] bot rejeitou:', data.error);
          }
        } catch {
          setStatus('error', 'Resposta inválida');
        }
      },
      onerror()  { setStatus('error', 'Bot offline?'); },
      ontimeout(){ setStatus('error', 'Timeout'); },
    });
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
    (document.head || document.documentElement).appendChild(s);

    const el = document.createElement('div');
    el.id = 'btr';
    el.innerHTML = '<span id="btr-d"></span><span id="btr-l">Bot Relay</span>';
    el.title = 'Bitsler Token Relay — clique para forçar reenvio';
    el.onclick = () => {
      // Dispara diagnóstico no Main World via script injetado
      const s2 = document.createElement('script');
      s2.textContent = 'if(window.__btrPageDiag) __btrPageDiag();';
      document.documentElement.appendChild(s2);
      s2.remove();
      // Se já tem token, reenvia
      if (_lastSent) sendToken(_lastSent, null, 'manual-click');
    };
    document.documentElement.appendChild(el);
  }

  function setStatus(state, text) {
    const d = document.getElementById('btr-d');
    const l = document.getElementById('btr-l');
    if (d) d.className = state;
    if (l) l.textContent = text;
  }

  // Badge aparece quando DOM tiver body
  function waitForBody() {
    if (document.body) {
      document.body.appendChild(document.getElementById('btr') || (() => {
        const el = document.createElement('div');
        el.id = 'btr';
        return el;
      })());
    }
  }

  function boot() {
    createBadge();
    setStatus('pending', 'Aguardando…');
    console.info('[BTR] pronto — rode __btrPageDiag() no console para diagnóstico');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
