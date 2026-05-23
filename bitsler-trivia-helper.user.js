// ==UserScript==
// @name         Bitsler Trivia Helper
// @namespace    bitsler-trivia-helper
// @version      2.1.0
// @description  Detecta tema e dicas do trivia Bitsler, sugere respostas e envia com um clique
// @author       victorfioravante
// @match        https://www.bitsler.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.coingecko.com
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const P = 'bth';

  // ─── Default word lists ────────────────────────────────────────────────────
  const DEFAULTS = {
    casino_terms:     ["Ace","Ante","Baccarat","Banker","Bankroll","Bet","Blackjack","Blind","Bluff","Bonus","Bust","Call","Card","Casino","Check","Chip","Croupier","Cut","Deal","Dealer","Deck","Double","Down","Draw","Edge","Flush","Fold","Full","Gamble","Hand","Hit","Hold","Hole","House","Insurance","Jackpot","Joker","Keno","Limit","Loose","Martingale","Match","Maximum","Minimum","Natural","Odds","Pair","Pass","Payout","Player","Poker","Pot","Push","Raise","Rake","Random","River","Roll","Roulette","Royal","Shoe","Shuffle","Slot","Spin","Split","Stake","Stand","Straight","Street","Table","Tie","Token","Trip","Turn","Variance","Wager","Wild","Win","Zero"],
    bitsler_terms:    ["Rain","Drizzle","Chat","Wager","Bet","Spin","Roll","Dice","Crash","Limbo","Plinko","Wheel","Hilo","Mines","Keno","Baccarat","Blackjack","Roulette","Slots","Poker","Jackpot","Bonus","Promo","VIP","Rank","Level","Points","Wagering","Cashback","Rakeback","Deposit","Withdraw","Tip","Faucet","Challenge","Leaderboard","Tournament","Prize","Affiliate","Referral","Code","Balance","Currency","Multiplier","Odds","House","Edge","Provably","Fair","Seed","Hash","Nonce","Verify","Result","Win","Lose","Profit","Autobet","Strategy","Martingale","Fibonacci","Paroli","Dalembert","Support","Moderator","Admin","Ban","Mute","Warning"],
    blockchain_terms: ["ABI","API","APR","APY","Asic","Asset","Atomic","Altcoin","Analytics","Algorithm","Bot","BTC","Burn","Block","Bridge","Bitcoin","Blockchain","CEX","Coin","Chain","Custody","Currency","Consensus","Cryptography","Cryptocurrency","DAO","Data","DApp","DeFi","Dealer","Demand","Digital","Deposit","Database","Distributed","Decentralization","Escrow","Ethereum","Exchange","Encryption","Fee","Fiat","Fork","Faucet","Finance","Finality","Gas","Hash","Hodl","Hold","Halving","Hashrate","Hyperledger","ICO","Immutable","Inflation","Investing","Insurance","Interchain","Interoperability","Key","KYC","Ledger","Liquidity","Mint","Miner","Mining","Market","Mainnet","Multisig","Metaverse","NFT","Node","Nonce","Network","Oracle","Plasma","Protocol","Reward","Satoshi","Staking","Storage","Support","Sharding","Security","Solidity","Strategy","Sidechain","Stablecoin","Scalability","Supply","Token","Testnet","Trading","Transfer","Timestamp","Transaction","Tokenization","Validator","Validation","Volatility","Whale","Wallet","Withdraw","Whitepaper"],
    top100_coins:     ["Bitcoin","Ethereum","Tether","BNB","Solana","USDC","XRP","Dogecoin","Cardano","Avalanche","Shiba","Polkadot","Chainlink","Tron","Polygon","Litecoin","Stellar","Monero","Cosmos","Algorand","VeChain","Filecoin","Hedera","Aptos","Arbitrum","Optimism","Near","Fantom","Elrond","Theta","Tezos","EOS","Aave","Uniswap","Maker","Compound","Curve","Synthetix","Yearn","Injective","Render","Immutable","Mantle","Sei","Sui","Celestia","Pyth","Jupiter","Jito","Kaspa","Ton","Stacks","Pepe","Floki","Bonk","Bittensor","Worldcoin","Arweave","Fetch","Sandbox","Decentraland","Axie","Gala","Illuvium","Stepn","Enjin","Flow","Chiliz","Wax","Blur","Ripple","Dash","Zcash","Nano","Kusama","Acala","Moonbeam","Parallel","Quant","Band","Api3","Uma","Ondo","Pendle","Ethena","Renzo","Kelp","Notcoin","Dogs","Hamster","Catizen","Pixelverse"],
  };

  const THEME_LABELS = {
    casino_terms:    '🎰 Casino',
    bitsler_terms:   '🌧 Bitsler',
    blockchain_terms:'⛓ Blockchain',
    top100_coins:    '💰 Top 100',
  };

  const THEME_MAP = {
    casino:'casino_terms', bitsler:'bitsler_terms',
    blockchain:'blockchain_terms', crypto:'blockchain_terms',
    coin:'top100_coins', top100:'top100_coins',
  };

  const ALL_THEMES = Object.keys(DEFAULTS);

  // ─── State ────────────────────────────────────────────────────────────────
  const S = {
    sheetOpen: false,
    sheetTab: 'game',       // 'game' | theme key
    detectedTheme: null,
    selectedTheme: null,
    hint: null,
    matches: [],
    qIdx: 0,
    lists: {},
    top100At: null,
  };

  // ─── Storage ──────────────────────────────────────────────────────────────
  function loadStorage() {
    for (const t of ALL_THEMES) S.lists[t] = GM_getValue('list_' + t, [...DEFAULTS[t]]);
    S.top100At      = GM_getValue('top100_at', null);
    S.selectedTheme = GM_getValue('sel_theme', null);
  }
  function saveList(t) { GM_setValue('list_' + t, S.lists[t]); }
  function activeTheme() { return S.selectedTheme || S.detectedTheme || 'blockchain_terms'; }

  // ─── Word matching ────────────────────────────────────────────────────────
  function matchHint(hintStr, theme) {
    const tokens = hintStr.trim().split(/\s+/);
    const pattern = tokens.map(t => /^[a-zA-Z]$/.test(t) ? t.toLowerCase() : '[a-z]').join('');
    const re = new RegExp('^' + pattern + '$', 'i');
    return (S.lists[theme] || []).filter(w => !w.includes(' ') && w.length === tokens.length && re.test(w));
  }

  // ─── Chat analysis ────────────────────────────────────────────────────────
  const HINT_LINE_RE  = /^[A-Z_](\s+[A-Z_]){1,}$/i;
  const GAME_OVER_RE  = /game\s*over/i;
  const ANSWER_RE     = /answer[*:\s]+([a-zA-Z]+)/i;

  // Detect theme from any line that contains "Guess the …"
  // Priority: "top 100" beats "crypto" (e.g. "Guess the Crypto coin name (top 100)")
  function detectThemeFromLine(line) {
    if (!/guess\s+the/i.test(line)) return null;
    const t = line.toLowerCase();
    if (/top\s*100/.test(t))   return 'top100_coins';
    if (/casino/.test(t))      return 'casino_terms';
    if (/bitsler/.test(t))     return 'bitsler_terms';
    if (/blockchain/.test(t))  return 'blockchain_terms';
    if (/\bcoin\b/.test(t))    return 'top100_coins';
    if (/crypto/.test(t))      return 'blockchain_terms';
    return null;
  }

  // Theme and hint may arrive in the SAME multi-line message:
  //   "Guess the Crypto coin name (top 100) 👇\nR _ _ _ _ _\n🏅 …"
  // Parse every line so both are captured in one pass.
  function analyzeMessage(text) {
    if (!text) return;
    // Preserve line breaks; strip HTML tags
    const clean = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .trim();

    const lines = clean.split(/\n+/).map(l => l.trim()).filter(Boolean);

    let themeChanged = false;
    let hintLine     = null;

    for (const line of lines) {
      // Game over (bail immediately — no hint expected after)
      if (GAME_OVER_RE.test(line)) {
        const am = clean.match(ANSWER_RE);
        if (am) {
          const word = am[1];
          const th   = activeTheme();
          if (!S.lists[th].some(w => w.toLowerCase() === word.toLowerCase())) {
            S.lists[th].push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
            saveList(th);
            notify(`"${word}" adicionada à lista`, 'ok');
          }
        }
        S.hint = null; S.matches = []; S.qIdx = 0;
        setTimeout(() => { closeSheet(); updateNavIcon(); }, 1500);
        return;
      }

      // Theme line (e.g. "Guess the Crypto coin name (top 100) 👇")
      const detectedTh = detectThemeFromLine(line);
      if (detectedTh) {
        S.detectedTheme = detectedTh;
        S.hint = null; S.matches = []; S.qIdx = 0;
        themeChanged = true;
        continue; // keep scanning — hint may be on the next line
      }

      // Hint line (e.g. "R _ _ _ _ _")
      if (!hintLine && HINT_LINE_RE.test(line)) {
        hintLine = line;
      }
    }

    // Process hint — use theme detected in THIS message (already set above)
    if (hintLine && hintLine !== S.hint) {
      S.hint    = hintLine;
      S.matches = matchHint(hintLine, activeTheme());
      S.qIdx    = 0;
      updateNavIcon();
      openSheet('game');
    } else if (themeChanged) {
      updateNavIcon();
    }
  }

  // ─── Send ─────────────────────────────────────────────────────────────────
  function findInput() {
    const sels = [
      'input[placeholder*="essage" i]', 'input[placeholder*="Type" i]',
      'input[placeholder*="chat" i]', '.chat-input input',
      '[class*="chatInput" i] input', '[class*="chat" i] input[type="text"]',
      'footer input', 'input[type="text"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function sendMsg(word) {
    const el = findInput();
    if (!el) { notify('Input do chat não encontrado', 'err'); return false; }
    const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, word); else el.value = word;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
    setTimeout(() => {
      for (const type of ['keydown','keypress','keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
      }
    }, 80);
    return true;
  }

  function sendQueued() {
    if (S.qIdx >= S.matches.length) return;
    const word = S.matches[S.qIdx];
    if (sendMsg(word)) { S.qIdx++; renderSheetBody(); updateNavIcon(); }
  }

  // ─── Top 100 fetch ────────────────────────────────────────────────────────
  function fetchTop100() {
    notify('Buscando Top 100 no CoinGecko...', 'inf');
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false',
      headers: { Accept: 'application/json' },
      onload(resp) {
        try {
          const coins = JSON.parse(resp.responseText);
          const seen = new Set(); const words = [];
          for (const c of coins) {
            if (c.name) c.name.split(/[\s\-]+/).forEach(p => {
              const w = p.trim(); if (w.length >= 2 && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); words.push(w.charAt(0).toUpperCase() + w.slice(1)); }
            });
            if (c.symbol?.length >= 2 && !seen.has(c.symbol.toLowerCase())) { seen.add(c.symbol.toLowerCase()); words.push(c.symbol.toUpperCase()); }
          }
          S.lists.top100_coins = words; S.top100At = Date.now();
          saveList('top100_coins'); GM_setValue('top100_at', S.top100At);
          notify(`Top 100 atualizado: ${words.length} termos`, 'ok');
          renderSheetBody();
        } catch { notify('Erro ao processar Top 100', 'err'); }
      },
      onerror() { notify('Erro de rede', 'err'); },
    });
  }

  // ─── Observer ─────────────────────────────────────────────────────────────
  let _obs = null;
  function startObserver() {
    if (_obs) return;
    const SELS = ['[class*="chatMessages" i]','[class*="chat-messages" i]','[class*="messages-container" i]','[class*="messageList" i]','[class*="chat-body" i]','[class*="ChatBody" i]','[class*="Chat_body" i]'];
    let container = null;
    for (const s of SELS) { container = document.querySelector(s); if (container) break; }
    if (!container) { setTimeout(startObserver, 2500); return; }
    _obs = new MutationObserver(muts => {
      for (const m of muts) for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const msgEl = node.querySelector('[class*="message-text" i],[class*="msg-text" i],[class*="text" i],p,span') || node;
        analyzeMessage(msgEl.textContent || '');
      }
    });
    _obs.observe(container, { childList: true, subtree: true });
  }

  // ─── Notification ─────────────────────────────────────────────────────────
  function notify(msg, type = 'inf') {
    const el = document.getElementById(`${P}-notif`);
    if (!el) return;
    el.textContent = msg; el.dataset.t = type;
    clearTimeout(el._t); el._t = setTimeout(() => { el.dataset.t = ''; }, 3000);
  }

  // ─── Nav icon ─────────────────────────────────────────────────────────────
  let _navInjected = false;

  function updateNavIcon() {
    const icon = document.getElementById(`${P}-nav-icon`);
    const badge = document.getElementById(`${P}-nav-badge`);
    if (!icon || !badge) return;
    const rem = Math.max(0, S.matches.length - S.qIdx);
    badge.textContent = rem > 0 ? rem : '';
    badge.style.display = rem > 0 ? 'flex' : 'none';
    // Icon color state
    if (S.hint && rem > 0) {
      icon.dataset.state = 'active'; // amber pulse — game + matches
    } else if (S.detectedTheme) {
      icon.dataset.state = 'ready';  // blue — theme detected
    } else {
      icon.dataset.state = '';       // gray — idle
    }
  }

  function injectNavIcon() {
    if (_navInjected) return;
    const NAV_SELS = [
      'nav', '[class*="bottom-nav" i]', '[class*="bottomNav" i]',
      '[class*="bottom-bar" i]', '[class*="bottomBar" i]',
      '[class*="tab-bar" i]', '[class*="tabBar" i]',
      'footer', '[class*="footer" i]',
    ];
    let nav = null;
    for (const s of NAV_SELS) { nav = document.querySelector(s); if (nav?.children?.length >= 2) break; }
    if (!nav) { setTimeout(injectNavIcon, 2000); return; }

    _navInjected = true;

    // Build icon matching Bitsler nav style
    const btn = document.createElement('button');
    btn.id = `${P}-nav-icon`;
    btn.className = nav.firstElementChild?.className || '';
    btn.setAttribute('aria-label', 'Trivia Helper');

    // SVG game controller icon (matches typical Bitsler icon style — 24×24 outline)
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="6"/>
        <line x1="7" y1="12" x2="7" y2="12"/><line x1="9" y1="10" x2="9" y2="14"/><line x1="7" y1="10" x2="11" y2="10" style="display:none"/>
        <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>
        <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none"/>
        <line x1="6" y1="12" x2="10" y2="12"/>
        <line x1="8" y1="10" x2="8" y2="14"/>
      </svg>
      <span id="${P}-nav-badge"></span>
    `;

    btn.addEventListener('click', () => {
      if (S.sheetOpen) closeSheet();
      else openSheet(S.hint ? 'game' : 'settings');
    });

    nav.appendChild(btn);
    updateNavIcon();
  }

  // ─── Bottom sheet ─────────────────────────────────────────────────────────
  function openSheet(view) {
    S.sheetOpen = true;
    S.sheetTab  = view === 'settings' ? 'casino_terms' : 'game';
    const sheet = document.getElementById(`${P}-sheet`);
    if (!sheet) return;
    if (view === 'game') S.sheetTab = 'game';
    renderSheetBody();
    sheet.classList.add('open');
  }

  function closeSheet() {
    S.sheetOpen = false;
    const sheet = document.getElementById(`${P}-sheet`);
    if (sheet) sheet.classList.remove('open');
  }

  // ─── Sheet body render ────────────────────────────────────────────────────
  function renderSheetBody() {
    const body = document.getElementById(`${P}-sheet-body`);
    if (!body) return;
    // Update tab highlights
    document.querySelectorAll(`.${P}-stab`).forEach(t => {
      t.classList.toggle('on', t.dataset.tab === S.sheetTab);
    });
    body.innerHTML = '';
    const content = S.sheetTab === 'game' ? renderGame()
      : S.sheetTab === 'top100_coins'    ? renderTop100()
      : renderEditor(S.sheetTab);
    if (content) body.appendChild(content);
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'cls') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) { if (c != null) node.append(typeof c === 'string' ? document.createTextNode(c) : c); }
    return node;
  }

  function timeAgo(ts) {
    if (!ts) return 'nunca';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s atrás`;
    if (s < 3600) return `${Math.floor(s/60)}min atrás`;
    return `${Math.floor(s/3600)}h atrás`;
  }

  // ─── Game view ────────────────────────────────────────────────────────────
  function renderGame() {
    const frag = document.createDocumentFragment();
    const th = activeTheme();

    // Hint display (compact)
    if (S.hint) {
      frag.appendChild(el('div', { cls: `${P}-hint-row` },
        el('span', { cls: `${P}-hint-text` }, S.hint),
        el('span', { cls: `${P}-hint-meta` }, `${S.hint.trim().split(/\s+/).length} letras · ${S.matches.length} possibilidade(s)`),
      ));
    }

    // Theme chips (inline, small)
    const thRow = el('div', { cls: `${P}-theme-row` });
    for (const t of ALL_THEMES) {
      thRow.appendChild(el('button', {
        cls: `${P}-chip ${S.selectedTheme === t || (!S.selectedTheme && S.detectedTheme === t) ? 'on' : ''}`,
        onclick() {
          S.selectedTheme = t; GM_setValue('sel_theme', t);
          if (S.hint) { S.matches = matchHint(S.hint, t); S.qIdx = 0; }
          renderSheetBody(); updateNavIcon();
        },
      }, THEME_LABELS[t]));
    }
    frag.appendChild(thRow);

    // Manual hint input
    const hInput = el('input', { cls: `${P}-hinput`, type:'text', placeholder:'Dica manual: ex  B _ T _ _ _ N', value: S.hint || '' });
    hInput.addEventListener('input', () => {
      const v = hInput.value.toUpperCase().trim();
      if (/^[A-Z_](\s+[A-Z_]){1,}$/.test(v)) {
        S.hint = v; S.matches = matchHint(v, activeTheme()); S.qIdx = 0;
        renderSheetBody(); updateNavIcon();
      }
    });
    frag.appendChild(hInput);

    // ── Big send button (primary action)
    const curWord = S.matches[S.qIdx];
    if (curWord) {
      frag.appendChild(el('button', { cls: `${P}-send-btn`, onclick: sendQueued },
        `📤 ${curWord.toUpperCase()}`
      ));
      if (S.matches.length > 1) {
        const next = S.matches[S.qIdx + 1];
        frag.appendChild(el('div', { cls: `${P}-queue-info` },
          `${S.qIdx + 1} / ${S.matches.length}${next ? ` · próxima: ${next.toUpperCase()}` : ' · última'}`
        ));
      }
    } else if (S.hint) {
      frag.appendChild(el('div', { cls: `${P}-empty` }, 'Nenhuma palavra encontrada. Verifique a lista do tema.'));
    } else {
      frag.appendChild(el('div', { cls: `${P}-empty` }, 'Aguardando dica do trivia...\nA dica detectada abrirá este painel automaticamente.'));
    }

    // Word chips (secondary)
    if (S.matches.length > 0) {
      const grid = el('div', { cls: `${P}-grid` });
      S.matches.forEach((w, i) => {
        const isSent = i < S.qIdx, isCur = i === S.qIdx;
        grid.appendChild(el('button', {
          cls: `${P}-wchip ${isCur ? 'cur' : ''} ${isSent ? 'sent' : ''}`,
          onclick() { if (!isSent && sendMsg(w)) { S.qIdx = i + 1; renderSheetBody(); updateNavIcon(); } },
        }, w.toUpperCase()));
      });
      frag.appendChild(grid);
      if (S.qIdx > 0) frag.appendChild(el('button', { cls:`${P}-sm-btn`, style:'margin-top:6px', onclick(){ S.qIdx=0; renderSheetBody(); } }, '↩ Resetar fila'));
      frag.appendChild(el('button', { cls:`${P}-sm-btn`, style:'margin-top:4px', onclick(){ S.hint=null; S.matches=[]; S.qIdx=0; renderSheetBody(); updateNavIcon(); hInput.value=''; } }, '✕ Limpar jogo'));
    }

    return frag;
  }

  function renderEditor(theme) {
    const words = S.lists[theme] || [];
    const frag  = document.createDocumentFragment();
    frag.appendChild(el('div', { cls: `${P}-elabel` }, `${THEME_LABELS[theme]} · ${words.length} palavras`));
    const ta = el('textarea', { cls: `${P}-ta` }); ta.value = words.join('\n');
    frag.appendChild(ta);
    frag.appendChild(el('div', { cls: `${P}-btn-row` },
      el('button', { cls: `${P}-sm-btn`, onclick() {
        if (!confirm('Restaurar padrão?')) return;
        S.lists[theme] = [...DEFAULTS[theme]]; saveList(theme);
        ta.value = S.lists[theme].join('\n'); notify('Restaurado!', 'ok');
      }}, '↩ Padrão'),
      el('button', { cls: `${P}-sm-btn pri`, onclick() {
        S.lists[theme] = ta.value.split('\n').map(w => w.trim()).filter(Boolean);
        saveList(theme); notify(`Salvo! ${S.lists[theme].length} palavras`, 'ok');
      }}, '💾 Salvar'),
    ));
    return frag;
  }

  function renderTop100() {
    const words = S.lists.top100_coins || [];
    const frag  = document.createDocumentFragment();
    frag.appendChild(el('div', { cls: `${P}-elabel` }, `Top 100 · ${words.length} termos · ${timeAgo(S.top100At)}`));
    frag.appendChild(el('button', { cls: `${P}-sm-btn pri`, style:'width:100%;margin-bottom:10px', onclick: fetchTop100 }, '🔄 Buscar Top 100 (CoinGecko)'));
    const ta = el('textarea', { cls: `${P}-ta` }); ta.value = words.join('\n');
    frag.appendChild(ta);
    frag.appendChild(el('button', { cls: `${P}-sm-btn pri`, style:'margin-top:8px;width:100%', onclick() {
      S.lists.top100_coins = ta.value.split('\n').map(w => w.trim()).filter(Boolean);
      saveList('top100_coins'); notify(`${S.lists.top100_coins.length} termos salvos`, 'ok');
    }}, '💾 Salvar edições'));
    return frag;
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    GM_addStyle(`
      /* Nav icon */
      #${P}-nav-icon {
        position: relative;
        background: none; border: none; cursor: pointer;
        color: #6b7280; padding: 0;
        display: flex; align-items: center; justify-content: center;
        min-width: 48px; min-height: 48px;
        transition: color .2s;
        touch-action: manipulation;
      }
      #${P}-nav-icon[data-state="ready"]  { color: #3b82f6; }
      #${P}-nav-icon[data-state="active"] { color: #f59e0b; animation: ${P}-pulse 1s ease-in-out infinite; }
      @keyframes ${P}-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
      #${P}-nav-badge {
        position: absolute; top: 2px; right: 2px;
        background: #f59e0b; color: #000; font-size: 10px; font-weight: 700;
        border-radius: 50%; width: 16px; height: 16px;
        display: none; align-items: center; justify-content: center;
        font-family: -apple-system, sans-serif;
      }

      /* Notification toast */
      #${P}-notif {
        position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; padding: 7px 16px; border-radius: 20px;
        font-size: 12px; font-weight: 600; white-space: nowrap;
        font-family: -apple-system, sans-serif; pointer-events: none;
        opacity: 0; transition: opacity .25s;
      }
      #${P}-notif[data-t="ok"]  { opacity:1; background:#064e3b; color:#6ee7b7; }
      #${P}-notif[data-t="err"] { opacity:1; background:#450a0a; color:#fca5a5; }
      #${P}-notif[data-t="inf"] { opacity:1; background:#1e3a5f; color:#93c5fd; }

      /* Bottom sheet backdrop */
      #${P}-backdrop {
        position: fixed; inset: 0; z-index: 2147483644;
        background: rgba(0,0,0,.45); opacity: 0; pointer-events: none;
        transition: opacity .25s;
      }
      #${P}-backdrop.open { opacity: 1; pointer-events: auto; }

      /* Bottom sheet */
      #${P}-sheet {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483645;
        background: #0f1117; border-radius: 18px 18px 0 0;
        border-top: 1px solid #1e2535;
        box-shadow: 0 -8px 32px rgba(0,0,0,.6);
        transform: translateY(100%); transition: transform .3s cubic-bezier(.4,0,.2,1);
        display: flex; flex-direction: column; max-height: 82vh;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #e2e8f0;
      }
      #${P}-sheet.open { transform: translateY(0); }

      /* Drag handle */
      .${P}-handle {
        width: 36px; height: 4px; border-radius: 2px;
        background: #334155; margin: 10px auto 0; flex-shrink: 0;
      }

      /* Sheet header */
      .${P}-shdr {
        padding: 10px 14px 0; display: flex; align-items: center;
        gap: 8px; flex-shrink: 0;
      }
      .${P}-shdr-title { font-weight: 700; font-size: 14px; color: #e2e8f0; flex: 1; }
      .${P}-shdr-close {
        background: none; border: none; color: #64748b; cursor: pointer;
        font-size: 22px; line-height: 1; padding: 4px 6px;
        touch-action: manipulation; border-radius: 6px;
      }
      .${P}-shdr-close:active { background: #1e2535; }

      /* Tab bar */
      .${P}-stabs {
        display: flex; overflow-x: auto; scrollbar-width: none;
        border-bottom: 1px solid #1e2535; flex-shrink: 0; padding: 0 6px;
      }
      .${P}-stabs::-webkit-scrollbar { display: none; }
      .${P}-stab {
        flex-shrink: 0; padding: 9px 12px; font-size: 11px;
        cursor: pointer; color: #64748b; border-bottom: 2px solid transparent;
        white-space: nowrap; touch-action: manipulation; background: none; border-top: none; border-left: none; border-right: none;
      }
      .${P}-stab.on { color: #3b82f6; border-bottom-color: #3b82f6; }

      /* Sheet body */
      #${P}-sheet-body {
        flex: 1; overflow-y: auto; padding: 12px 14px;
        scrollbar-width: thin; scrollbar-color: #1e2535 transparent;
      }

      /* Hint display */
      .${P}-hint-row {
        background: #161b27; border: 1px solid #1e3a5f; border-radius: 10px;
        padding: 10px 12px; margin-bottom: 10px;
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .${P}-hint-text {
        font-size: 20px; font-weight: 700; letter-spacing: 5px;
        color: #60a5fa; font-family: monospace;
      }
      .${P}-hint-meta { font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; }

      /* Theme chips row */
      .${P}-theme-row {
        display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;
      }
      .${P}-chip {
        padding: 5px 10px; border-radius: 20px; border: 1px solid #1e2535;
        background: #161b27; color: #94a3b8; font-size: 11px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-chip.on { background: #1e3a5f; border-color: #3b82f6; color: #60a5fa; font-weight: 600; }
      .${P}-chip:active { transform: scale(.94); }

      /* Manual hint input */
      .${P}-hinput {
        width: 100%; box-sizing: border-box; background: #161b27;
        border: 1px solid #1e2535; border-radius: 8px; color: #e2e8f0;
        font-size: 14px; padding: 8px 11px; margin-bottom: 12px;
        font-family: monospace; letter-spacing: 3px;
      }
      .${P}-hinput:focus { outline: none; border-color: #3b82f6; }

      /* BIG send button */
      .${P}-send-btn {
        width: 100%; padding: 18px; background: #1d4ed8; color: #fff;
        border: none; border-radius: 12px; font-size: 22px; font-weight: 800;
        cursor: pointer; margin-bottom: 6px; letter-spacing: 2px;
        touch-action: manipulation; transition: background .15s;
        box-shadow: 0 4px 16px rgba(29,78,216,.4);
      }
      .${P}-send-btn:active { background: #1e40af; transform: scale(.98); }

      .${P}-queue-info {
        font-size: 12px; color: #64748b; text-align: center; margin-bottom: 12px;
      }

      /* Word chips grid */
      .${P}-grid { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
      .${P}-wchip {
        padding: 8px 14px; border-radius: 20px; border: 1px solid #1e2535;
        background: #161b27; color: #94a3b8; font-size: 12px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-wchip.cur  { background: #1d4ed8; border-color: #3b82f6; color: #fff; font-weight: 700; }
      .${P}-wchip.sent { background: #064e3b; border-color: #047857; color: #6ee7b7; text-decoration: line-through; cursor: default; }
      .${P}-wchip:hover:not(.sent) { border-color: #3b82f6; color: #93c5fd; }
      .${P}-wchip:active:not(.sent) { transform: scale(.95); }

      .${P}-empty {
        color: #475569; font-size: 13px; text-align: center;
        padding: 20px 0; white-space: pre-line; line-height: 1.7;
      }

      /* Editor */
      .${P}-elabel { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
      .${P}-ta {
        width: 100%; box-sizing: border-box; background: #161b27;
        border: 1px solid #1e2535; border-radius: 8px; color: #e2e8f0;
        font-size: 11px; padding: 9px; resize: vertical; min-height: 130px;
        font-family: monospace; line-height: 1.6;
      }
      .${P}-ta:focus { outline: none; border-color: #3b82f6; }
      .${P}-btn-row { display: flex; gap: 8px; margin-top: 8px; }
      .${P}-sm-btn {
        flex: 1; padding: 9px 12px; border: 1px solid #1e2535; border-radius: 8px;
        background: #161b27; color: #e2e8f0; font-size: 12px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-sm-btn:active { background: #1e2535; }
      .${P}-sm-btn.pri { background: #1d4ed8; border-color: #3b82f6; color: #fff; flex: none; }
    `);
  }

  // ─── Build DOM ────────────────────────────────────────────────────────────
  function buildSheet() {
    // Notification
    document.body.appendChild(el('div', { id: `${P}-notif` }));

    // Backdrop
    const backdrop = el('div', { id: `${P}-backdrop` });
    backdrop.addEventListener('click', closeSheet);
    document.body.appendChild(backdrop);

    // Sheet
    const sheet = el('div', { id: `${P}-sheet` });
    sheet.appendChild(el('div', { cls: `${P}-handle` }));

    // Header
    sheet.appendChild(el('div', { cls: `${P}-shdr` },
      el('span', { cls: `${P}-shdr-title` }, '🎮 Trivia Helper'),
      el('button', { cls: `${P}-shdr-close`, onclick: closeSheet }, '×'),
    ));

    // Tab bar
    const TABS = [
      ['game',             '🎯 Jogo'],
      ['casino_terms',     '🎰 Casino'],
      ['bitsler_terms',    '🌧 Bitsler'],
      ['blockchain_terms', '⛓ Blockchain'],
      ['top100_coins',     '💰 Top 100'],
    ];
    const tabBar = el('div', { cls: `${P}-stabs` });
    for (const [id, label] of TABS) {
      const tab = el('button', { cls: `${P}-stab ${id === S.sheetTab ? 'on' : ''}` }, label);
      tab.dataset.tab = id;
      tab.addEventListener('click', () => {
        S.sheetTab = id;
        renderSheetBody();
      });
      tabBar.appendChild(tab);
    }
    sheet.appendChild(tabBar);
    sheet.appendChild(el('div', { id: `${P}-sheet-body` }));

    document.body.appendChild(sheet);

    // Sync backdrop with sheet open class
    const observer = new MutationObserver(() => {
      backdrop.classList.toggle('open', sheet.classList.contains('open'));
    });
    observer.observe(sheet, { attributes: true, attributeFilter: ['class'] });

    // Swipe down to close
    let touchStartY = 0;
    sheet.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - touchStartY > 60) closeSheet();
    }, { passive: true });
  }

  // ─── Token bridge (envia socketToken ao bot local) ────────────────────────
  // Extrai o token do Vue store e envia ao backend em localhost:3001.
  // Permite que o bot reconecte mesmo quando www.bitsler.com está fora do ar,
  // aproveitando a sessão WS já ativa no browser.
  const BOT_PORT = GM_getValue('bot_port', 3001);
  let _lastPushedToken = null;

  function pushTokenToBot() {
    try {
      // Token em localStorage.settings.user.token (confirmado via DevTools)
      const raw = localStorage.getItem('settings');
      if (!raw) return;
      const settings = JSON.parse(decodeURIComponent(raw));
      const token = settings?.user?.token;
      if (!token || token === _lastPushedToken) return;

      // Fingerprint e cookie de sessão
      const fp = document.cookie.match(/fpstore=([a-f0-9]+)/i)?.[1] ?? '';
      const atMatch = document.cookie.match(/\bat=([^;]+)/);
      const atCookie = atMatch ? `at=${atMatch[1]}` : '';

      GM_xmlhttpRequest({
        method: 'POST',
        url: `http://localhost:${BOT_PORT}/api/v1/socket-token`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ token, fingerprint: fp, atCookie }),
        onload(r) {
          if (r.status === 200) {
            _lastPushedToken = token;
            console.log('[BTH] Token enviado ao bot local ✓', token.slice(0, 12) + '…');
          }
        },
        onerror() {}, // bot offline — silencioso
      });
    } catch (e) {}
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    loadStorage();
    injectStyles();
    buildSheet();
    injectNavIcon();
    startObserver();

    // Envia token imediatamente e depois a cada 2 minutos (cobre renovações)
    setTimeout(pushTokenToBot, 3000);
    setInterval(pushTokenToBot, 2 * 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
