// ==UserScript==
// @name         Bitsler Token Relay
// @namespace    bitsler-token-relay
// @version      1.0.0
// @description  Extrai automaticamente o socketToken do Bitsler e envia ao bot local
// @author       victorfioravante
// @match        https://www.bitsler.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuração ─────────────────────────────────────────────────────────
  const DEFAULTS = {
    botUrl:        'http://localhost:3001',  // URL base do bot
    autoSend:      true,                     // envia automaticamente ao detectar token
    watchInterval: 60,                       // verifica mudanças a cada N segundos
    sendOnChange:  true,                     // reenvia se o token mudar
  };

  function cfg(key) {
    return GM_getValue(key, DEFAULTS[key]);
  }

  // ─── Estado ───────────────────────────────────────────────────────────────
  let lastSentToken = null;
  let statusEl      = null;
  let watchTimer    = null;

  // ─── Estilos ──────────────────────────────────────────────────────────────
  GM_addStyle(`
    #btr-badge {
      position: fixed;
      bottom: 18px;
      right: 18px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 7px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 999px;
      padding: 6px 12px 6px 8px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 4px 16px rgba(0,0,0,.5);
      transition: opacity .2s;
    }
    #btr-badge:hover { opacity: .85; }
    #btr-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #475569;
      flex-shrink: 0;
      transition: background .3s;
    }
    #btr-dot.ok      { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
    #btr-dot.error   { background: #ef4444; box-shadow: 0 0 6px #ef444488; }
    #btr-dot.pending { background: #f59e0b; box-shadow: 0 0 6px #f59e0b88; }
    #btr-dot.pulse   { animation: btr-pulse .8s ease-in-out infinite alternate; }
    @keyframes btr-pulse {
      from { opacity: 1; } to { opacity: .3; }
    }
  `);

  // ─── Badge ─────────────────────────────────────────────────────────────────
  function createBadge() {
    const el = document.createElement('div');
    el.id = 'btr-badge';
    el.innerHTML = `<span id="btr-dot"></span><span id="btr-label">Bot Relay</span>`;
    el.title = 'Bitsler Token Relay — clique para enviar agora';
    el.addEventListener('click', () => sendToken(true));
    document.body.appendChild(el);
    statusEl = el;
    return el;
  }

  function setStatus(state, text) {
    const dot   = document.getElementById('btr-dot');
    const label = document.getElementById('btr-label');
    if (!dot || !label) return;
    dot.className   = '';
    dot.classList.add(state);
    if (state === 'pending') dot.classList.add('pulse');
    label.textContent = text;
  }

  // ─── Extração do token ─────────────────────────────────────────────────────
  function extractToken() {
    try {
      // Fonte 1: Vue store (principal)
      const store = window.__vue_store__ || window.__store__;
      if (store?.state?.chat?.user?.socketToken) {
        return {
          token:       store.state.chat.user.socketToken,
          fingerprint: store.state.chat.user.fingerprint || null,
          username:    store.state.chat.user.username    || null,
        };
      }

      // Fonte 2: localStorage (fallback)
      for (const key of Object.keys(localStorage)) {
        if (key.toLowerCase().includes('token')) {
          const raw = localStorage.getItem(key);
          if (raw && raw.length > 30 && /^[a-f0-9]{32,}$/i.test(raw)) {
            return { token: raw, fingerprint: null, username: null };
          }
        }
      }
    } catch (e) {
      console.warn('[BTR] Erro ao extrair token:', e);
    }
    return null;
  }

  // ─── Envio ao bot ──────────────────────────────────────────────────────────
  function sendToken(force = false) {
    const extracted = extractToken();
    if (!extracted) {
      setStatus('error', 'Sem token');
      return;
    }

    const { token, fingerprint, username } = extracted;

    // Não reenvia o mesmo token, a menos que seja forçado
    if (!force && token === lastSentToken) return;

    setStatus('pending', 'Enviando…');

    const payload = { token, autoConnect: true };
    if (fingerprint) payload.fingerprint = fingerprint;

    const botUrl = cfg('botUrl').replace(/\/$/, '');

    GM_xmlhttpRequest({
      method:  'POST',
      url:     `${botUrl}/api/v1/socket-token`,
      headers: { 'Content-Type': 'application/json' },
      data:    JSON.stringify(payload),
      timeout: 6000,
      onload(res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.ok) {
            lastSentToken = token;
            const label = username ? `✓ ${username}` : '✓ Token enviado';
            setStatus('ok', label);
            console.info('[BTR] Token enviado com sucesso', data.isNew ? '(novo)' : '(mesmo)');
          } else {
            setStatus('error', `Rejeitado`);
            console.warn('[BTR] Bot rejeitou token:', data.error);
          }
        } catch {
          setStatus('error', 'Resposta inválida');
        }
      },
      onerror() {
        setStatus('error', 'Bot offline?');
        console.warn('[BTR] Não conseguiu conectar ao bot em', botUrl);
      },
      ontimeout() {
        setStatus('error', 'Timeout');
      },
    });
  }

  // ─── Watcher ───────────────────────────────────────────────────────────────
  function startWatcher() {
    if (watchTimer) clearInterval(watchTimer);
    const interval = Math.max(10, cfg('watchInterval')) * 1000;
    watchTimer = setInterval(() => {
      if (cfg('sendOnChange')) sendToken(false);
    }, interval);
  }

  // ─── Menu de configuração (clique direito no ícone Tampermonkey) ───────────
  GM_registerMenuCommand('⚙️  Configurar Bot URL', () => {
    const current = cfg('botUrl');
    const url = prompt('URL base do bot (ex: http://localhost:3001):', current);
    if (url && url.trim()) GM_setValue('botUrl', url.trim());
  });

  GM_registerMenuCommand('🔄 Enviar token agora', () => sendToken(true));

  GM_registerMenuCommand('⏸  Toggle auto-envio', () => {
    const v = !cfg('autoSend');
    GM_setValue('autoSend', v);
    alert(`Auto-envio: ${v ? 'ativado' : 'desativado'}`);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    createBadge();
    setStatus('pending', 'Aguardando…');

    // Aguarda o Vue store ser populado (login pode demorar)
    let attempts = 0;
    const MAX = 30; // até 30s
    const poll = setInterval(() => {
      attempts++;
      const extracted = extractToken();

      if (extracted) {
        clearInterval(poll);
        setStatus('ok', 'Token detectado');

        if (cfg('autoSend')) {
          setTimeout(() => sendToken(false), 500);
        }
        startWatcher();
      } else if (attempts >= MAX) {
        clearInterval(poll);
        setStatus('error', 'Não logado?');
      }
    }, 1000);
  }

  // Aguarda DOM pronto
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 1500);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  }

})();
