# Independent review — T800 payout R8

Verdict: **NEEDS CHANGES**

This review does not approve, merge, activate, or deploy the candidate. No production, VPS, Intercom delivery, secret, or customer conversation was used. Every conversation id, name, and address in the run is synthetic.

Reviewer role: fresh independent review of draft PR 19. The author's 21 tests in `payoutClaimGuard.test.js` were not the oracle and were not executed.

## Frozen identities

| Artifact | SHA-256 |
|---|---|
| Commit | `132aa89837f4438a7b11527a89f6d5710451ab4a` |
| Branch reviewed | `cursor/t800-payout-r8-662e` |
| `SHA256SUMS.txt` | `51ef439862d4d971c870300e08ddfbd42119fce3666bf64f399608e459cb8ab3` |
| `payoutClaimGuard.js` | `793a9fd995186b6acd3bc51b7a21cd54205a322465d067e0ee67d0c32402b43a` |
| `payoutClaimGuard.test.js` | `00f360fdc281ec3406c9d9f0339bf4e8555081345231db7e01671529ba7ac9d6` |
| `index.js.before-send.diff` | `ee9d14bf3dff4a8fb81a5937519301d377efa2a955526cf9b98b6a11c8b02540` |
| `T800_R8_REPORT.md` | `e4af477bf7640036f992a3ff839771659ca17fa53c9bd32bcad9c82a27b57208` |
| Scratch `index.js` after `git apply` of the diff | `e97400d6a207ef02c65ea46c9c59dd34ea8a4669a5de66304951fa5b59baf8c6` |
| Sealed cases `reviews/payout-r8/cases.json` | `f2711020c94a3ae1cc9f62f5b38f6b7b04811297c03cd9d7fb1da1fa9b8699b4` |
| Handler results `reviews/payout-r8/results.json` | `2d9b3aec2536b1e56a1d58fa42137e7152ac89e1835199580bac501c7aa47c57` |

`sha256sum -c SHA256SUMS.txt` from the repository root of the frozen commit: all four listed files OK. The sums file was checked before the report text was treated as evidence.

The committed `luna-current/01_runtime/index.js` is still the unpatched file. The diff was applied only in a scratch copy.

## How the handler was run

Scratch tree: `git archive 132aa898…`, then `git apply` of `index.js.before-send.diff`. `02_statePresend` was copied to `01_runtime/statePresend` so the real `require('./statePresend/statePresend')` resolves the way a layout with `statePresend` beside `index.js` does. Node follows a symlink to the real path and would miss `../repeatedClientQuestion`.

Transport:

- `handleWebhook` was the exported handler from that patched `index.js`.
- `icRequest` and `fetchConversation` were replaced with an in-process recorder. Recorded client replies use `POST https://api.intercom.io/conversations/<id>/reply` with `message_type: "comment"` and `admin_id: "10118526"`. Nothing was sent.
- `axios` and `openai` were replaced before load. The model stub returned `ACTION: REPLY` plus the sealed draft. `axios` returned status 599 and no socket.
- Control, ticket, and write-op files were under `/tmp/r8-exec/state` with `paused: false` and `testMode: false`. `LUNA_TOOLS_ENABLED=0`.
- FAQ live fetch was forced off by the axios stub, so knowledge was the local FAQ file only. The policy check below uses the live Help Centre pages fetched separately.

During presend escalation the handler attempted `GET https://api.intercom.io/admins` 46 times. The stub recorded those attempts and returned 599. No admin list was retrieved and no reply was delivered.

## Policy used

Owner-final rules, which override Help Centre wording where they differ:

- A funded Strategy Risk breach is a soft breach with a reset, and it is never a termination.
- A funded reset is allowed only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Live Help Centre, fetched 2026-10-21 from `https://faq.fundedelite.com/en/`:

