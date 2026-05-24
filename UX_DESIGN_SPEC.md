# Bitsler Bot — Especificação de Design UX/UI
**Versão:** 1.0 | **Data:** Maio 2026 | **Produto:** Dashboard de gerenciamento de chatbot

---

## 1. Visão Geral do Produto

### O que é
Aplicação web de painel de controle (dashboard) para gerenciar um chatbot que opera em salas de chat da plataforma Bitsler (cassino/cripto). O usuário opera o bot a partir deste painel — monitora conversas em tempo real, envia mensagens, gerencia automações e responde a eventos.

### Quem usa
Operador único (o dono do bot). Interface de uso intenso, com foco em eficiência operacional e leitura rápida de informações em tempo real.

### Contexto de uso
Desktop/laptop, browser, sessão contínua (o painel fica aberto em segundo plano). Não há versão mobile. A tela fica visível enquanto o operador faz outras coisas — notificações e alertas são importantes.

### Conexão com o backend
Toda a interface consome uma API REST (`/api/v1/*`) e recebe eventos em tempo real via **SSE (Server-Sent Events)**. Não há carregamento de página — é uma SPA (Single Page Application) em React.

---

## 2. Arquitetura de Informação

### Estrutura de navegação

```
Bitsler Bot (sidebar fixa)
├── Dashboard           → Visão geral e métricas
├── Monitor             → Chat ao vivo + envio de mensagens
├── Auto-Mensagens      → Perfis de envio automático
├── Controle            → Fila de aprovação de mensagens
├── Trivia              → Jogo de adivinhação no chat
├── Histórico Rain      → Log de chuvas de cripto
└── Configurações       → Token, canais, alertas
```

### Layout global

```
┌────────────────────────────────────────────────┐
│  SIDEBAR (56px fixo)  │  CONTEÚDO PRINCIPAL    │
│  ─────────────────    │  (scroll independente) │
│  Logo + status bot    │                        │
│  Links de navegação   │  <Página ativa>        │
│  ─────────────────    │                        │
│  Rodapé SSE status    │                        │
└────────────────────────────────────────────────┘
│  RAIN ALERT (overlay flutuante, z-index alto)  │
└────────────────────────────────────────────────┘
```

---

## 3. Componentes Globais

### 3.1 Sidebar

**Localização:** Esquerda, 56px de largura, altura total da viewport, posição fixa.

**Conteúdo:**
```
┌────────────┐
│  ☁ Logo   │  ← ícone CloudRain azul + texto "Bitsler Bot"
│ ● Conectado│  ← dot verde (conectado) / vermelho (desconectado)
├────────────┤
│ 📊         │  Dashboard
│ 💬         │  Monitor
│ ⚡         │  Auto-Mensagens
│ 🛡 [3]    │  Controle ← badge numérico se há mensagens pendentes
│ 🎮 ●       │  Trivia ← pulse animado (ponto âmbar) quando jogo ativo
│ 🌧         │  Histórico Rain
│ ⚙         │  Configurações
├────────────┤
│ ~ SSE ativo│  ← rodapé com status da conexão SSE
└────────────┘
```

**Estados dos links:**
- **Ativo:** fundo azul sólido, texto branco
- **Hover:** fundo cinza escuro, texto branco
- **Inativo:** texto cinza médio

**Badges:**
- Controle: fundo âmbar, texto escuro, número de mensagens na fila
- Trivia: ponto âmbar pulsando quando jogo em andamento

---

### 3.2 Rain Alert (notificação flutuante)

**Quando aparece:** Toda vez que o backend detecta um evento de "rain" (chuva de cripto) no chat.

**Posição:** Fixo no topo da tela, centralizado horizontalmente (não bloqueia a sidebar).

**Auto-dismiss:** 8 segundos. Botão X para fechar manualmente.

**Visual:**
```
┌─────────────────────────────────┐
│ 🌧 Rain Detectado!          [X] │
│         BTC 0.00050             │
│         — canal br — por user   │
└─────────────────────────────────┘
```
Fundo azul forte (blue-600), borda azul claro, sombra elevada.

---

## 4. Páginas

---

### 4.1 Dashboard

