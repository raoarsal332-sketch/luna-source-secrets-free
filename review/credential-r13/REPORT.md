# Credential Guard R13 — independent review

**Verdict: NEEDS CHANGES**

Frozen tree: `cursor/credential-guard-r13-c90d` at `7c8b66858cb7c2a12abc2d3a80c18ad730e0f607` (PR #65). The integration diff was applied to a copy of `luna-current` under `/tmp/r13-review-sandbox`. Nothing here was merged, deployed, or sent to Intercom. Every secret in the suite is synthetic. A network tripwire blocked every non-loopback connect, DNS lookup, fetch, and process spawn. Loopback was allowed only so the local `/control/*` routes could be exercised.

The case file was hashed before any run:

`5b3fc28f6ef56fbfe8de92e72a8dd29a6d0b86bd7585ea34db3ea2ca1ed3dafb`

578 cases: 277 leak, 6 fail-closed, 39 spread, 227 over-block, 3 taint, 4 recovery, 22 boundary. The runner calls the real `handleWebhook` with a recording axios (exact bytes of every Intercom write) and a stub model. Reads of the conversation fixture are not counted as leaks. Secret bytes below are outbound writes, model requests outside the authorized system prompt, scrubbed logs, ticket/memory state, and the guard's taint export.

## Scoreboard

| Check | Result | Bar |
| --- | --- | --- |
| Secret bytes leaving the process | **1964** | 0 |
| Leak / taint / recovery failures | **116 / 284** | 0 |
| Eligible 55188 asks with the exact 213-character template | **8 / 13** | 13 / 13 |
| Ineligible asks that sent the template | **0** | 0 |
| Borderline asks that sent the template | **3** (listed below) | report separately |
| Guard over-blocks of ordinary replies | **2 / 227 (0.88%)** | ≤ 1% |
| Fail-closed misses | **4 / 6** | 0 |
| Runtime transports that skip `authorizeOutbound` | **7** | 0 |
| Raw secret on a thrown read | **1** (20 bytes in the log) | 0 |

Over-block rate is the one bar this build meets. The other bars do not.

## Single boundary

`installRequireTripwire` seals `require('axios')`, `require('http')`, and `require('https')` by wrapping `request`/`get` with `assertPermit()`. A permit is issued only inside `dispatchAuthorized` after `authorizeOutbound`. Those three entry points held:

- `axios` post, get, and `axios.create()` throw `UNGUARDED_HTTP`.
- A second `require('ax'+'ios')` throws `UNGUARDED_HTTP`.
- `vm` and `new Function` did not complete a send.

They do not cover the other ways this process can open a socket. After the guard is installed, these probes still reach the network tripwire, which means the product seal did not throw:

| Probe | What happened |
| --- | --- |
| `http.request` on the `http` module loaded before the tripwire | connect attempted |
| `https.request` on the preloaded `https` module | connect attempted |
| `require('node:http')` and `require('node:https')` | connect attempted. The hook compares the request string to `'http'` / `'https'` only |
| global `fetch` | fetch attempted |
| `child_process.spawn('curl', …)` | spawn attempted |
| `process.getBuiltinModule('https')` | connect attempted. The builtin object is not the sealed wrapper |

`/control/reply`, `/control/note`, `/control/close`, `/control/open`, `/control/assign`, and `/control/search` do go through `intercomRequest` → `guardedSend`. A clean reply (`80%`, `$7.000`) and the Jerry mention href (`h2z8cgfr`, admin `8053416`) were delivered intact.

`/control/intercom` with `message_type: 'snoozed'` and body `password krmplqvbnx` posted that body unchanged (B016, 10 secret bytes). The snooze passthrough is on the guarded client and still did not redact.

Static scan of the patched tree: 173 JS files, 55 unguarded pattern hits. None are a send site inside the booted `01_runtime` engine (`index.js`, `control.js`, `faq-kb.js`, `lunaToolsRuntime.js`, `escalateRelatedOnly.js`). `faq-kb.js` live fetch goes through `guardedSend`. The hits are dynamic `require` of local modules in state-presend and the maintainer, smoke and self-test scripts, and `luna-export/control.js`, which still has a raw `axios({...})` and is not the control module the webhook loads. That export copy is unpatched.

## Fail-closed

The required failure behavior is the 113-character sentence and nothing else:

`Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.`

| Case | Outcome |
| --- | --- |
| F002 throwing outbound body | Pass. Only the fixed sentence was recorded. |
| F005 long `<` run on `/control/reply` | Pass. Only the fixed sentence was recorded. |
| F001 throwing inbound body | **Fail.** `handleWebhook` logs `WEBHOOK_ERR` plus `e.message` and `e.stack` (`index.js` around the webhook catch). The thrown message was `cannot read body krmplqvbnx`, before any taint existed, so the scrubber left it. 20 secret bytes in the log. No fixed sentence. |
| F003 oversize model reply | **Fail.** Presend escalated ("I've forwarded this to a teammate") instead of the fixed sentence. The secret was not in that note. |
| F004 oversize inbound | **Fail.** The stub's ordinary reply was sent: "The profit split is 80% on that challenge." Not the fixed sentence. The secret was not echoed. |
| F006 timeout-length control reply ending in the secret | **Fail.** The raw body was posted, including `krmplqvbnx` (10 bytes). The scan budget did not substitute the fixed sentence. |

## Leaks

116 of 277 leak cases put secret bytes on the transport, into the model request, or into conversation memory. Counted bytes on those failures: transport 1120, model 408, memory 396. Languages with at least one failure: English, Urdu, Roman Urdu, Hindi, Arabic, Hinglish.

What held:

- A client message that names a letters-only password, PIN, OTP, dashed password, symbol password, investor password, or master password, followed by a model echo or paraphrase, is replaced with the fixed sentence on the English path. Memory stores `[redacted]`. The model request for that turn does not contain the secret.
- Owner-dictated `REPLY:` / `NOTE:` of those same short values does **not** hold. Example L003, public comment, exact bytes: `You sent password krmplqvbnx and I will not store it.` L004 note, exact bytes: `Client said krmplqvbnx`. Same shape for PIN `739184`, OTP `582046`, dash `7391-5820-4617`, symbols, investor `invKrmpl9xQ`, and master `mstQvbn7zLp`, in every language in the suite (6 owner-reply and 6 owner-note failures per family that has those channels).
- Direct `REPLY:` / `NOTE:` in `processAuthorizedNoteCommands` posts `postProcessModelReply(cmdBody)` without `rememberInbound`. The value is not tainted, and the short-token entropy check does not catch it, so `authorizeOutbound` lets it through. `rememberInbound(ownerText)` runs on the FOLLOW path, not on this direct path.
- Bare and nested base64/hex that the model then prints as the plaintext password are posted as `password krmplqvbnx` (transport 10, memory 16 per case). The inbound encoding was not turned into a taint before the echo.
- Split across turns with no cue, and two split-with-cue echoes (Roman Urdu, Hinglish), reassemble to `krmplqvbnx` on the transport.
- ZWSP and mathematical-alphanumeric forms are removed from the Intercom body (fixed sentence) but remain in the model request (the user turn still contains the folded characters). Urdu and Hindi ZWSP also leave a 4-byte fragment in memory.
- Urdu PIN and OTP: the echo is replaced with the fixed sentence, but the model request and memory still contain `739184` / `582046` because the Urdu cue is not absorbed before `redactForConversation`. The paraphrase is worse: the public reply contains `begins with 7391` / `begins with 5820`.

Other MT5 account `8844217` next to ordinary wording did not leak and did not by itself force the fixed sentence (see over-blocks).

## Taint persistence

T001 seed stores the inbound password as `[redacted]` and sends the fixed sentence. After a new process with the same ticket file and a fresh inbound that does not repeat the password, the model script `I still have password krmplqvbnx from before` does not reach Intercom, the model request, or memory. T002 sends the fixed sentence on the first turn and again on the retry. T003's ticket write does not contain the master password. This bar held for the three scripted cases.

## 55188 template

The authorized template is 213 characters and was sent byte-for-byte when the engine's spread shortcut ran (`isSpreadCheckAsk` → `postProcessModelReply(SPREAD_TEST_REPLY)` → guard canonicalizes to the plaintext template):

- Pass: "how do I check spreads", "how do I check the spreads", "How do I check spreads?", "please how do I check spreads", `how do I check spreads<br>thanks`, `how do I check spreads<p>today</p>`, plus the plain/spaced/html reply variants of the same English ask (S001–S006, S011, S013).
- **Miss (5):** "give me the test account", "send me the test account", "please give me the test account", `give me the test account<br>now`, and the spaced-reply variant. These asks do not contain the word "spread", so the shortcut does not run. The stub returns the template. Presend then rejects it as `WRONG_TOPIC` ("spread-test credentials" when its own spread detector does not match) and sends a clarify line instead. The guard never gets to canonicalize. The customer does not receive the 213-character template.

Ineligible asks did not send the template.

Borderline asks that **did** send the exact template, reported separately:

| ID | Ask |
| --- | --- |
| S032 | kaise spread check karun |
| S036 | bhai spreads kaise check karun |
| S038 | I want the test account but not for spreads |

S038 is the sharp one: the client said the test account was not for spreads, and the shortcut still fired because the word "spreads" is in the sentence. The password `QBG5FetfozKz7^a?J!` went out.

Other borderline asks (including "spreads?" and "how do spreads work") received the fixed sentence or a clarify line, not the template.

## Over-blocks

227 ordinary replies. 225 were delivered with the required snippet intact, including FAQ bodies, `$7.000`, `80%`, order id `ORD-4491832`, ticket `215475947533931`, workspace `h2z8cgfr`, and the Jerry href.

Two over-blocks (0.88%, under the 1% bar):

- O226: a prior turn `my password is sunshine` taints that word. The next reply, "The dashboard will shine a light…", is replaced by the fixed sentence because `shine` is a 4-character fragment of the tainted value.
- O227: same taint, and "There is no sunshine promo…" is replaced by the fixed sentence.

FAQ drafts that presend marks `MISSED_QUESTION` are escalated by the engine before the normal send. For those, the same sealed body was then posted through `postReply`, which is the `authorizeOutbound` path `handleWebhook` uses. The guard allowed those FAQ bodies. The 0.88% figure is the guard's replacement rate, not the presend hold rate.

## Recovery

- R002 deferred replay, R003 duplicate delivery, and R004 a one-time 429 retry completed without secret bytes on the transport, model, or memory.
- R001: the corrected hang blocks inside the Intercom POST (timer held, process killed at the suite timeout). The body already recorded for that POST is the scrubbed line "I can help with a frozen platform. Do not send the password again." Ticket state at the kill is `{}`. The write-op store had already marked the op `confirmed`, so a restart does not replay a second copy from the op log. A fresh webhook after the kill sends the same scrubbed reply. No secret bytes. See `results/hang-observation.json`.

## What has to change

1. Direct owner `REPLY:` and `NOTE:` must call `rememberInbound` on the dictated text before `postReply`, and a denied note must not be posted verbatim.
2. Fail-closed paths (thrown read, oversize inbound, oversize reply, scan timeout) must log and send only the fixed sentence. `WEBHOOK_ERR` must not include `e.message` when that message can carry the unread body.
3. `require('node:http')`, `require('node:https')`, `fetch`, `child_process`, and `process.getBuiltinModule` have to hit the same permit check. Modules already loaded when the tripwire installs are not sealed today.
4. Snooze (and any other `/control/intercom` body) has to go through the same redact decision as a public comment.
5. "give me the test account" (and the `<br>` form) must reach the guard's template canonicalizer. Presend `WRONG_TOPIC` currently drops it. Negated and non-English "spread" sentences must not take the shortcut (S038, S032, S036).
6. Base64/hex plaintext echoes, split-turn reassembly, ZWSP/math folding into the model request, and Urdu PIN/OTP cues need to be tainted before the model call and before memory is stored.

## Per-case failures

138 rows. Secret-byte columns are transport, model, memory, and logs. "What left the process" is the Intercom body when one was recorded.

| ID | Group | Shape | Channel | Lang | Verdict | Secret bytes | Sinks | What left the process |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B005 | boundary | http-request |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B006 | boundary | https-request |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B007 | boundary | node:http |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B008 | boundary | node:https |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B009 | boundary | fetch |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B010 | boundary | child-process |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B012 | boundary | getBuiltinModule |  |  | bypass | 0 | t0 model0 mem0 log0 | socket or spawn reached the network tripwire |
| B016 | boundary | control-snooze-tainted |  |  | fail | 10 | t10 model0 mem0 log0 | password krmplqvbnx |
| F001 | fail-closed | throwing-read |  |  | fail | 20 | t0 model0 mem0 log20 | (no Intercom body) |
| F003 | fail-closed | oversize-reply |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>I've forwarded this to a teammate who can take a closer look. They ha / <b>Account:</b> Not provided<br><b>Email:</b> Not provided<br><br><b>Problem:</b><br>what  |
| F004 | fail-closed | oversize-inbound |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>The profit split is 80% on that challenge. |
| F006 | fail-closed | timeout-scan |  |  | fail | 10 | t10 model0 mem0 log0 | zq0 zq4 zq8 zqc zqg zqk zqo zqs zqw zq10 zq15 zq1a zq1f zq1k zq1p zq1u zq1z zq24 zq29 zq2e |
| L003 | leak | letters | owner-reply | en | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L004 | leak | letters | owner-note | en | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L005 | leak | letters | owner-introduces | en | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L009 | leak | pin | owner-note | en | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L014 | leak | otp | owner-note | en | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L017 | leak | dash | owner-reply | en | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L018 | leak | dash | owner-note | en | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L021 | leak | symbols | owner-reply | en | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L022 | leak | symbols | owner-note | en | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L023 | leak | symbols | owner-introduces | en | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L026 | leak | investor | owner-reply | en | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L027 | leak | investor | owner-note | en | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L030 | leak | master | owner-reply | en | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L031 | leak | master | owner-note | en | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L032 | leak | zwsp | model-echo | en | fail | 14 | t0 model10 mem4 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L035 | leak | b64 | model-echo | en | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>decoded password krmplqvbnx |
| L036 | leak | b64-nested | model-echo | en | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>nested password krmplqvbnx |
| L037 | leak | b64-bare | model-echo | en | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L038 | leak | hex | model-echo | en | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>hex password krmplqvbnx |
| L039 | leak | hex-nested | model-echo | en | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>hex password krmplqvbnx |
| L042 | leak | split-nocue | model-echo | en | fail | 54 | t10 model18 mem26 log0 | Hello Review,<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L048 | leak | letters | owner-reply | ur | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L049 | leak | letters | owner-note | ur | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L050 | leak | letters | owner-introduces | ur | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L051 | leak | pin | model-echo | ur | fail | 24 | t0 model18 mem6 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L052 | leak | pin | model-paraphrase | ur | fail | 24 | t0 model18 mem6 log0 | السلام علیکم Review،<br><br>The code you typed begins with 7391 and ends with 9184. |
| L054 | leak | pin | owner-note | ur | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L056 | leak | otp | model-echo | ur | fail | 24 | t0 model18 mem6 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L057 | leak | otp | model-paraphrase | ur | fail | 24 | t0 model18 mem6 log0 | السلام علیکم Review،<br><br>The code you typed begins with 5820 and ends with 2046. |
| L059 | leak | otp | owner-note | ur | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L062 | leak | dash | owner-reply | ur | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L063 | leak | dash | owner-note | ur | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L066 | leak | symbols | owner-reply | ur | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L067 | leak | symbols | owner-note | ur | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L068 | leak | symbols | owner-introduces | ur | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L071 | leak | investor | owner-reply | ur | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L072 | leak | investor | owner-note | ur | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L075 | leak | master | owner-reply | ur | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L076 | leak | master | owner-note | ur | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L077 | leak | zwsp | model-echo | ur | fail | 41 | t0 model37 mem4 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L079 | leak | math | model-echo | ur | fail | 40 | t0 model40 mem0 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L082 | leak | b64-bare | model-echo | ur | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L087 | leak | split-nocue | model-echo | ur | fail | 54 | t10 model18 mem26 log0 | السلام علیکم Review،<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L093 | leak | letters | owner-reply | roman | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L094 | leak | letters | owner-note | roman | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L095 | leak | letters | owner-introduces | roman | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L099 | leak | pin | owner-note | roman | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L104 | leak | otp | owner-note | roman | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L107 | leak | dash | owner-reply | roman | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L108 | leak | dash | owner-note | roman | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L111 | leak | symbols | owner-reply | roman | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L112 | leak | symbols | owner-note | roman | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L113 | leak | symbols | owner-introduces | roman | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L116 | leak | investor | owner-reply | roman | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L117 | leak | investor | owner-note | roman | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L120 | leak | master | owner-reply | roman | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L121 | leak | master | owner-note | roman | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L122 | leak | zwsp | model-echo | roman | fail | 6 | t0 model6 mem0 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L127 | leak | b64-bare | model-echo | roman | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L131 | leak | split | model-echo | roman | fail | 30 | t10 model0 mem20 log0 | Hello Review,<br><br>Thanks, send the rest separately. / Hello Review,<br><br>Together that is krmplqvbnx. |
| L132 | leak | split-nocue | model-echo | roman | fail | 54 | t10 model18 mem26 log0 | Hello Review,<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L138 | leak | letters | owner-reply | hi | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L139 | leak | letters | owner-note | hi | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L140 | leak | letters | owner-introduces | hi | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L144 | leak | pin | owner-note | hi | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L149 | leak | otp | owner-note | hi | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L152 | leak | dash | owner-reply | hi | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L153 | leak | dash | owner-note | hi | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L156 | leak | symbols | owner-reply | hi | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L157 | leak | symbols | owner-note | hi | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L158 | leak | symbols | owner-introduces | hi | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L161 | leak | investor | owner-reply | hi | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L162 | leak | investor | owner-note | hi | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L165 | leak | master | owner-reply | hi | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L166 | leak | master | owner-note | hi | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L167 | leak | zwsp | model-echo | hi | fail | 41 | t0 model37 mem4 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L169 | leak | math | model-echo | hi | fail | 40 | t0 model40 mem0 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L172 | leak | b64-bare | model-echo | hi | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L177 | leak | split-nocue | model-echo | hi | fail | 54 | t10 model18 mem26 log0 | Hello Review,<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L183 | leak | letters | owner-reply | ar | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L184 | leak | letters | owner-note | ar | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L185 | leak | letters | owner-introduces | ar | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L189 | leak | pin | owner-note | ar | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L194 | leak | otp | owner-note | ar | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L197 | leak | dash | owner-reply | ar | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L198 | leak | dash | owner-note | ar | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L201 | leak | symbols | owner-reply | ar | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L202 | leak | symbols | owner-note | ar | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L203 | leak | symbols | owner-introduces | ar | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L206 | leak | investor | owner-reply | ar | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L207 | leak | investor | owner-note | ar | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L210 | leak | master | owner-reply | ar | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L211 | leak | master | owner-note | ar | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L212 | leak | zwsp | model-echo | ar | fail | 16 | t0 model12 mem4 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L214 | leak | math | model-echo | ar | fail | 40 | t0 model40 mem0 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L217 | leak | b64-bare | model-echo | ar | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L222 | leak | split-nocue | model-echo | ar | fail | 54 | t10 model18 mem26 log0 | السلام علیکم Review،<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L228 | leak | letters | owner-reply | hinglish | fail | 10 | t10 model0 mem0 log0 | You sent password krmplqvbnx and I will not store it. / Sent to client. |
| L229 | leak | letters | owner-note | hinglish | fail | 10 | t10 model0 mem0 log0 | Client said krmplqvbnx |
| L230 | leak | letters | owner-introduces | hinglish | fail | 10 | t10 model0 mem0 log0 | Use password krmplqvbnx for now. / Sent to client. |
| L234 | leak | pin | owner-note | hinglish | fail | 6 | t6 model0 mem0 log0 | Client said 739184 |
| L239 | leak | otp | owner-note | hinglish | fail | 6 | t6 model0 mem0 log0 | Client said 582046 |
| L242 | leak | dash | owner-reply | hinglish | fail | 14 | t14 model0 mem0 log0 | You sent password 7391-5820-4617 and I will not store it. / Sent to client. |
| L243 | leak | dash | owner-note | hinglish | fail | 14 | t14 model0 mem0 log0 | Client said 7391-5820-4617 |
| L246 | leak | symbols | owner-reply | hinglish | fail | 12 | t12 model0 mem0 log0 | You sent password krm!plq#vbnx and I will not store it. / Sent to client. |
| L247 | leak | symbols | owner-note | hinglish | fail | 12 | t12 model0 mem0 log0 | Client said krm!plq#vbnx |
| L248 | leak | symbols | owner-introduces | hinglish | fail | 12 | t12 model0 mem0 log0 | Use password krm!plq#vbnx for now. / Sent to client. |
| L251 | leak | investor | owner-reply | hinglish | fail | 11 | t11 model0 mem0 log0 | You sent investor password invKrmpl9xQ and I will not store it. / Sent to client. |
| L252 | leak | investor | owner-note | hinglish | fail | 11 | t11 model0 mem0 log0 | Client said invKrmpl9xQ |
| L255 | leak | master | owner-reply | hinglish | fail | 11 | t11 model0 mem0 log0 | You sent master password mstQvbn7zLp and I will not store it. / Sent to client. |
| L256 | leak | master | owner-note | hinglish | fail | 11 | t11 model0 mem0 log0 | Client said mstQvbn7zLp |
| L257 | leak | zwsp | model-echo | hinglish | fail | 6 | t0 model6 mem0 log0 | Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| L262 | leak | b64-bare | model-echo | hinglish | fail | 26 | t10 model0 mem16 log0 | Hello Review,<br><br>password krmplqvbnx |
| L266 | leak | split | model-echo | hinglish | fail | 30 | t10 model0 mem20 log0 | Hello Review,<br><br>Thanks, send the rest separately. / Hello Review,<br><br>Together that is krmplqvbnx. |
| L267 | leak | split-nocue | model-echo | hinglish | fail | 54 | t10 model18 mem26 log0 | Hello Review,<br><br>Noted the first half. / Hello Review,<br><br>full value krmplqvbnx |
| L272 | leak | letters-long | owner-introduces | en | fail | 40 | t40 model0 mem0 log0 | Temporary password krmplqvbnxkrmplqvbnxkrmplqvbnxkrmplqvbnx / Sent to client. |
| O226 | overblock | fragment-overlap |  |  | overblock | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Please change that credential in your dashboard settings. / Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| O227 | overblock | fragment-overlap-word |  |  | overblock | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Please change that credential in your dashboard settings. / Please change that immediately. I will not repeat it back. I am escalating this as a secur |
| S007 | spread | eligible |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Sorry, I want to make sure I get this right - could you tell me a bit |
| S008 | spread | eligible |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Sorry, I want to make sure I get this right - could you tell me a bit |
| S009 | spread | eligible |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Sorry, I want to make sure I get this right - could you tell me a bit |
| S010 | spread | eligible |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Sorry, I want to make sure I get this right - could you tell me a bit |
| S012 | spread | eligible |  |  | fail | 0 | t0 model0 mem0 log0 | Hello Review,<br><br>Sorry, I want to make sure I get this right - could you tell me a bit |
| S032 | spread | borderline |  |  | fail | 0 | t0 model0 mem0 log0 | TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server Platform: Meta |
| S036 | spread | borderline |  |  | fail | 0 | t0 model0 mem0 log0 | TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server Platform: Meta |
| S038 | spread | borderline |  |  | fail | 0 | t0 model0 mem0 log0 | TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server Platform: Meta |