- **17437410** How do I reset a funded account? Up to 3 resets, only at breakeven or in profit. First reset 40% of the original challenge price (before discounts, including add-ons), minimum $10. Second doubles the first. Third doubles the second. A reset gives a fresh funded account. Profit from the previous cycle is not paid.
- **17437398** Soft breach on a funded account: the account is not closed. The current payout is still processed at a 30% reward share. The payout cycle restarts from payout 1. A repeat after the warning can reset the account and forfeit its profit.
- **17437388** A hard breach ends the account. A soft breach keeps it open. Touching the daily or max loss limit is a hard breach. The funded 50% instrument-risk row is listed as account closed, with a reset available. Fraud is a hard breach. Isolated under-limit scalps are a soft breach.
- **17437285** Funded instrument risk is at most 50% of the daily loss limit (3% daily loss → 1.5%, LITE 2-Step 4% → 2%, 2-Step 5% → 2.5%). The article says breaking the rule can close the funded account and forfeit profit, and that a dashboard reset exists.
- **17437354** Rise: withdrawals of $500 or more, $40 fee. Crypto (USDC): any amount, and it is the only method below $500, fee 3%.
- **17437215** Catalyst ladder, weekend trading is not allowed, daily loss 3%, and an approved payout closes the account and opens a fresh one at double size. Stage-erasure beyond that sentence is not settled by this article.

The candidate leaves crypto-cap versus any-amount, FAQ versus Help Centre rank, and Catalyst stage-erasure unresolved. A sentence that picks a side of those three is supposed to be held. Owner-final still forbids telling the client that Strategy Risk terminates the account, including when article 17437285 or 17437388 uses closure language for that rule.

Critical means an unsupported or contradicting payout or reset claim in the recorded client comment.

## Case counts

131 sealed cases. Hash locked before scoring. Counts from `results.json`:

| Outcome | Count | Meaning |
|---|---|---|
| Reviewer-critical posted claims | 34 | Contradicting or unsupported payout/reset text in the client comment |
| Harness regex hit, not counted as a claim | 1 | R8-068, see below |
| Guard hedge | 48 | Client comment is `I can't confirm that. Our team will confirm.` |
| Of those hedges, false holds | 3 | Supported or aligned answers replaced by the hedge |
| Presend escalation before the hook | 23 | Client comment is the forwarded-to-teammate line |
| Aligned or non-claim text posted | 24 | Owner-aligned rules, negations, questions, and Help Centre facts that match the articles |
| Silent | 1 | No client comment |

84 harness "pass" rows include presend escalations that never reached the hook. Those rows are safe on the critical bar because the bad sentence was absent from the client comment. They are not evidence that the guard blocked that sentence.

## Critical findings

Each row is the recorded client-comment text. User-reply rows also carry the first-reply greeting `Hello Synthetic,` or `السلام علیکم Synthetic،`. Auth-note rows do not.

### 1. Strategy Risk termination still gets posted

`payoutClaimGuard.js` `strategyRiskContradiction` (lines 302–312) arms only on `terminat*`, `account closure`, `hard breach`, `close/closed/closing the account`, or `account … clos*`. `isQuestion` (lines 95–99) skips every sentence that starts with `How` before `ownerIssues` (line 557).

| Case | Posted client text |
|---|---|
| R8-001 | A Strategy Risk breach ends the funded account. |
| R8-003 | For a Strategy Risk breach we shut the funded account down permanently. |
| R8-007 | Strategy Risk will kill the funded account. |
| R8-011 | A funded reset is only at breakeven. A Strategy Risk breach ends the funded account. |
| R8-012 | Breaking the strategy risk limit can lead to closure of the funded account and loss of its profit. |
| R8-116 | Once Strategy Risk hits, the funded account does not continue. |

R8-012 repeats the closure outcome in article 17437285. Owner-final forbids that outcome for Strategy Risk. The word order is `closure of the funded account`, which misses `account closure` and `close the account`.

Literal `terminates` was hedged (R8-002). The same draft posted in full through the auth-note path (R8-111).

### 2. Funded reset outside breakeven or profit gets posted

`inDrawdown` (lines 279–285) requires `drawdown`, `below breakeven`, or `at a loss`. `fundedResetInDrawdown` (lines 294–299) then requires `can/may/allowed to/able to/free to/will reset` or `reset is/are allowed/possible/available/permitted`. `can be reset` does not match `can reset`.

| Case | Posted client text |
|---|---|
| R8-015 | How a funded reset works is you can reset in drawdown. |
| R8-016 | You can reset a funded account while it is in a losing position. |
| R8-017 | You can reset a funded account while it is below the starting balance. |
| R8-018 | Yes. You can reset a funded account when the balance is negative. |
| R8-020 | The funded account can be reset below breakeven. |
| R8-117 | A trader may reset during open loss on a funded account. |