**Objetivo:** Visão executiva do status do bot. Responde: "o bot está funcionando? o que aconteceu agora?"

**Layout:**
```
┌──────────────────────────────────────┐
│  Dashboard                           │
├──────────────────────────────────────┤
│  [Card]  [Card]  [Card]              │
│  [Card]  [Card]  [Card]              │
├──────────────────────────────────────┤
│  Últimos Rains                       │
│  ─────────────────────────────────   │
│  [🌧] BTC 0.00050  canal:br  5m atrás│
│  [🌧] ETH 0.00200  canal:en  1h atrás│
│  ...                                  │
└──────────────────────────────────────┘
```

**Cards de métricas (6 total):**

| # | Título | Valor | Sub-info | Cor |
|---|--------|-------|----------|-----|
| 1 | Conexão | "Conectado" / "Desconectado" | Uptime (ex: "3h 22m 10s") | verde / vermelho |
| 2 | Uptime | "3h 22m 10s" | — | azul |
| 3 | Rains Hoje | Número inteiro | — | âmbar |
| 4 | Mensagens Enviadas | Número inteiro | — | roxo |
| 5 | Perfis Ativos | Número inteiro | — | azul |
| 6 | Último Rain | "BTC 0.00050" | Canal + tempo relativo | âmbar |

**Anatomia de um Card:**
```
┌───────────────────────┐
│ Conexão       [ícone] │
│                       │
│ Conectado             │
│ 3h 22m 10s            │  ← sub-info (opcional)
└───────────────────────┘
```

**Lista de Últimos Rains:**
- Cada linha: ícone chuva | moeda+valor | canal | tempo relativo
- Ordenado do mais recente para o mais antigo
- Se vazio: estado vazio com mensagem "Nenhum rain detectado"

**Atualização:** Dados atualizados automaticamente a cada 5–10 segundos (sem necessidade de ação do usuário).

---

### 4.2 Monitor de Chat

**Objetivo:** Tela principal de operação. O operador acompanha o chat ao vivo, filtra mensagens, envia respostas e gerencia o jogo de trivia.

**Layout:**
```
┌────────────────────────────────────────────────┐
│ Monitor de Chat  [filtro]  [auto-scroll] [Trivia ON/OFF] [Top 100 ↺] [Salas] │
├────────────────────────────────────────────────┤
│ [Todos] [en] [br] [system] ...  ← tabs de canal│
├────────────────────────────────────────────────┤
│ [Painel de Salas — aparece quando ativo]        │
├────────────────────────────────────────────────┤
│ [Banner de Trivia — aparece quando jogo ativo]  │
├────────────────────────────────────────────────┤
│                                                 │
│  FEED DE MENSAGENS (área com scroll próprio)   │
│                                                 │
│  [br] tinhoso: mensagem aqui                   │
│  [en] user123: outra mensagem...               │
│  [br] Ohneide: @tinhoso boa noite ← DESTAQUE  │
│  ...                                            │
│                                                 │
├────────────────────────────────────────────────┤
│ [br ▾] [input: Digite uma mensagem...]  [Enviar]│
└────────────────────────────────────────────────┘
```

---

#### 4.2.1 Header de controles

| Controle | Tipo | Comportamento |
|----------|------|---------------|
| Filtrar mensagem | Input texto | Filtra feed por texto ou username em tempo real |
| Auto-scroll | Checkbox | Quando marcado, rola automaticamente para a última mensagem |
| Trivia ON/OFF | Botão toggle | Verde quando ativo, cinza quando inativo |
| Top 100 ↺ | Botão com ícone | Atualiza lista de top 100 criptomoedas do CoinMarketCap |
| Salas | Botão | Abre/fecha o painel de seleção de salas |

**Estados do botão Top 100:**
- Padrão: cinza, texto "Top 100", ícone estático
- Carregando: spinner animado no ícone, texto "Atualizando..."
- Sucesso: verde, "✓ 98 moedas" (auto-volta ao padrão em 4s)
- Erro: vermelho, mensagem de erro (auto-volta em 4s)

---

#### 4.2.2 Tabs de canais

- Um botão por canal ativo + botão "Todos"
- Clicando filtra o feed para mostrar só aquele canal
- Cada canal tem cor própria (ver seção de Design System)

