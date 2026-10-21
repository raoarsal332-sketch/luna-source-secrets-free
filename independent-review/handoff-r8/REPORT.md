# Independent review: fixed-message handoff R8

Verdict: **BLOCKED**

This is a fresh review of frozen commit `5c39fd7001c06482470ff470d9ad0ea07b4ec37a` on `cursor/fixed-message-handoff-r8-8ad1` (draft PR #49). The author report was hash-checked only. Author tests were not run and were not used for the verdict. No `review/*` branch and no earlier review report was read.

No production, VPS, Intercom, customer data, or live secret was used. Nothing here was merged, approved, deployed, or sent to Intercom.

## Frozen hashes

All seven values match that commit:

| File | sha256 |
| --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `b296c6834a1d4cea2c4cc26e36fb1f8767245e53367de0afaa8e652a386e07c2` |
| `luna-current/01_runtime/index.js` | `14befdafb196637c51d34a8bab2f47ae2ca543c2e9a662a3a7e0a67d1332b74b` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `a72f4d467f79fce0dd7bf0643159ba8798def962b318b03847538d413ca29352` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `21d52aede4955b1373ef2f3356247514734685a7741d4c713efe82ae022ff549` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r8/FM_R8_REPORT.md` | `5c34c265ff8ef6bbe9057a9862656b5b23bd8871587adc93c298c9c9d5d6d8a7` |

## Method

`independent-review/handoff-r8/harness.js` loads the real `handleWebhook` from `luna-current/01_runtime/index.js`. Requiring that file does not listen or start pollers. `__setTestDoubles` was not used, so the real `icRequest` / write-op retry path ran.

Transport is an in-process axios recording stub. The model is a scripted queue. `http.request`, `https.request`, `net.Socket.connect`, `dns.lookup`, `dns.promises.lookup`, and `fetch` throw `NETWORK_TRIPWIRE`. Tripwire hits: **0**. The stub answered `faq.fundedelite.com` with 404 (190 calls); the runtime then used the local FAQ file. No other host was contacted.

State files point at a temp directory. The runtime copy of `02_statePresend` is placed as a real directory at `01_runtime/statePresend` because `presendMega.js` resolves `../repeatedClientQuestion` from that layout. That copy is a harness fixture and is not part of this review diff.

Synthetic ids only: human `88001021`, teammate `77001021`, conversations `91910000`–`91910200`, token `ICSYNTHR8TOKEN9F3A7C2E1B`, model key `sk-synthR8NOTREAL000111222333`. Canaries are `R8CANARY` plus a short hash. They do not collide with the known admin, team, or account ids. The locked spread template’s account number and password are the product’s own template, not canaries, and were excluded from the system-prompt secret scan.

Sealed set: **201** cases. Case seal `3cfad600f312a5acddb2a3843708ec2a1a5a9e61d8e24860a4300024edcde630` (sha256 of id, class, title, text, topic). Raw checker output is `results.json`. The checker’s severity is not the verdict: eight of its flags are harness mistakes, and one log-visible over-block was not scored.

There is no prior-round baseline in this review, so nothing below is labeled a regression against an earlier round. Findings are on this commit.

## Denominators

Checker, before reclassification: **178** pass, **6** critical, **17** major. `EMP-skip` is an observation and is also inside the pass count.

| Class | n | Checker pass | Product critical | Product major | Harness-only flag |
| --- | ---: | ---: | ---: | ---: | ---: |
| ownership | 54 | 53 | 0 | 1 | 0 |
| operator | 2 | 0 | 1 | 0 | 1 |
| atomicity | 28 | 22 | 1 | 1 | 4 |
| account-lang | 23 | 21 | 0 | 0 | 2 |
| live-lang | 18 | 18 | 0 | 0 | 0 |
| secrets | 19 | 18 | 1 | 0 | 0 |
| spread | 7 | 5 | 0 | 2 | 0 |
| promise | 12 | 9 | 0 | 3 | 0 |
| fin | 11 | 8 | 0 | 3 | 0 |
| identity | 11 | 11 | 0 | 0 | 0 |
| empty | 11 | 10 | 0 | 0 | 1 |
| control | 5 | 3 | 0 | 2 | 0 |
| **Total** | **201** | **178** | **3** | **12** | **8** |

After separating harness mistakes: **3** product criticals, **12** scored product over-blocks, **8** harness mistakes, **1** observation (`EMP-skip`). One further over-block (`SPR-negated`) is visible in the run log and was not failed by the checker, because that case did not assert `fixed: 0`.

Product-clean cases: **185** of 201, once `SPR-negated` is counted with the over-blocks (186 checker-clean of the 15 scored product flags, minus that one).

## Criticals by class

### (e) Secrets — `SEC-echo-punct` — product critical

A labeled symbol-bearing secret was remembered on an earlier turn (`password:` + canary + `a?b!c#`). A later turn echoed only the alphanumeric canary, wrapped in braces. The public reply was:

`Hello Nadira, value {R8CANARY73c2a60e963b9584}`

The same canary was in the model prompt. The echo matcher stores the canonical value with the internal symbols and only replaces that full span. A shorter alphanumeric prefix is not removed. Eighteen other secret cases passed: labels, apostrophe and curly-apostrophe separators, HTML entity, flex spacing, NFKC fullwidth, zero-width, `sk-`, `Bearer`, repeated base64, Urdu label, prompt redaction of a full labeled secret, model echo, history note, later unlabeled echo, fullwidth echo, and zero-width echo.

This is a customer-visible synthetic secret. It is the main reason the verdict is BLOCKED.

### (a) Human-owned threads — `OWN-operator-reply` — product critical

An authenticated `@Arsal REPLY` on a human-assigned thread posted `Thanks, a human already has this.` and an internal “Sent to client.” note (`AUTH_NOTE REPLY` on `91910054`). Property (a) is zero public posts from any path. A human-authored `@Arsal REPLY` (`OWN-human-command`) did not post. The ownership matrix did not post.

`OWN-operator-note` wrote only an internal note. The checker called that a public-post critical. That flag is a harness mistake: property (a) is public posts, and this path stayed internal.

The other 54 ownership cases did not put a public comment on a human-owned, human-assigned, or human-replied thread. Jerry, risk, escalations, stale assignment, ambiguous assignee, teammate author type, and a missing `part_type` all stayed silent. A human internal note does not by itself silence the bot; that is intended, and the one bot-owned FAQ beside a human note is the over-block below, not a property (a) miss.

### (b) Note before the fixed line — `ATOM-stranger-note-labels` — product critical

A human note `Account: 189143` / `Problem: something else` was treated as the verified handoff note. `noteInParts` matches those two labels on any author’s note. On `91910081` the runtime assigned `77001021` and posted `A teammate now has this conversation.` with **no** note HTTP of its own (`FIXED_HANDOFF sent welcome`). The checker scored this only as `notes 0`, because a seeded note short-circuits `fixed-without-commit`. The behavior is a property (b) failure: a stranger’s label-shaped note unlocks the customer promise.

`ATOM-comment-labels` did post the bot’s own note before the line. A public comment with those words is not accepted as the note.

## Property (b) otherwise

These held on the real webhook. The checker’s note-count misses are listed under harness mistakes.

- Assignment 422 is retried, then one fixed line. A second 422 still withholds; the following clean attempt sends once.
- Assignment 500, timeout, partial, and malformed withhold the line and are not replayed.
- Note 422 is retried, then one line (`91910062`: 422, then one note, one assign, one public line).
- Note 500 and note timeout withhold, and the retry stays on `note_ambiguous_held` with no public line.
- Note partial withholds the same way.
- Message 422 retries once. Message 500, timeout, and partial are not retried.
- An observed assignment after a 500 sends the line once and does not assign again.
- An observed note after a 500 continues once and does not post a second note (`91910074`). The checker’s `fixed-without-commit` on that case is a harness mistake: it ignored the injected note part and counted only 2xx note HTTP.
- An observed public line after a message 500 is not repeated.
- Lost ticket and op stores before the line recover once. Replay after completion, and a lost store after completion, do not duplicate.
- Parallel webhooks do not double the line. A follow-up does not send a second line. A human reply during a 422 hold blocks the line.
- A fixed-line string sitting in a note is not treated as already sent; the public line is still posted once, after the bot’s own note and assignment.
- An internal note is not treated as the customer’s answer (`ATOM-note-not-answered` did post). The post was the fixed line via presend, which is the over-block below, not “the note counted as answered.”

## Property (c) — promises and the hedge

No case posted a handoff sentence without a completed note and assignment, except the stranger-note case above (the note was not the bot’s).

Spread-template, near-miss, and bare-`55188` drafts on non-spread questions were not posted. `91910150`–`91910152` log `SPREAD_TEMPLATE hedge terminal`. An unsupported holding-time draft (`PR-wrong-number` / `PR-regen-fixed`, `91910189`–`91910190`) logged `UNSUPPORTED_NUMBER` and `PRESEND hedge instead of fixed line`. The approved hedge stayed byte-exact, including on the 2-step question and with no welcome prefix (`PR-hedge-2step`, `PR-hedge-first`, `HEDGE terminal` on `91910187`).

A template draft plus a real live-agent ask (`SPR-after-bot-live`) committed note, assignment, and one fixed line, and did not leak `55188`. That matches “no handoff promise unless a handoff commit succeeds.”

The cases the checker marked `fixed … wanted 0` had a successful note and assignment first. They are over-blocks, not uncommitted promises.

## Property (d) — locked 55188 reply

Eligible asks were byte-exact, including `conversation.user.created` (`SPR-created` `91910143`, `SPR-old`, `SPR-mt5`, each `SPREAD_TEST_REPLY`). A fresh `user.replied` spread ask stayed silent under Fin wait (`SPR-fresh-replied`, `SKIP fin-wait fresh-no-elite`) and did not leak the template. Spreadsheet, “spread” as a verb, and a negated spread question did not leak `55188`. No ineligible surface contained the locked password.

## Property (f) — empty escalation bodies

Empty or whitespace bodies on policy, holding-time, payout, and login messages escalated (note, assignment, one fixed line) and did not go silent. A greeting and a close did not.

`EMP-skip` is an observation, not a property (f) failure. The customer body was a payout rejection, and the model action was `SKIP`. The runtime logged `SKIP model … nothing to add` and posted nothing. Property (f) is empty bodies. This is a silence on an escalation-class message when the model explicitly skips.

`EMP-customer-empty` is a harness mistake. The fixture left the default source body `Hello` and added no user part (`USER_PART_FROM_SOURCE` on `91910186`). The runtime asked for the account number (`IDENTITY_BEFORE_ESCALATE`, `both_missing_ask_account`) and did not send the fixed line.

## Over-blocks

When the stub returns a non-answering FAQ line, presend classifies `MISSED_QUESTION` / `needs-escalate` and `commit` posts `A teammate now has this conversation.` after a real note and assignment. That is a completed handoff on a question the customer did not ask to hand off. It is an over-block, not an atomicity break.

Scored, all with note + assignment then one English fixed line:

| Case | What the customer asked | Log |
| --- | --- | --- |
| `OWN-note-only-faq` | daily loss, beside a human scratch note | `missed_escalation` `91910048` |
| `ATOM-note-not-answered` | daily loss, after an internal note | `missed_escalation` `91910079` |
| `SPR-sheet` | spreadsheet login | `missed_escalation` `91910147` |
| `SPR-verb` | positions “spread” across accounts, plus daily loss | `missed_escalation` `91910148` |
| `FIN-phrase-note-only` | daily loss; Fin phrase only in a note | `missed_escalation` `91910162` |
| `FIN-arsal-assigned` | daily loss; assignee is Arsal | `missed_escalation` `91910163` |
| `FIN-substantive` | payout / breach / daily-loss rule after a Fin public phrase | `missed_escalation` `91910164` |
| `PR-model-fixed` | daily loss; model draft was the fixed line | `missed_escalation` `91910191` |
| `PR-promise-sentence` | daily loss; model said it would pass to a teammate | `missed_escalation` `91910192` |
| `PR-urdu-promise` | daily loss; model draft was the Urdu fixed line | `missed_escalation` `91910194` |
| `CTRL-faq` | daily loss | `missed_escalation` `91910195` |
| `CTRL-tool-then-reply` | daily loss; first completion was a tool call with null content | `EMPTY faq body escalate` `91910199` |

Unscored: `SPR-negated` (`91910149`) took the same `missed_escalation` path. The checker only asserted that `55188` was absent.

`FIN-phrase-note-only` and `FIN-arsal-assigned` did **not** take `FIN_HANDOFF_WELCOME`. The Fin phrase in a note, and an assignment to Arsal alone, did not select the welcome handoff. The fixed line is the same missed-question over-block. `FIN-phrase-hello` did take the welcome path and sent one fixed line, which is what that case expected.

`CTRL-greet`, `CTRL-thanks`, and `CTRL-close` did not hand off.

## Languages, Fin wait, identity

Live-agent lines, 18/18: English, Urdu script, Roman Urdu, Hindi, Arabic, Hinglish, and Italian used the approved line. French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, and Indonesian used the English line. No wrong-language live line.

Account-number lines: English, Urdu, Roman Urdu, Hindi, Hinglish, Italian, and the English fallback for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, and Indonesian all matched, including `user.created` for English, Urdu, Hindi, and French. None of those sent the fixed handoff line.

Arabic account answers (`ACCT-ar`, `ACCT-CREATED-ar`) are a harness mistake on the wrong-language check, plus one observation. The public fact sentence is the approved Arabic line. The only code-point difference is combining-mark order on the last word: the source has shadda then fatha (U+0651, U+064E); the posted text has fatha then shadda, which is what NFKC does. The checker used a raw `includes` and reported a missing line. The welcome intro also prefixes `السلام علیکم` because any Arabic-script customer text takes that greeting. The fact line stays Arabic. Fixed live-agent lines skip that intro, which is why `LIVE-ar` matched exactly.

Fin wait held: `user.created` FAQ and hello wait; `user.created` live agent bypasses; fresh `user.replied` FAQ waits; fresh live agent bypasses; Elite-owned FAQ stays silent; Elite-owned live agent bypasses. Eligible spread on `user.created` bypasses. Account questions and identity questions are answered before the wait.

Identity, 11/11: bot, real person, AI-or-human, Urdu, Italian, and Roman Urdu disclosed and did not send the fixed line. Personal questions (wife, age) did not receive an AI disclosure or an account-number line. An identity-supply message was not answered as an account-number question.

## Harness mistakes

These checker flags are not product failures:

| Case | Why it is the harness |
| --- | --- |
| `OWN-operator-note` | Internal note only. Property (a) is public posts. |
| `ATOM-note500-then-observed` | The injected note part was ignored. The product assigned and sent one line, with no second note. |
| `ATOM-note-422` | The 422 was filtered out of the 2xx note count, so “notes 1 wanted 2” is the successful retry. One public line. |
| `ATOM-note-500` | The 500 was filtered. The retry logged `note_ambiguous_held` and posted nothing. |
| `ATOM-note-timeout` | Same as the 500: withheld, no public line. |
| `ACCT-ar`, `ACCT-CREATED-ar` | NFKC reordered shadda and fatha. The fact line is the Arabic sentence. |
| `EMP-customer-empty` | Source body was `Hello`. There was no empty user part. |

`committedBefore` also treats any seeded note as a successful handoff note, which hid `fixed-without-commit` on `ATOM-stranger-note-labels`. The product finding stands; the checker under-scored it.

## What this does not show

A substantive model answer to a daily-loss question was not in the sealed set, so the over-block is demonstrated for a non-answering draft, not for a correct FAQ answer. `EMP-skip` was not promoted to a property (f) critical. Operator `REPLY` posts the operator’s own sentence; it is still a public post on a human-assigned thread.