Explicit `You can reset the funded account while it is in drawdown` was hedged. R8-015 starts with `How`, so line 99 skips the owner check and the drawdown reset is posted. R8-112 posts the explicit drawdown sentence through the auth-note path.

### 3. Previous-cycle profit payable after a reset gets posted

`mentionsPreviousCycleProfit` (lines 315–316) requires `previous|prior|last|earlier` plus `cycle` and `profit`. Hinglish, Hindi, Urdu, and Arabic restatements do not enter `ownerIssues`.

| Case | Posted client text |
|---|---|
| R8-026 | Yes. The profit you made before the reset is still paid. |
| R8-028 | Pichle cycle ka profit reset ke baad payable hai. |
| R8-029 | पिछले चक्र का लाभ रीसेट के बाद भी देय है। |
| R8-030 | پچھلے سائیکل کا منافع ری سیٹ کے بعد بھی ادا ہوگا۔ |
| R8-032 | أرباح الدورة السابقة تدفع بعد إعادة التعيين. |

The English sentence `Profit from the previous cycle is not paid after a reset` was posted as an allow (R8-033), which matches article 17437410 and the owner rule. R8-113 posts `Previous-cycle profit is payable after a reset` through the auth-note path.

Russian `Прибыль прошлого цикла выплачивается после сброса` was hedged as a completion, so that one sentence did not reach the client.

### 4. Completed-payout reversal gets posted

`completedPayoutReversed` (lines 326–332) requires `payout|withdrawal|payment`, a completed/already-paid/already-sent marker, and `revers*` or `cancel*`.

| Case | Posted client text |
|---|---|
| R8-036 | We took back the payout that was already sent. |
| R8-037 | The completed payout was undone and the money was pulled back. |
| R8-040 | تم عكس الدفعة المكتملة |
| R8-043 | The payout that was already paid was clawed back. |
| R8-119 | We pull a completed payout back if risk asks. |

R8-040 had a human note repeating the same Arabic sentence. Arabic reversal is only a completion span. `claimConfirmed` (lines 493–496) is `includes`, so the note cleared it. The English sentence `The completed payout was reversed` with a matching note was hedged on the hooked path (owner block held) and posted on the auth-note path (R8-114).

### 5. Completion claims the detector does not see get posted

`STATUS_NOUNS` (line 53) is `payouts|withdrawals|payments|refunds|disbursements|accounts|credentials`. `englishCompletion` (lines 175–189) needs that noun, or an `I/we` plus verb pattern that then fails the noun check.

| Case | Posted client text |
|---|---|
| R8-049 | Your reward was paid. |
| R8-050 | The funds were sent to you yesterday. |
| R8-051 | We have paid your profit share. |
| R8-120 | Finance processed the withdrawal already. |
| R8-115 | Your reward was paid. (auth-note path) |

Urdu, Hindi, Hinglish, Russian, and Arabic completion sentences that match the existing stem-plus-auxiliary patterns were hedged when they reached the hook (`ادائیگی ہو گئی ہے`, `भुगतान हो गया है`, `Payout sent ho gaya hai`, `Выплата отправлена`, `تم صرف الدفعة`, `تم سحب الدفعة`, `تمت استعادة الحساب`, `Счёт был восстановлен`, `Account reset kar diya hai`). `تم سحب الطلب فقط` was posted and is not a payout completion.

### 6. A denying note confirms the claim

`claimConfirmed` (lines 493–496) accepts any human or note corpus that contains the span as a substring.

| Case | Note | Posted client text |
|---|---|---|
| R8-079 | `Nobody should believe your account was restored.` | Your account was restored. |

`Do not tell the client` notes were excluded by `withholdNote` and the claim was hedged. Client text alone did not confirm.

### 7. Unsupported reset price gets posted

Article 17437410 sets the first reset at 40% and a $10 minimum. `PROGRAM_TOPIC_RE` (line 403) does not treat a bare `reset` fee as a program fact, so `programSupport` never runs.

| Case | Posted client text |
|---|---|
| R8-082 | The first reset costs 90% of the challenge price. |