---

#### 4.2.3 Painel de Salas (expansível)

Aparece abaixo das tabs quando o botão "Salas" está ativo.

```
Salas monitoradas (auto-join na conexão)
[✓ en]  [✓ br]  [fr]  [in]  [id]  [ph]  [ru]  [es]  [pk]  [rs]  [✓ system]
Alterações aplicadas imediatamente...
```

- Botões tipo toggle: azul com check (ativo) / cinza (inativo)
- Clique alterna o estado e envia o bot para entrar/sair da sala

---

#### 4.2.4 Banner de Trivia (condicional)

**Aparece apenas quando há um jogo de trivia ativo no chat.**

**Estado: Jogo em andamento (hint):**
```
┌──────────────────────────────────────────────────────┐
│ 🎮  B _ T _ O _ N    ←  padrão da palavra     [canal]│
├──────────────────────────────────────────────────────┤
│ [↑ Enviar] BITCOIN  [↑ Enviar] BTC  [↑ Enviar] COIN │
│                                                      │
│ [input: Resposta manual...]           [Enviar]       │
└──────────────────────────────────────────────────────┘
```

**Estado: Jogo encerrado (game over):**
```
┌──────────────────────────────────────────────────────┐
│ 🏆  Jogo encerrado — BITCOIN   ✓ salva              │
└──────────────────────────────────────────────────────┘
```

**Botões de sugestão:**
- Padrão: âmbar escuro com borda
- Após clicar + sucesso: verde, "✓ Enviado" (4s)
- Após clicar + falha: vermelho, "✗ Falhou" (4s)

---

#### 4.2.5 Feed de mensagens

Área principal de scroll. Cada linha é uma mensagem.

**Anatomia de uma mensagem:**
```
[canal]  username:  texto da mensagem
```

**Tipos de destaque visual:**

| Tipo | Trigger | Visual |
|------|---------|--------|
| Normal | Qualquer mensagem | Hover sutil (fundo cinza escuro) |
| Rain | username = "Chat Rain" / "Drizzle Bot" | Fundo azul profundo + borda azul |
| Trivia | Texto contém "guess the crypto" ou "game over" | Fundo âmbar profundo + borda âmbar |
| Menção | Texto contém @tinhoso (username do operador) | Fundo índigo profundo + borda lateral esquerda índigo |

**Destaque de menção:**
- A linha inteira recebe fundo índigo suave
- A palavra `@tinhoso` dentro do texto fica em destaque (pill/badge índigo)
- Comportamento visual similar ao Discord/Slack

**Username clicável:**
- Cursor pointer no username
- Hover: texto mais claro + sublinhado sutil
- Clique: insere `@username ` no campo de chat e foca o input

**Cores de canal (prefixo `[canal]`):**

| Canal | Cor |
|-------|-----|
| en | Azul |
| br | Verde |
| system | Amarelo |
| fr | Roxo |
| in | Laranja |
| id | Rosa |
| ph | Ciano |
| ru | Vermelho |
| es | Lima |
| pk | Verde-azulado |
| rs | Violeta |

---

#### 4.2.6 Barra de chat (input de envio)

```
┌──────────────────────────────────────────────────────────┐
│  [br ▾]  [Digite uma mensagem para enviar ao chat...]  [Enviar] │
└──────────────────────────────────────────────────────────┘
```

- **Dropdown de canal:** lista os canais ativos (não inclui "system")
- **Input de texto:** foco automático quando usuário clica em um username
- **Feedback inline:** aparece entre o input e o botão Enviar
  - "Enviado!" em verde (3s)
  - "Falhou" ou "Erro ao enviar" em vermelho (3s)
- **Botão Enviar:** desabilitado quando input vazio

---

### 4.3 Auto-Mensagens

**Objetivo:** Gerenciar perfis de mensagens automáticas que o bot envia periodicamente nos canais.

**Layout:**
```
┌──────────────────────────────────────┐
│ Auto-Mensagens                [+ Novo Perfil]  │
├──────────────────────────────────────┤
│  ℹ Estratégia Rain: Intervalo de...  │  ← info box azul
├──────────────────────────────────────┤
│  [ProfileCard 1]                     │
│  [ProfileCard 2]                     │
│  ...                                 │
│  [Estado vazio: nenhum perfil]       │
└──────────────────────────────────────┘
```

