// ==UserScript==
// @name         Bitsler Trivia Helper
// @namespace    bitsler-trivia-helper
// @version      1.0.0
// @description  Detecta tema e dicas do trivia Bitsler, sugere respostas e envia com um clique
// @author       victorfioravante
// @match        https://www.bitsler.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.coingecko.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const P = 'bth'; // DOM prefix (keeps IDs unique)

  // ─── Default word lists (synced from data/triviaWords.json) ────────────────
  const DEFAULTS = {
    casino_terms: ["Ace","Ante","Baccarat","Banker","Bankroll","Bet","Blackjack","Blind","Bluff","Bonus","Bust","Call","Card","Casino","Check","Chip","Croupier","Cut","Deal","Dealer","Deck","Double","Down","Draw","Edge","Flush","Fold","Full","Gamble","Hand","Hit","Hold","Hole","House","Insurance","Jackpot","Joker","Keno","Limit","Loose","Martingale","Match","Maximum","Minimum","Natural","Odds","Pair","Pass","Payout","Player","Poker","Pot","Push","Raise","Rake","Random","River","Roll","Roulette","Royal","Shoe","Shuffle","Slot","Spin","Split","Stake","Stand","Straight","Street","Table","Tie","Token","Trip","Turn","Variance","Wager","Wild","Win","Zero"],
    bitsler_terms: ["Rain","Drizzle","Chat","Wager","Bet","Spin","Roll","Dice","Crash","Limbo","Plinko","Wheel","Hilo","Mines","Keno","Baccarat","Blackjack","Roulette","Slots","Poker","Jackpot","Bonus","Promo","VIP","Rank","Level","Points","Wagering","Cashback","Rakeback","Deposit","Withdraw","Tip","Faucet","Challenge","Leaderboard","Tournament","Prize","Affiliate","Referral","Code","Balance","Currency","Multiplier","Odds","House","Edge","Provably","Fair","Seed","Hash","Nonce","Verify","Result","Win","Lose","Profit","Autobet","Strategy","Martingale","Fibonacci","Paroli","Dalembert","Support","Moderator","Admin","Ban","Mute","Warning"],
    blockchain_terms: ["ABI","API","APR","APY","Asic","Asset","Atomic","Altcoin","Analytics","Algorithm","Bot","BTC","Burn","Block","Bridge","Bitcoin","Blockchain","CEX","Coin","Chain","Custody","Currency","Consensus","Cryptography","Cryptocurrency","DAO","Data","DApp","DeFi","Dealer","Demand","Digital","Deposit","Database","Distributed","Decentralization","Escrow","Ethereum","Exchange","Encryption","Fee","Fiat","Fork","Faucet","Finance","Finality","Gas","Hash","Hodl","Hold","Halving","Hashrate","Hyperledger","ICO","Immutable","Inflation","Investing","Insurance","Interchain","Interoperability","Key","KYC","Ledger","Liquidity","Mint","Miner","Mining","Market","Mainnet","Multisig","Metaverse","NFT","Node","Nonce","Network","Oracle","Plasma","Protocol","Reward","Satoshi","Staking","Storage","Support","Sharding","Security","Solidity","Strategy","Sidechain","Stablecoin","Scalability","Supply","Token","Testnet","Trading","Transfer","Timestamp","Transaction","Tokenization","Validator","Validation","Volatility","Whale","Wallet","Withdraw","Whitepaper"],
    top100_coins: ["Bitcoin","Ethereum","Tether","BNB","Solana","USDC","XRP","Dogecoin","Cardano","Avalanche","Shiba","Polkadot","Chainlink","Tron","Polygon","Litecoin","Stellar","Monero","Cosmos","Algorand","VeChain","Filecoin","Hedera","Aptos","Arbitrum","Optimism","Near","Fantom","Elrond","Theta","Tezos","EOS","Aave","Uniswap","Maker","Compound","Curve","Synthetix","Yearn","Injective","Render","Immutable","Mantle","Sei","Sui","Celestia","Pyth","Jupiter","Jito","Kaspa","Ton","Stacks","Pepe","Floki","Bonk","Bittensor","Worldcoin","Arweave","Fetch","Sandbox","Decentraland","Axie","Gala","Illuvium","Stepn","Enjin","Flow","Chiliz","Wax","Blur","Ripple","Dash","Zcash","Nano","Kusama","Acala","Moonbeam","Parallel","Quant","Band","Api3","Uma","Ondo","Pendle","Ethena","Renzo","Kelp","Notcoin","Dogs","Hamster","Catizen","Pixelverse"],
  };

  const THEME_LABELS = {
    casino_terms:    '🎰 Casino',
    bitsler_terms:   '🌧 Bitsler',
    blockchain_terms:'⛓ Blockchain',
    top100_coins:    '💰 Top 100',
  };

  // Theme keyword → internal key
  const THEME_MAP = {
    casino: 'casino_terms',
    bitsler: 'bitsler_terms',
    blockchain: 'blockchain_terms',
    crypto: 'blockchain_terms',
    coin: 'top100_coins',
    top100: 'top100_coins',
  };

  const ALL_THEMES = Object.keys(DEFAULTS);

  // ─── State ────────────────────────────────────────────────────────────────────
  const S = {
    open: false,
    tab: 'game',
    detectedTheme: null,   // from VVolfy message
    selectedTheme: null,   // manual override
    hint: null,            // raw hint string e.g. "B _ T _ _ _ N"
    matches: [],           // filtered words
    qIdx: 0,               // next word to send
    lists: {},             // loaded word lists
    top100At: null,        // timestamp of last CoinGecko fetch
  };

  // ─── Storage ──────────────────────────────────────────────────────────────────
  function loadStorage() {
    for (const t of ALL_THEMES) {
      S.lists[t] = GM_getValue('list_' + t, [...DEFAULTS[t]]);
    }
    S.top100At   = GM_getValue('top100_at', null);
    S.selectedTheme = GM_getValue('sel_theme', null);
  }

  function saveList(theme) { GM_setValue('list_' + theme, S.lists[theme]); }

  // ─── Active theme resolution ──────────────────────────────────────────────────
  function activeTheme() {
    return S.selectedTheme || S.detectedTheme || 'blockchain_terms';
  }

  // ─── Word matching ────────────────────────────────────────────────────────────
  // hint: "B _ T _ _ _ N" → match words of same length with known letters in position
  function matchHint(hintStr, theme) {
    const tokens = hintStr.trim().split(/\s+/);
    const len = tokens.length;
    // Build regex: each token is a known letter or wildcard
    const pattern = tokens.map(t => /^[a-zA-Z]$/.test(t) ? t.toLowerCase() : '[a-z]').join('');
    const re = new RegExp('^' + pattern + '$', 'i');
    // Get word list — filter multi-word entries (trivia answers are single words)
    const words = (S.lists[theme] || []).filter(w => !w.includes(' ') && w.length === len);
    return words.filter(w => re.test(w));
  }

  // ─── Chat message analysis ────────────────────────────────────────────────────
  const TRIVIA_START_RE = /guess\s+the\s+(casino|bitsler|blockchain|crypto|coin|top\s*100)/i;
  const HINT_LINE_RE    = /^[A-Z_](\s+[A-Z_]){1,}$/i;
  const GAME_OVER_RE    = /game\s*over/i;
  const ANSWER_RE       = /answer[*:\s]+([a-zA-Z]+)/i;

  function analyzeMessage(text) {
    if (!text) return;
    const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Theme announcement
    const tm = clean.match(TRIVIA_START_RE);
    if (tm) {
      const key = tm[1].toLowerCase().replace(/\s/g, '');
      S.detectedTheme = THEME_MAP[key] || 'blockchain_terms';
      S.hint = null; S.matches = []; S.qIdx = 0;
      refresh(); return;
    }

    // Game over — auto-add answer to active list
    if (GAME_OVER_RE.test(clean)) {
      const am = clean.match(ANSWER_RE);
      if (am) {
        const word = am[1];
        const th = activeTheme();
        const exists = S.lists[th].some(w => w.toLowerCase() === word.toLowerCase());
        if (!exists) {
          const cased = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          S.lists[th].push(cased);
          saveList(th);
          notify(`"${cased}" adicionada à lista ${THEME_LABELS[th]}`, 'ok');
        }
      }
      S.hint = null; S.matches = []; S.qIdx = 0;
      refresh(); return;
    }

    // Hint pattern
    if (HINT_LINE_RE.test(clean)) {
      const th = activeTheme();
      const newMatches = matchHint(clean, th);
      // Only update if we get matches OR if hint changed
      if (clean !== S.hint) {
        S.hint = clean; S.matches = newMatches; S.qIdx = 0;
        refresh();
      }
    }
  }

  // ─── Chat input / send ────────────────────────────────────────────────────────
  function findChatInput() {
    const selectors = [
      'input[placeholder*="essage" i]',
      'input[placeholder*="Type" i]',
      'input[placeholder*="chat" i]',
      '.chat-input input',
      '[class*="chatInput" i] input',
      '[class*="chat" i] input[type="text"]',
      'footer input',
      'input[type="text"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function sendMsg(word) {
    const el = findChatInput();
    if (!el) { notify('Input do chat não encontrado', 'err'); return false; }

    // React-compatible value setter
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, word);
    else el.value = word;

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();

    // Send after a short tick so React can process the value change
    setTimeout(() => {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
        }));
      }
    }, 80);
    return true;
  }

  function sendQueued() {
    if (S.qIdx >= S.matches.length) return;
    const word = S.matches[S.qIdx];
    if (sendMsg(word)) { S.qIdx++; refresh(); }
  }

  // ─── Top 100 fetch (lazy, on demand) ─────────────────────────────────────────
  function fetchTop100() {
    notify('Buscando Top 100 no CoinGecko...', 'inf');
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false',
      headers: { Accept: 'application/json' },
      onload(resp) {
        try {
          const coins = JSON.parse(resp.responseText);
          const seen = new Set();
          const words = [];
          for (const c of coins) {
            // Add coin name words (split "Bitcoin Cash" → "Bitcoin", "Cash")
            if (c.name) {
              // Also keep the full single-word name
              const parts = c.name.split(/[\s\-]+/);
              for (const p of parts) {
                const w = p.trim();
                if (w.length >= 2 && !seen.has(w.toLowerCase())) {
                  seen.add(w.toLowerCase());
                  words.push(w.charAt(0).toUpperCase() + w.slice(1));
                }
              }
            }
            // Add symbol
            if (c.symbol && c.symbol.length >= 2) {
              const sym = c.symbol.toUpperCase();
              if (!seen.has(sym.toLowerCase())) {
                seen.add(sym.toLowerCase());
                words.push(sym);
              }
            }
          }
          S.lists.top100_coins = words;
          S.top100At = Date.now();
          saveList('top100_coins');
          GM_setValue('top100_at', S.top100At);
          notify(`Top 100 atualizado: ${words.length} termos`, 'ok');
          refresh();
        } catch (e) {
          notify('Erro ao processar Top 100', 'err');
        }
      },
      onerror() { notify('Erro de rede ao buscar Top 100', 'err'); },
    });
  }

  // ─── Chat observer ────────────────────────────────────────────────────────────
  let _obs = null;

  function startObserver() {
    if (_obs) return;
    const CONTAINER_SELS = [
      '[class*="chatMessages" i]', '[class*="chat-messages" i]',
      '[class*="messages-container" i]', '[class*="messageList" i]',
      '[class*="chat-body" i]', '[class*="ChatBody" i]',
      '[class*="Chat_body" i]', '[class*="chat_messages" i]',
    ];

    let container = null;
    for (const sel of CONTAINER_SELS) {
      container = document.querySelector(sel);
      if (container) break;
    }

    if (!container) {
      // Retry until chat loads (SPA navigation)
      setTimeout(startObserver, 2500);
      return;
    }

    _obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Try to extract message text from the node
          const msgEl = node.querySelector('[class*="message-text" i],[class*="msg-text" i],[class*="text" i],p,span') || node;
          analyzeMessage(msgEl.textContent || '');
        }
      }
    });

    _obs.observe(container, { childList: true, subtree: true });
  }

  // ─── Notification ─────────────────────────────────────────────────────────────
  function notify(msg, type = 'inf') {
    const el = document.getElementById(`${P}-notif`);
    if (!el) return;
    el.textContent = msg;
    el.dataset.t = type;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.dataset.t = ''; }, 3000);
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────────
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'cls') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function timeAgo(ts) {
    if (!ts) return 'nunca';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s atrás`;
    if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
    if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
    return `${Math.floor(s / 86400)}d atrás`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  function refresh() {
    // Badge
    const badge = document.getElementById(`${P}-badge`);
    const rem = Math.max(0, S.matches.length - S.qIdx);
    if (badge) { badge.textContent = rem; badge.style.display = rem > 0 ? 'flex' : 'none'; }

    // Header theme pill
    const pill = document.getElementById(`${P}-hpill`);
    if (pill) {
      const th = S.detectedTheme || S.selectedTheme;
      pill.textContent = th ? THEME_LABELS[th] : '—';
    }

    // Re-position panel if open (in case content height changed)
    const fab   = document.getElementById(`${P}-fab`);
    const panel = document.getElementById(`${P}-panel`);
    if (fab && panel && S.open) positionPanel(fab, panel);

    renderBody();
  }

  function renderBody() {
    const body = document.getElementById(`${P}-body`);
    if (!body) return;
    body.innerHTML = '';
    const content = S.tab === 'game' ? renderGame()
      : S.tab === 'top100_coins' ? renderTop100()
      : renderEditor(S.tab);
    if (content) body.appendChild(content);
  }

  function renderGame() {
    const frag = document.createDocumentFragment();
    const th = activeTheme();

    // ── Theme selector chips
    frag.appendChild(el('div', { cls: `${P}-label` }, 'Tema'));
    const thRow = el('div', { cls: `${P}-row` });
    for (const t of ALL_THEMES) {
      thRow.appendChild(el('button', {
        cls: `${P}-chip ${S.selectedTheme === t ? 'on' : ''}`,
        onclick() {
          S.selectedTheme = t;
          GM_setValue('sel_theme', t);
          if (S.hint) { S.matches = matchHint(S.hint, t); S.qIdx = 0; }
          refresh();
        },
      }, THEME_LABELS[t]));
    }
    frag.appendChild(thRow);

    // Detected theme info
    if (S.detectedTheme) {
      frag.appendChild(el('div', { cls: `${P}-info` },
        `Auto-detectado: ${THEME_LABELS[S.detectedTheme]}`
      ));
    }

    // ── Manual hint input
    frag.appendChild(el('div', { cls: `${P}-label`, style: 'margin-top:10px' }, 'Dica (manual ou auto-detectada)'));
    const hInput = el('input', {
      cls: `${P}-hinput`,
      type: 'text',
      placeholder: 'Ex: B _ T _ _ _ N',
      value: S.hint || '',
    });
    hInput.addEventListener('input', () => {
      const v = hInput.value.toUpperCase().trim();
      if (/^[A-Z_](\s+[A-Z_]){1,}$/.test(v)) {
        S.hint = v; S.matches = matchHint(v, activeTheme()); S.qIdx = 0;
        refresh();
      }
    });
    frag.appendChild(hInput);

    // ── Hint display
    if (S.hint) {
      frag.appendChild(el('div', { cls: `${P}-hint-box` },
        el('div', { cls: `${P}-hint-label` }, 'Dica atual'),
        el('div', { cls: `${P}-hint-text` }, S.hint),
        el('div', { cls: `${P}-info`, style: 'margin:0' },
          `${S.hint.trim().split(/\s+/).length} letras · ${S.matches.length} possibilidade(s)`
        ),
      ));
    }

    // ── Send button (current word in queue)
    const curWord = S.matches[S.qIdx];
    if (curWord) {
      frag.appendChild(el('button', { cls: `${P}-send-btn`, onclick: sendQueued },
        `📤 Enviar: ${curWord.toUpperCase()}`
      ));
      if (S.matches.length > 1) {
        const next = S.matches[S.qIdx + 1];
        frag.appendChild(el('div', { cls: `${P}-queue-info` },
          `${S.qIdx + 1} / ${S.matches.length}${next ? ` → próxima: ${next.toUpperCase()}` : ' → última'}`
        ));
      }
    } else if (S.hint && S.matches.length === 0) {
      frag.appendChild(el('div', { cls: `${P}-empty` },
        'Nenhuma palavra encontrada para esta dica.\nAdicione palavras na lista do tema.'
      ));
    } else if (!S.hint) {
      frag.appendChild(el('div', { cls: `${P}-empty` },
        'Aguardando início do trivia...\nTema e dica são detectados automaticamente.'
      ));
    }

    // ── All match chips
    if (S.matches.length > 0) {
      frag.appendChild(el('div', { cls: `${P}-label`, style: 'margin-top:10px' }, 'Todas as possibilidades'));
      const grid = el('div', { cls: `${P}-grid` });
      S.matches.forEach((w, i) => {
        const isSent = i < S.qIdx;
        const isCur  = i === S.qIdx;
        grid.appendChild(el('button', {
          cls: `${P}-wchip ${isCur ? 'cur' : ''} ${isSent ? 'sent' : ''}`,
          onclick() {
            if (isSent) return; // already sent
            if (sendMsg(w)) { S.qIdx = i + 1; refresh(); }
          },
        }, w.toUpperCase()));
      });
      frag.appendChild(grid);

      if (S.qIdx > 0) {
        frag.appendChild(el('button', {
          cls: `${P}-sm-btn`,
          style: 'margin-top:6px;width:100%',
          onclick() { S.qIdx = 0; refresh(); },
        }, '↩ Resetar fila'));
      }

      frag.appendChild(el('button', {
        cls: `${P}-sm-btn`,
        style: 'margin-top:6px;width:100%',
        onclick() { S.hint = null; S.matches = []; S.qIdx = 0; refresh(); hInput.value = ''; },
      }, '✕ Limpar jogo'));
    }

    return frag;
  }

  function renderEditor(theme) {
    const words = S.lists[theme] || [];
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', { cls: `${P}-label` }, `${THEME_LABELS[theme]} · ${words.length} palavras`));
    frag.appendChild(el('div', { cls: `${P}-info` }, 'Uma palavra por linha. Salve após editar.'));

    const ta = el('textarea', { cls: `${P}-ta` });
    ta.value = words.join('\n');
    frag.appendChild(ta);

    frag.appendChild(el('div', { cls: `${P}-row`, style: 'margin-top:8px' },
      el('button', {
        cls: `${P}-sm-btn`,
        onclick() {
          if (!confirm('Restaurar lista padrão?\nIsto apagará suas edições.')) return;
          S.lists[theme] = [...DEFAULTS[theme]];
          saveList(theme);
          ta.value = S.lists[theme].join('\n');
          notify('Lista restaurada!', 'ok');
        },
      }, '↩ Padrão'),
      el('button', {
        cls: `${P}-sm-btn pri`,
        onclick() {
          S.lists[theme] = ta.value.split('\n').map(w => w.trim()).filter(Boolean);
          saveList(theme);
          notify(`Salvo! ${S.lists[theme].length} palavras`, 'ok');
          renderBody();
        },
      }, '💾 Salvar'),
    ));

    return frag;
  }

  function renderTop100() {
    const words = S.lists.top100_coins || [];
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', { cls: `${P}-label` }, 'Top 100 Criptomoedas · CoinGecko'));
    frag.appendChild(el('div', { cls: `${P}-info` },
      `${words.length} termos · Última atualização: ${timeAgo(S.top100At)}`
    ));
    frag.appendChild(el('button', {
      cls: `${P}-sm-btn pri`,
      style: 'width:100%;margin-bottom:10px',
      onclick: fetchTop100,
    }, '🔄 Buscar Top 100 agora (CoinGecko API)'));

    frag.appendChild(el('div', { cls: `${P}-label` }, 'Editar manualmente'));
    frag.appendChild(el('div', { cls: `${P}-info` }, 'Uma palavra por linha.'));

    const ta = el('textarea', { cls: `${P}-ta` });
    ta.value = words.join('\n');
    frag.appendChild(ta);

    frag.appendChild(el('button', {
      cls: `${P}-sm-btn pri`,
      style: 'margin-top:8px;width:100%',
      onclick() {
        S.lists.top100_coins = ta.value.split('\n').map(w => w.trim()).filter(Boolean);
        saveList('top100_coins');
        notify(`Top 100 salvo! ${S.lists.top100_coins.length} termos`, 'ok');
        renderBody();
      },
    }, '💾 Salvar edições'));

    return frag;
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
  function injectStyles() {
    GM_addStyle(`
      #${P}-fab {
        position: fixed; z-index: 2147483646;
        width: 52px; height: 52px; border-radius: 50%;
        background: #111827; border: 2px solid #3b82f6;
        color: #fff; font-size: 22px; cursor: grab;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,.6);
        touch-action: none; user-select: none;
        transition: box-shadow .15s;
      }
      #${P}-fab.dragging { cursor: grabbing; box-shadow: 0 8px 30px rgba(0,0,0,.8); }
      #${P}-fab.pulse { box-shadow: 0 0 0 6px rgba(59,130,246,.35), 0 4px 20px rgba(0,0,0,.6); }
      #${P}-badge {
        position: absolute; top: -5px; right: -5px;
        background: #f59e0b; color: #000; font-size: 10px; font-weight: 700;
        border-radius: 50%; width: 18px; height: 18px;
        display: none; align-items: center; justify-content: center;
        border: 2px solid #111827;
      }
      #${P}-notif {
        position: fixed; bottom: 150px; right: 16px; z-index: 2147483647;
        padding: 7px 13px; border-radius: 8px; font-size: 12px; font-weight: 600;
        font-family: -apple-system, sans-serif; max-width: 260px;
        pointer-events: none; opacity: 0; transition: opacity .25s;
      }
      #${P}-notif[data-t="ok"]  { opacity: 1; background: #064e3b; color: #6ee7b7; }
      #${P}-notif[data-t="err"] { opacity: 1; background: #450a0a; color: #fca5a5; }
      #${P}-notif[data-t="inf"] { opacity: 1; background: #1e3a5f; color: #93c5fd; }
      #${P}-panel {
        position: fixed; z-index: 2147483645;
        width: 320px; max-width: calc(100vw - 32px); max-height: 72vh;
        background: #0f1117; border: 1px solid #1e2535; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,.7);
        display: none; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #e2e8f0;
      }
      .${P}-hdr {
        padding: 11px 13px; background: #161b27; border-bottom: 1px solid #1e2535;
        display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      }
      .${P}-hdr-title { font-weight: 700; font-size: 13px; color: #3b82f6; flex: 1; }
      .${P}-hpill {
        font-size: 10px; padding: 2px 8px; border-radius: 20px;
        background: #1e3a5f; color: #60a5fa; font-weight: 600;
      }
      .${P}-close-btn {
        background: none; border: none; color: #64748b; cursor: pointer;
        font-size: 20px; line-height: 1; padding: 4px; touch-action: manipulation;
      }
      .${P}-tabs {
        display: flex; border-bottom: 1px solid #1e2535;
        overflow-x: auto; scrollbar-width: none; flex-shrink: 0;
      }
      .${P}-tabs::-webkit-scrollbar { display: none; }
      .${P}-tab {
        flex-shrink: 0; padding: 9px 11px; font-size: 11px;
        cursor: pointer; color: #64748b;
        border-bottom: 2px solid transparent; white-space: nowrap;
        touch-action: manipulation;
      }
      .${P}-tab.on { color: #3b82f6; border-bottom-color: #3b82f6; }
      #${P}-body {
        flex: 1; overflow-y: auto; padding: 12px;
        scrollbar-width: thin; scrollbar-color: #1e2535 transparent;
      }
      .${P}-label {
        font-size: 10px; color: #475569; text-transform: uppercase;
        letter-spacing: .5px; margin-bottom: 5px;
      }
      .${P}-info { font-size: 11px; color: #64748b; margin-bottom: 6px; }
      .${P}-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .${P}-chip {
        padding: 7px 11px; border-radius: 20px; border: 1px solid #1e2535;
        background: #161b27; color: #94a3b8; font-size: 11px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-chip.on {
        background: #1e3a5f; border-color: #3b82f6; color: #60a5fa; font-weight: 600;
      }
      .${P}-chip:active { transform: scale(.95); }
      .${P}-hinput {
        width: 100%; box-sizing: border-box; background: #161b27;
        border: 1px solid #1e2535; border-radius: 8px; color: #e2e8f0;
        font-size: 15px; padding: 9px 11px; margin-bottom: 8px;
        font-family: monospace; letter-spacing: 3px;
      }
      .${P}-hinput:focus { outline: none; border-color: #3b82f6; }
      .${P}-hint-box {
        background: #161b27; border: 1px solid #1e3a5f; border-radius: 10px;
        padding: 11px; margin-bottom: 10px; text-align: center;
      }
      .${P}-hint-label { font-size: 10px; color: #475569; text-transform: uppercase; margin-bottom: 4px; }
      .${P}-hint-text {
        font-size: 22px; font-weight: 700; letter-spacing: 6px;
        color: #60a5fa; font-family: monospace;
      }
      .${P}-send-btn {
        width: 100%; padding: 14px; background: #1d4ed8; color: #fff;
        border: none; border-radius: 10px; font-size: 16px; font-weight: 700;
        cursor: pointer; margin-bottom: 8px; letter-spacing: 1px;
        touch-action: manipulation; transition: background .15s;
      }
      .${P}-send-btn:active { background: #1e40af; }
      .${P}-queue-info { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
      .${P}-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .${P}-wchip {
        padding: 8px 13px; border-radius: 20px; border: 1px solid #1e2535;
        background: #161b27; color: #94a3b8; font-size: 12px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-wchip.cur  { background: #1d4ed8; border-color: #3b82f6; color: #fff; font-weight: 700; }
      .${P}-wchip.sent { background: #064e3b; border-color: #047857; color: #6ee7b7; text-decoration: line-through; cursor: default; }
      .${P}-wchip:hover:not(.sent) { border-color: #3b82f6; color: #93c5fd; }
      .${P}-wchip:active:not(.sent) { transform: scale(.95); }
      .${P}-empty {
        color: #475569; font-size: 12px; text-align: center;
        padding: 18px 0; white-space: pre-line; line-height: 1.6;
      }
      .${P}-sm-btn {
        padding: 9px 13px; border: 1px solid #1e2535; border-radius: 8px;
        background: #161b27; color: #e2e8f0; font-size: 12px;
        cursor: pointer; touch-action: manipulation; transition: all .15s;
      }
      .${P}-sm-btn:active { background: #1e2535; }
      .${P}-sm-btn.pri { background: #1d4ed8; border-color: #3b82f6; color: #fff; }
      .${P}-ta {
        width: 100%; box-sizing: border-box; background: #161b27;
        border: 1px solid #1e2535; border-radius: 8px; color: #e2e8f0;
        font-size: 11px; padding: 9px; resize: vertical; min-height: 140px;
        font-family: monospace; line-height: 1.6;
      }
      .${P}-ta:focus { outline: none; border-color: #3b82f6; }

      @media (max-width: 400px) {
        #${P}-panel { width: calc(100vw - 16px); }
        #${P}-notif { right: 8px; }
      }
    `);
  }

  // ─── FAB position (draggable, persisted) ─────────────────────────────────────
  function defaultFabPos() {
    return { left: window.innerWidth - 68, top: window.innerHeight - 200 };
  }

  function clampPos(left, top) {
    return {
      left: Math.max(0, Math.min(left, window.innerWidth  - 52)),
      top:  Math.max(0, Math.min(top,  window.innerHeight - 52)),
    };
  }

  function applyFabPos(fab, pos) {
    fab.style.left = pos.left + 'px';
    fab.style.top  = pos.top  + 'px';
  }

  function positionPanel(fab, panel) {
    const W = window.innerWidth, H = window.innerHeight;
    const fabLeft = parseInt(fab.style.left) || 0;
    const fabTop  = parseInt(fab.style.top)  || 0;
    const pw = Math.min(320, W - 16);
    // Horizontal: keep panel inside viewport, prefer aligning near FAB
    let left = fabLeft + 26 - pw / 2;
    left = Math.max(8, Math.min(left, W - pw - 8));
    // Vertical: open above FAB if enough room, else below
    const spaceAbove = fabTop - 8;
    const spaceBelow = H - fabTop - 52 - 8;
    let top;
    if (spaceAbove >= 200 || spaceAbove >= spaceBelow) {
      const maxH = Math.min(spaceAbove, H * 0.72);
      panel.style.maxHeight = maxH + 'px';
      top = fabTop - maxH - 8;
    } else {
      panel.style.maxHeight = Math.min(spaceBelow, H * 0.72) + 'px';
      top = fabTop + 52 + 8;
    }
    panel.style.left = left + 'px';
    panel.style.top  = Math.max(8, top) + 'px';
  }

  function makeDraggable(fab, panel) {
    let active = false, moved = false;
    let sx, sy, sl, st; // start pointer x/y, start fab left/top

    function start(cx, cy) {
      active = true; moved = false;
      sx = cx; sy = cy;
      sl = parseInt(fab.style.left) || 0;
      st = parseInt(fab.style.top)  || 0;
      fab.classList.add('dragging');
    }

    function move(cx, cy) {
      if (!active) return;
      const dx = cx - sx, dy = cy - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const pos = clampPos(sl + dx, st + dy);
      applyFabPos(fab, pos);
      if (S.open) positionPanel(fab, panel);
    }

    function end() {
      if (!active) return;
      active = false;
      fab.classList.remove('dragging');
      const pos = { left: parseInt(fab.style.left), top: parseInt(fab.style.top) };
      GM_setValue('fab_pos', pos);
      if (!moved) {
        // Tap — toggle panel
        S.open = !S.open;
        panel.style.display = S.open ? 'flex' : 'none';
        if (S.open) { positionPanel(fab, panel); refresh(); }
      }
    }

    fab.addEventListener('mousedown',  e => { e.preventDefault(); start(e.clientX, e.clientY); });
    document.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    document.addEventListener('mouseup',   end);

    fab.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    document.addEventListener('touchmove', e => { if (active) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    document.addEventListener('touchend',  end, { passive: true });
  }

  // ─── Build initial DOM ────────────────────────────────────────────────────────
  function buildDOM() {
    // Notification toast
    document.body.appendChild(el('div', { id: `${P}-notif` }));

    // Floating action button
    const fab = el('div', { id: `${P}-fab` }, '🎮', el('span', { id: `${P}-badge` }));
    const savedPos = GM_getValue('fab_pos', null);
    applyFabPos(fab, savedPos ? clampPos(savedPos.left, savedPos.top) : defaultFabPos());
    document.body.appendChild(fab);

    // Panel
    const panel = el('div', { id: `${P}-panel` });

    // Header
    panel.appendChild(el('div', { cls: `${P}-hdr` },
      el('span', { cls: `${P}-hdr-title` }, '🎮 Trivia Helper'),
      el('span', { id: `${P}-hpill`, cls: `${P}-hpill` }, '—'),
      el('button', {
        cls: `${P}-close-btn`,
        onclick() { S.open = false; panel.style.display = 'none'; },
      }, '×'),
    ));

    // Tab bar
    const TABS = [
      ['game',            '🎯 Jogo'],
      ['casino_terms',    '🎰 Casino'],
      ['bitsler_terms',   '🌧 Bitsler'],
      ['blockchain_terms','⛓ Blockchain'],
      ['top100_coins',    '💰 Top 100'],
    ];
    const tabBar = el('div', { cls: `${P}-tabs` });
    for (const [id, label] of TABS) {
      const tab = el('div', { cls: `${P}-tab ${id === S.tab ? 'on' : ''}` }, label);
      tab.dataset.tabId = id;
      tab.addEventListener('click', () => {
        S.tab = id;
        tabBar.querySelectorAll(`.${P}-tab`).forEach(t => {
          t.classList.toggle('on', t.dataset.tabId === id);
        });
        renderBody();
      });
      tabBar.appendChild(tab);
    }
    panel.appendChild(tabBar);

    // Scrollable body
    panel.appendChild(el('div', { id: `${P}-body` }));

    document.body.appendChild(panel);

    // Wire drag + tap behaviour (replaces simple click)
    makeDraggable(fab, panel);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    loadStorage();
    injectStyles();
    buildDOM();
    refresh();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