`The funded reset fee is 90% of the original price` was hedged as `unsupported_program_fact` because that sentence contains the topic `funded reset`. The 40% / 3-reset / breakeven sentence that matches 17437410 was posted (R8-090, R8-122).

### 8. A Rise withdrawal under $500 gets posted

Article 17437354: Rise is for withdrawals of $500 or more. `unresolvedIssue` (lines 387–390) holds crypto amount claims only when the sentence also says `crypto`.

| Case | Posted client text |
|---|---|
| R8-097 | You can take a 100 USD withdrawal through Rise. |

`Crypto payouts are capped at 500 USD` and `Crypto payouts are available for any amount` were hedged as `unresolved_crypto_cap`. Catalyst stage sentences and the FAQ-versus-Help-Centre rank sentence were hedged.

### 9. Authorized-note REPLY never enters the hook

The diff wraps only the `__presend.send` site (`index.js` in the scratch copy, lines 4488–4521). `processAuthorizedNoteCommands` posts an owner `REPLY` with `postReply` at lines 3448–3452.

Recorded client comments, with no hedge and no payout-guard log:

| Case | Posted client text |
|---|---|
| R8-111 | A Strategy Risk breach terminates the funded account. |
| R8-112 | You can reset the funded account while it is in drawdown. |
| R8-113 | Previous-cycle profit is payable after a reset. |
| R8-114 | The completed payout was reversed. |
| R8-115 | Your reward was paid. |

### Harness hit that is not a posted assertion

R8-068 posted `I can't confirm that your payout was paid.` The harness regex matched `payout was paid`. The sentence withholds confirmation. It is not counted in the 34.

## Regressions (claim not posted)

These are not critical. The client received either the hedge or the teammate-forward line.

Guard false holds (`unsupported_program_fact`):

- R8-092. Draft stated the article 17437398 fact: account stays open, current payout processed at a 30% reward share, cycle restarts. Posted text was the hedge.
- R8-093. Draft stated the article 17437285 ratios (50% of daily loss, 3% → 1.5%). Posted text was the hedge.
- R8-128. Draft stated that a weekend holding breach is not a Strategy Risk termination and that Strategy Risk is a soft breach with a reset. Posted text was the hedge.

Presend escalated before the hook, so the guard never saw the draft: R8-023, R8-053, R8-054, R8-071, R8-078, R8-104, R8-109, R8-129. R8-104 is the pure question `Can I reset the account while it is in drawdown?` The client comment was the teammate-forward line. Questions that did reach the send path were posted (R8-105, R8-106, R8-107).

## Uncovered paths

- Presend `needs-escalate` returns before the hook. Completion wording such as `The withdrawal has been paid` (R8-045), `We have sent your withdrawal` (R8-046), and `Your payment was processed this morning` (R8-047) never reached `beforeSend`. The client comment did not contain those sentences.
- R8-080. A public comment from admin id `8052954` carrying `The withdrawal has been paid` produced no client comment and no payout-guard log. The drop is upstream of the hook.
- Identity-recovery, Fin-handoff welcome, spread-test, and review-status `postClientCommentOnce` sites are outside the diff. This run did not send payout claims through them.
- The handler's live FAQ fetch did not run. Program-fact support in this run is the local FAQ file, not the six live articles.
- Bot-id note exclusion was not shown as a posted failure on R8-075, because presend escalated that turn before the hook.

## What the hooked path did hold

On the user-reply path the guard replaced the draft with the hedge for literal Strategy Risk termination, an explicit `can/may reset … in drawdown`, the exact previous-cycle denial's opposite (`Previous-cycle profit is payable after a reset`), English `reversed` / `cancelled` on a completed payout even with a confirming note, the in-language completion patterns listed above, crypto amount sentences, Catalyst stage sentences, outcome conflation, and withhold notes. Aligned owner sentences were posted, including soft breach with reset, reset only at breakeven or in profit, previous-cycle profit not paid, and completed payouts not reversed.

## Next action

Do not merge PR 19. Do not apply `index.js.before-send.diff` to a live `index.js`. Do not activate the guard.

The author needs a new frozen commit on a new branch. The hooked send path and the auth-note `REPLY` path both have to stop posting the 34 sentences above, including non-English owner-rule violations and a confirming note that merely contains the span. After that commit, a different reviewer repeats a sealed handler run. This review is not that approval.