---

#### 4.3.1 Profile Card — estado colapsado

```
┌──────────────────────────────────────────────────────┐
│ ● Nome do Perfil    en, br │ 480–520s │ 12 msgs  [▷][⏸][↑][🗑] │
└──────────────────────────────────────────────────────┘
```

- **Dot de status:** verde (ativo) / cinza (inativo)
- **Nome:** texto do perfil
- **Resumo:** canais | intervalo | qtd de mensagens
- **Ações à direita:**
  - `▷` (Test): envia uma mensagem de teste imediatamente
  - `⏸/▷` (Toggle): pausa ou ativa o perfil
  - `↑/↓` (Expand): abre o formulário de edição
  - `🗑` (Delete): remove o perfil (vermelho no hover)

**Border do card:**
- Ativo: borda azul (blue-700)
- Inativo: borda cinza (gray-700)

---

#### 4.3.2 Profile Card — estado expandido (formulário de edição)

```
┌──────────────────────────────────────────────────────┐
│ [Header colapsado com chevron ↑]                     │
├──────────────────────────────────────────────────────┤
│  Nome           │  Canais (en,br)                    │
│  Intervalo Min  │  Intervalo Max                     │
│  Horário Início │  Horário Fim                       │
├──────────────────────────────────────────────────────┤
│  Mensagens (uma por linha):                          │
│  ┌──────────────────────────────────────┐           │
│  │ Olá pessoal, bom jogo!               │           │
│  │ Boa sorte a todos!                   │           │
│  └──────────────────────────────────────┘           │
│  12 mensagens válidas (≥ 10 caracteres)              │
│  ⚠ Sem tags de aposta. Sem comandos /               │
├──────────────────────────────────────────────────────┤
│  ☐ Pausar durante Rain                               │
├──────────────────────────────────────────────────────┤
│                               [Salvar]               │
└──────────────────────────────────────────────────────┘
```

**Campos:**
| Campo | Tipo | Restrições |
|-------|------|------------|
| Nome | Texto | Livre |
| Canais | Texto | Separado por vírgulas (en,br,fr...) |
| Intervalo Mínimo | Número | Mínimo 60 segundos |
| Intervalo Máximo | Número | Mínimo 60 segundos |
| Horário Início | Hora (HH:MM) | Opcional |
| Horário Fim | Hora (HH:MM) | Opcional |
| Mensagens | Textarea multilinha | Uma por linha, ≥ 10 chars |
| Pausar durante Rain | Checkbox | — |

---

### 4.4 Controle (Central de Aprovações)

**Objetivo:** Quando o modo de aprovação está ativo, mensagens automáticas não são enviadas diretamente — ficam em fila esperando aprovação manual. Esta tela gerencia essa fila.

**Layout:**
```
┌──────────────────────────────────────┐
│ Central de Controle                  │
├──────────────────────────────────────┤
│  [Toggle de Modo Aprovação]          │
├──────────────────────────────────────┤
│  [Envio Manual]                      │
├──────────────────────────────────────┤
│  Fila de Aprovação [3]  [Limpar tudo]│
│  ─────────────────────────────────   │
│  [Card de mensagem pendente]         │
│  [Card de mensagem pendente]         │
│  ...                                 │
└──────────────────────────────────────┘
```

---

#### 4.4.1 Toggle de Modo Aprovação

```
┌──────────────────────────────────────────────────┐
│  🛡 Modo Aprovação ATIVO                [toggle] │
│  Mensagens automáticas aguardam aprovação manual │
└──────────────────────────────────────────────────┘
```

**Estados visuais:**
- **Ativo:** borda e fundo âmbar escuro, ícone ShieldCheck âmbar, toggle ligado
- **Inativo:** borda e fundo cinza, ícone ShieldOff cinza, toggle desligado

---

#### 4.4.2 Envio Manual

```
┌──────────────────────────────────────────────────┐
│  Envio Manual                                    │
│                                                  │
│  [canal ▾]  [input mensagem...              ]    │
│                                     [Enviar]     │
│  Mínimo 10 caracteres (contador)                 │
│                                                  │
│  ✓ Enviado para br                               │
└──────────────────────────────────────────────────┘
```

