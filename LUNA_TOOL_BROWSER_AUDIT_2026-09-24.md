# Luna tool and browser audit — 2026-09-24

Read-only audit. No code, prompt, KB, config, `bot-control.json`, PM2, credentials, tests, or production were changed. Nothing was restarted or deployed.

## Verdict

**D. Another mechanism is being mistaken for browser access.**

This session could not open a shell on the live host. The connected worker **Luna VPS** (`d0cfded1-5242-4508-b0ee-1ba566141f06`) was idle, and this run was not bound to it. There is no `pm2`, no `/home/ubuntu/index.js`, and no Intercom-bot log on this machine. Recent web/browser usage on production is **not observable** (0 log lines here).

What follows is the newest tree in this repo: `luna-current`, labeled as a `/home/ubuntu` export from **2026-09-20**, with git `e999d3c` (2026-09-22) only adding isolated fail-fix staging. That is not a PM2 read from 2026-09-24, so a browser added on the VPS after that export is not proven or disproven.

## Active tools

**6**, and only these, registered in `createTools` in `luna-current/02_statePresend/tools/index.js` and passed by `lunaToolsRuntime.runChat`. Default `LUNA_TOOLS_ENABLED` is on. They are offered only when the router returns `FULL`. `FAST` uses `plainCreate` with no tools. No other function tool is registered.

| Tool | Status | Purpose | Registered | When | Affects public reply |
|---|---|---|---|---|---|
| `get_state` | ACTIVE | Conversation state: known details, asked/answered, open questions, escalation | `getState.js` `createGetState` / `spec` | FULL, model chooses | Yes. Result is appended as a `tool` message in the same array |
| `search_knowledge` | ACTIVE | Approved FAQ search with confidence | `searchKnowledge.js` `createSearchKnowledge` | FULL | Yes, same chain |
| `calc` | ACTIVE | Deterministic calculator, no `eval` | `calc.js` `calc` | FULL | Yes, same chain |
| `compare_challenges` | ACTIVE | Compare two products from FAQ text only | `compareChallenges.js` `createCompareChallenges` | FULL | Yes, same chain |
| `read_image_facts` | ACTIVE | Parse OCR/description already in context. No vision API | `readImageFacts.js` `createReadImageFacts` | FULL | Yes, same chain |
| `list_open_escalation` | ACTIVE | Open escalation fields for this conversation | `listOpenEscalation.js` `createListOpenEscalation` | FULL | Yes, same chain |

Hidden extra tool: **none**.

## Browser / web

| Question | Answer |
|---|---|
| Browser tool, web search, Google/Bing, MCP browser, Cloud Browser, search connector, shell/curl for answers | **NO** |
| Live Help Center HTTP in the customer-answer path | **YES** in this tree |
| That HTTP can affect the public reply | **YES** |
| It can supply factual text | **YES** |
| It can override the local FAQ body the model sees | **YES** |

The path is `fetchLiveArticle` in `luna-current/01_runtime/faq-kb.js`. It `axios.get`s only `https://faq.fundedelite.com/...` article URLs (4.5s timeout, 1-hour cache). `retrieveOfficialFaqContext` is called from `index.js` around the main reply build **without** `live: false`, and if the HTML extract is longer than 120 characters and not obvious chrome, it **replaces** the local markdown body inside `OFFICIAL FAQ CONTEXT`, which is concatenated onto the user message before `runChat`. `search_knowledge` uses that same retriever. Intercom `api.intercom.io` calls are CRM, not knowledge lookup.

## Knowledge authority (this tree)

1. Deterministic gates in `index.js` (pause, identity, escalate, promo resolver, short-ack) can skip or replace the model text.
2. System prompt from `control.getPrompt()` (`system-prompt.txt`). The FAQ block tells the model that locked prompt corrections beat stale FAQ wording.
3. `OFFICIAL FAQ CONTEXT`: local `fundedelite-faqs.md` ranking, then live Help Center HTML may replace that article body.
4. Tool results for `search_knowledge` and `compare_challenges` (same retriever) on FULL rounds only.
5. `calc`, `get_state`, `read_image_facts`, `list_open_escalation` are not policy sources.
6. Presend re-checks the outgoing text with `retrieveOfficialFaqContext(..., { live: false })`, so the gate sees the **local** file while the model may have seen the **live** page.

There is no web-search result and no separate model-memory store. Each webhook builds a new message list. The local file does **not** win over a successful Help Center fetch in the prompt. The prompt is only instructed to win on locked conflicts. Presend does not audit the live HTML.

## Tool flow actually in code

`MAX_TOOL_ROUNDS` is **4** in `luna-current/01_runtime/lunaToolsRuntime.js`.

Customer message, then gates in `index.js`, then FAQ inject (including live fetch), then `lunaToolsRuntime.runChat`. Model is `control.getModel()`, default and redacted `bot-control` value **`gpt-5.6-luna`**. There is no `gpt-6-luna`, no default MEDIUM, and no adaptive HIGH. Tool rounds set `reasoning_effort: 'none'`. Other completions omit `reasoning_effort`.

Tool results stay in the same `messages` array. A new customer message starts a new `runChat`; nothing persists a reasoning level to reset. If tools error, `plainCreate` drops tool results and answers from the original user content (FAQ block still included). After 4 rounds, a final completion keeps the tool messages and adds a “reply now” user line. A later FAQ-confirm force call (`ESCALATE->REPLY`) is a **new** completion from the system prompt plus `userMsg`; it does not include tool-result messages.

## Recent browser usage

**Unknown.** No production log was readable. Count from this machine: **0**.

## Wrong replies

A general browser or web search is not in this answer path, so it is not what this code would use to invent FundedElite facts. The mechanism that can still change facts is `faq-kb.js` `fetchLiveArticle`, called from the main reply builder in `index.js` before the model runs. Wrong article ranking or noisy HTML can enter the public reply. Presend then checks the local FAQ, not that live text.

## Evidence boundary

- Repo: `raoarsal332-sketch/luna-source-secrets-free`
- Export label: `luna-current/README.md` — 2026-09-20T13:27:38Z from live VPS `/home/ubuntu` (PM2 `intercom-bot`)
- This audit did not read that VPS filesystem or its PM2 logs