- Input mínimo de 10 caracteres
- Contador visível conforme o usuário digita
- Feedback de 6 segundos (verde/vermelho)

---

#### 4.4.3 Card de mensagem pendente

```
┌──────────────────────────────────────────────────┐
│  [BR]  perfil: NomeDoPerfil                      │
│  Criada 2min atrás · Expira em 4min              │
│  ─────────────────────────────────────────────── │
│  "Texto da mensagem automática aqui..."          │
│                                      [✓] [✗]    │
└──────────────────────────────────────────────────┘
```

- **Badge de canal:** com cor do canal (azul=en, verde=br, roxo=fr...)
- **Timestamps:** "criada X atrás" + "expira em Y" (urgência visual se tempo curto)
- **Botões:**
  - `✓` Aprovar (verde, CheckCircle)
  - `✗` Rejeitar (vermelho, XCircle)

**Estados da fila:**
- **Modo inativo:** aviso explicando que o modo precisa estar ativo
- **Modo ativo, fila vazia:** mensagem de espera cinza
- **Modo ativo, com itens:** lista de cards

---

### 4.5 Trivia

**Objetivo:** Monitorar e gerenciar o sistema de trivia (jogo "adivinhe a cripto" no chat). Permite buscar palavras por padrão, adicionar/remover palavras do banco e trocar o tema.

**Layout:**
```
┌──────────────────────────────────────┐
│ Trivia                               │
├──────────────────────────────────────┤
│  [Seletor de Tema]                   │
├──────────────────────────────────────┤
│  [Jogo Ativo — banner do hint atual] │
├──────────────────────────────────────┤
│  [Busca de padrão / HintMatcher]     │
├──────────────────────────────────────┤
│  [Lista de palavras do banco]        │
└──────────────────────────────────────┘
```

---

#### 4.5.1 Seletor de Tema

```
Tema ativo:
[✓ Cripto]  [Casino]  [Bitsler]  [Top 100]
```

- Botões de seleção horizontal
- Tema ativo marcado com ✓ e destaque visual
- Clique troca o tema imediatamente

---

#### 4.5.2 Jogo Ativo (condicional)

Mesmo componente do banner no Monitor, mas aqui está sempre visível na página de Trivia.

**Hint em andamento:**
```
┌──────────────────────────────────────────────────┐
│ 🎮  B _ T _ O _ N                   canal: br   │
├──────────────────────────────────────────────────┤
│  [↑ Enviar] BITCOIN  [↑ Enviar] BTC             │
│                                                  │
│  [Resposta manual...]              [Enviar]      │
└──────────────────────────────────────────────────┘
```

**Jogo encerrado:**
```
┌──────────────────────────────────────────────────┐
│ 🏆  Jogo encerrado — BITCOIN   ✓ salva          │
└──────────────────────────────────────────────────┘
```

---

#### 4.5.3 Busca de padrão (HintMatcher)

Permite ao operador testar um padrão de hint manualmente para ver quais palavras do banco correspondem.

```
┌──────────────────────────────────────────────────┐
│ Testar padrão de hint                            │
│                                                  │
│ Padrão: [B _ T _ O _ N     ] Tema: [Todos ▾]    │
│                              [Buscar]            │
│                                                  │
│ 3 resultado(s):                                  │
│ BITCOIN  BTC  SATOSHI                            │
└──────────────────────────────────────────────────┘
```

**Estados de resultado:**
- Resultados encontrados: texto verde com lista
- Nenhum resultado: texto âmbar com aviso
- Erro: texto vermelho

---

#### 4.5.4 Banco de palavras (WordList)

```
┌──────────────────────────────────────────────────┐
│ Banco de Palavras                                │
│                                                  │
│ [crypto_terms (142)] [casino (57)] [top100 (98)] [bitsler (20)] │
├──────────────────────────────────────────────────┤
│ [+ Nova palavra...]            [Adicionar]       │
│ Filtrar: [busca...]                              │
├──────────────────────────────────────────────────┤
│ A                                                │
│  AIRDROP  ALTCOIN  AML  [🗑 hover]              │
│ B                                                │
│  BITCOIN  BLOCKCHAIN  BTC  [🗑 hover]           │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

- **Tabs:** um por tema, com contagem de palavras
- **Adicionar:** input + botão, confirma com Enter
- **Filtrar:** busca em tempo real (case-insensitive)
- **Palavras agrupadas por letra inicial**
- **Deletar:** ícone lixeira aparece no hover de cada palavra
- **Feedback de ação:** 3 segundos, verde ou vermelho

---

### 4.6 Histórico de Rain

**Objetivo:** Tabela de todos os eventos de rain detectados pelo bot.

**Layout:**
```
┌────────────────────────────────────────────────────────────────┐
│ Histórico de Rain                                              │
├────────────────────────────────────────────────────────────────┤
│ Tipo       │ Valor    │ Canal │ Remetente  │ Usuários │ Data   │
├────────────────────────────────────────────────────────────────┤
│ 🌧 rain    │ BTC 0.00 │ br    │ ChatRain   │ 52       │ 14:35  │
│ 🌧 drizzle │ ETH 0.00 │ en    │ DrizzleBot │ —        │ 13:10  │
│ ...        │          │       │            │          │        │
└────────────────────────────────────────────────────────────────┘
```

**Estados:**
- Carregando: mensagem de loading
- Vazio: "Nenhum rain detectado ainda."
- Com dados: tabela ordenada por data (mais recente no topo)

---

### 4.7 Configurações

**Objetivo:** Configurar autenticação do bot, canais e alertas de rain.

**Layout:**
```
┌──────────────────────────────────────┐
│ Configurações                        │
├──────────────────────────────────────┤
│  [Seção: Autenticação]               │
│  [Seção: Conexão]                    │
│  [Seção: Canais]                     │
│  [Seção: Monitor de Rain]            │
├──────────────────────────────────────┤
│  [↺ Atualizar]   Salvo! ✓           │
└──────────────────────────────────────┘
```

---

#### Seção: Autenticação

- **Socket Token:** input tipo password, texto placeholder longo com instrução
- **Fingerprint:** input texto, limite 20 chars
- **Aviso de segurança:** caixa âmbar — "Token e fingerprint nunca em arquivos versionados"

#### Seção: Conexão

- Dois botões lado a lado:
  - `Conectar` — verde, ícone Plug
  - `Desconectar` — vermelho, ícone PlugZap

#### Seção: Canais (Auto-Join)

- Input texto com canais separados por vírgula
- Hint de canais válidos abaixo
- Salva automaticamente ao sair do campo (onBlur)

#### Seção: Monitor de Rain

- Checkbox: Ativar detecção de Rain
- Checkbox: Som de alerta
- Checkbox: Notificação nativa do sistema
- Input: Webhook URL (opcional)

#### Rodapé da página

- Botão `↺ Atualizar` (recarrega configurações do servidor)
- Feedback "Salvo!" verde por 3 segundos após qualquer alteração

---

## 5. Sistema de Design

### 5.1 Tokens de cor

#### Backgrounds
| Token | Uso |
|-------|-----|
| gray-950 | Background base da aplicação |
| gray-900 | Cards, painéis, feed de chat |
| gray-800 | Inputs, hovers |
| gray-700 | Borders de inputs |

#### Semântica de status
| Status | Background | Borda | Texto |
|--------|-----------|-------|-------|
| Sucesso / Ativo | green-950 | green-700 | green-400 |
| Alerta / Rain | blue-950 | blue-700 | blue-400 |
| Aviso / Trivia | amber-950 | amber-700 | amber-400 |
| Perigo / Erro | red-950 | red-700 | red-400 |
| Menção | indigo-950 | indigo-500 (esquerda) | — |

#### Canais (cores fixas)
| Canal | Fundo badge | Texto badge | Fundo tab ativa |
|-------|------------|-------------|-----------------|
| en | blue-900 | blue-200 | blue-700 |
| br | green-900 | green-200 | green-700 |
| fr | purple-900 | purple-200 | purple-700 |
| system | yellow-900 | yellow-200 | yellow-700 |
| in | orange-900 | orange-200 | — |
| id | pink-900 | pink-200 | — |
| ph | cyan-900 | cyan-200 | — |
| ru | red-900 | red-200 | — |
| es | lime-900 | lime-200 | — |
| pk | teal-900 | teal-200 | — |
| rs | violet-900 | violet-200 | — |

### 5.2 Tipografia

| Uso | Família | Tamanho | Peso |
|-----|---------|---------|------|
| Títulos de página | Inter / Sans | 24px | Bold |
| Labels e labels de seção | Inter / Sans | 14px | Semibold |
| Texto de interface | Inter / Sans | 14px | Regular |
| Chat e código | Mono (JetBrains, Fira, Roboto Mono) | 14px | Regular |
| Timestamps, meta | Inter / Sans | 12px | Regular |

### 5.3 Componentes reutilizáveis

#### Botão padrão
- Padrão: bg-gray-800, border-gray-700, text-gray-400
- Hover: bg-gray-700, text-white
- Primário: bg-blue-600, hover:bg-blue-500, text-white
- Destrutivo: bg-red-700, hover:bg-red-600, text-white
- Sucesso: bg-green-700, hover:bg-green-600, text-white
- Ativo (toggle on): bg-green-800, border-green-600, text-green-200
- Altura: 32px (padrão), 36px (destaque)
- Border-radius: 8px

#### Input de texto
- Fundo: gray-800
- Borda: gray-700
- Texto: white
- Placeholder: gray-500
- Focus: border-blue-500
- Sem outline padrão do browser
- Border-radius: 8px

#### Card / Painel
- Fundo: gray-900
- Borda: gray-800
- Border-radius: 12px
- Padding interno: 12–16px

#### Badge
- Border-radius: full (pílula)
- Texto pequeno (12px), bold
- Padding: 2px 8px
- Âmbar para pending, azul para info

#### Toggle switch
- Pill com dot deslizante
- Ativo: azul ou âmbar
- Inativo: cinza
- Animação: transition suave (150ms)

### 5.4 Feedback e microinterações

| Padrão | Como aplicar |
|--------|-------------|
| Sucesso temporário | Texto/ícone verde, desaparece em 3–6s |
| Erro temporário | Texto/ícone vermelho, desaparece em 3–6s |
| Carregando | Spinner animado (rotate) no ícone do botão |
| Hover em linhas de lista | Fundo levemente mais claro |
| Hover em ação destrutiva | Vermelho |
| Item ativo na sidebar | Fundo azul sólido |
| Notificação flutuante | Slide-in do topo, auto-dismiss |

---

## 6. Fluxos de Interação

### Fluxo 1: Responder a uma menção no chat
```
[Monitor aberto]
 → Mensagem com @tinhoso chega
 → Linha fica destacada (indigo) automaticamente
 → Operador lê a mensagem
 → Clica no username do remetente
 → Input de chat recebe "@username " e fica focado
 → Operador digita a resposta
 → Enter ou clica "Enviar"
 → Feedback "Enviado!" por 3s
 → Input limpa
```

### Fluxo 2: Responder ao Trivia
```
[Monitor ou Trivia aberto]
 → Jogo de trivia detectado no canal br
 → Banner âmbar aparece com padrão: "B _ T _ O _ N"
 → Sugestões aparecem: "BITCOIN", "BTC"
 → Operador clica em "BITCOIN"
 → Botão muda para "✓ Enviado" por 4s
```

### Fluxo 3: Aprovar mensagem automática
```
[Badge na sidebar mostra [2]]
 → Operador clica em "Controle"
 → Modo Aprovação está ativo
 → 2 cards aparecem na fila
 → Operador lê o texto da mensagem
 → Clica ✓ para aprovar ou ✗ para rejeitar
 → Card some da fila
 → Badge na sidebar atualiza para [1]
```

### Fluxo 4: Adicionar palavra ao banco de Trivia
```
[Trivia → Banco de Palavras]
 → Operador seleciona tema "Cripto"
 → Digita "SOLANA" no input de nova palavra
 → Enter
 → Palavra aparece na lista sob a letra "S"
 → Feedback verde "palavra adicionada!" por 3s
```

### Fluxo 5: Configurar novo perfil de auto-mensagem
```
[Auto-Mensagens → "+ Novo Perfil"]
 → Card em branco aparece expandido
 → Preenche Nome, Canais: "br,en"
 → Intervalo 480–520s
 → Cola mensagens (uma por linha)
 → Clica "Salvar"
 → Card colapsa com status ativo
```

---

## 7. Estados Globais Importantes

| Estado | Onde aparece | Efeito visual |
|--------|-------------|---------------|
| Bot desconectado | Sidebar + Dashboard | Dot vermelho, card "Desconectado" |
| SSE desconectado | Rodapé da Sidebar | "SSE inativo" texto cinza |
| Trivia ativo | Sidebar + Monitor + Trivia | Pulse âmbar na sidebar, banner no Monitor |
| Mensagens pendentes | Sidebar + Controle | Badge numérico âmbar na sidebar |
| Rain detectado | Overlay global | Alert flutuante azul no topo |

---

## 8. Inventário de Ícones (Lucide React)

| Ícone | Uso |
|-------|-----|
| CloudRain | Logo, rain events |
| LayoutDashboard | Nav Dashboard |
| MessageSquare | Nav Monitor |
| Zap | Nav Auto-Mensagens |
| ShieldCheck / ShieldOff | Nav Controle, toggle aprovação |
| Gamepad2 | Nav Trivia, banner de trivia |
| Settings | Nav Configurações |
| Activity | Status SSE no rodapé |
| Wifi / WifiOff | Status de conexão |
| Plug / PlugZap | Botões conectar/desconectar |
| Send | Botões de envio de mensagem |
| Trash2 | Deletar perfil / palavra |
| Play / Pause | Toggle ativo/inativo de perfil |
| ChevronDown / ChevronUp | Expandir/colapsar card |
| Plus | Novo perfil |
| RefreshCw | Atualizar (spinning quando carregando) |
| CheckCircle | Aprovar mensagem |
| XCircle | Rejeitar mensagem |
| Trophy | Game over no trivia |
| Search | Busca no banco de palavras |
| Clock | Timestamps / expiry |
| Settings2 | Botão "Salas" no Monitor |

---

## 9. Edge Cases e Estados Vazios

| Tela | Estado vazio | Mensagem sugerida |
|------|-------------|-------------------|
| Monitor → Feed | Sem mensagens | "Aguardando mensagens..." |
| Monitor → Trivia | Sem jogo ativo | [Banner não renderiza] |
| Controle → Fila | Fila vazia | Texto cinza indicando espera |
| Controle → Fila | Modo aprovação inativo | Aviso explicando que o modo precisa estar ativo |
| Auto-Mensagens | Sem perfis | Mensagem + call to action para criar o primeiro |
| Rain History | Sem rains | "Nenhum rain detectado ainda." |
| Trivia → Busca | Sem resultados | Aviso âmbar |
| Dashboard | Bot desconectado | Card com status vermelho, uptime zerado |

---

## 10. Notas para o Designer

1. **Dark mode apenas** — a interface é exclusivamente escura (gray-950 como base). Não há modo claro.

2. **Fonte monospace no chat** — todo o feed de mensagens usa fonte monoespacada para facilitar leitura de usernames e valores numéricos lado a lado.

3. **Densidade alta** — o feed de mensagens precisa mostrar o máximo de linhas na tela. Linhas do chat têm padding mínimo (4px vertical).

4. **Ações destrutivas sem confirmação modal** — deletar perfil e rejeitar mensagem são ações imediatas. Não é necessário modal de confirmação (fluxo de alta frequência).

5. **Tempo real é a norma** — a interface muda constantemente por si mesma (SSE). Animações devem ser sutis para não distrair. Evitar flash/blink excessivo.

6. **Sidebar sempre visível** — não há comportamento de colapso ou menu hamburguer. A sidebar é sempre 56px visíveis.

7. **Scroll independente** — a área de conteúdo principal tem scroll próprio. A sidebar e os cabeçalhos de página não rolam.

8. **Auto-scroll no chat** — o feed de mensagens rola automaticamente para o fim quando `autoScroll` está ativo. Se o usuário rolar para cima manualmente, o checkbox deve desativar automaticamente (comportamento ideal, atualmente manual).
