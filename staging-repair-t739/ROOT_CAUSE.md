# Root cause — t757 traces and the outbound contract

Head before this change: `c9f957a5ffcb4c801123430ed82de5c2f3bb31a5`.
Traces use constructed dev examples only. No sealed text. Actual model: grok-4.7.
AUTHOR-TESTED. Not a sealed pass.

One customer-visible decision is now enforced at the last comment write:

| Decision | Public comment |
| --- | --- |
| Approved answer | Exact catalog or template body that covers the turn |
| Approved refusal | `packs.account-status.refuse.en` or `atom.account-status.refuse.en` when that module's existing personal/mixed predicate is true |
| Terminal abstain | No public comment and no model fallback |
| Hold | Credential, attachment, URL, staff, or lock denial. Nothing public |
| Normal unprotected | Selector-only or ordinary main-route prose (Option A) |

Final authorization re-checks content, eligibility, the ownership lock, language and protected-module policy, safety, the rendered payload, and the destination. It runs in `icRequest`, `icRequestUnguarded` (the same `approvedCommentHold`), and `control.js` `intercomRequest` for comments.

## 1. Packs dev 94/94 versus about 55% sealed false refusal

**Cause.** Two different environments were being compared, and the integrated handler then dropped 18 of the 69 gold sends for a third reason.

- The Packs dev harness scores `decide` and `publicRouter.route`. On this tree both are 94/94, false refusals 0/69, with `LUNA_PACKS_ENABLED=1`, catalog `bed88e6a…`, propositions `aff0f61f…`, and matcher-params `05e542ad…` (`T=0`, `M=null`).
- `docs/T742_DESIGN_LOG.md` records the stem-membership era at 55/94 correct and 39/69 false refusals. That is the ~55% figure. This tree does not use stems for `packs.*` or `atom.*`. `propositionFeed` ignores a stem `Set`. A missing `packs-propositions.json` would deny every packs id (69/69), not 39/69.
- On `c9f957a5` the full webhook, with a scripted model paragraph queued, delivered 51/69 gold sends and stayed silent on 18. The router and `decide` still matched 69/69. First divergence is not recognition, language, ranking, or retrieval.

The 18, by first divergence:

| Count | Ids | First divergence |
| --- | --- | --- |
| 17 | `packs.account-status.refuse.en` | Eligibility, then downstream gate suppression. `packsDecide` sends the refusal before proposition coverage. `coversAllIntents` required `statementCovers`, which is false for those personal/mixed asks, so the boundary returned `COVERAGE_DENIED`. |
| 1 | `PD-072`, `packs.my-packs-keys.en` | Downstream gate suppression. The V12 instruction-voice screen removed a sentence from the exact catalog body. `assertAllowlistedFinal` then returned `non-allowlisted-chunk`. |

**Source paths.** `candidate/approvedMatcher.js` `coversAllIntents`. `staging-repair-t742/packs/impl/packsDecide.js` (not edited). `candidate/faqAssistance.js` `execute`. `candidate/index.js` `postReplyWithOwnershipLock` screen. `candidate/publicReplyBoundary.js` `INSTRUCTION_VOICE`.

**Change.** `coversAllIntents` accepts the packs or atom refusal id when the existing module predicate says personal or mixed (`packsAccount.isPersonalOrMixed`, `atomModule.explain().personal`). An exact catalog composition is not passed through the instruction-voice screen, in FAQ execute or in `postReply`.

**Integrated result.** Webhook on the 69 gold sends: 69 approved bodies, 0 silence, 0 model calls. Packs dev harness remains 94/94, false refusals 0/69. Atom dev harness remains 401/401, false refusals 0/287, router mismatches 0.

**Limitation.** A reviewer copy that still treats stem containment as membership will still score about 55%. A copy that cannot load `packs-propositions.json` will deny every packs id. This change does not alter propositions, the catalog, `T`, or `M`.

## 2. F1 canned fallback

**Cause.** A recognized exclusive English flag-off ask through `handleWebhook` was already silent (0 public, 0 model) on constructed Packs and Atom examples. The remaining send was a direct comment of `Thanks for the details. I am checking this now and will update you here shortly.` when `bindTurn` had not stored the customer text. The boundary then treated the sentence as ordinary main-route prose. A greeting prefix does not change that once the turn is bound. Selector-only and ordinary FAQ asks still send that sentence. That is Option A, not F1.

First divergence of the unbound send: unauthorized fallback, then sender authorization. If a sealed item has no exclusive claim under `askClaim`, the first divergence is recognition. That was not reproduced for constructed exclusive asks.

**Source paths.** `candidate/publicWriteBoundary.js` `assertApprovedPublicOutput`. `candidate/index.js` `postClientCommentOnceInner`. `candidate/publicRouter.js` (not called from the boundary; `askClaim` / `flagOn` / `resolveClaims` only).

**Change.** Exclusive claim, module flag off, language `en` or `uncertain`: every public comment is denied except a design-eligible spread template. `postClientCommentOnce` fills a missing turn binding from the customer part before the write.

**Integrated result.** Direct unbound fallback on a constructed exclusive Packs ask: 0 public, `NOT_APPROVED_OUTPUT`. Webhook of the same ask with the sentence queued: 0 public, 0 model calls. `t6` F1 replay, burst, queue, and auth paths stay silent. `t10` covers the new case.

**Limitation.** A turn `claim` does not mark exclusive is still main route. Non-English exclusive stays the existing non-English route.

## 3. Ownership write lock

**Cause.** `withOwnershipWriteLock` is a queue. On `c9f957a5`, holding it and then running a main-route webhook produced 0 public writes during the hold, but the model ran and the paragraph was sent after release. `control.js` `intercomRequest` posted comments through its own axios and did not consult the lock or the boundary.

First divergence: sender authorization. State was held; the send path did not treat an armed lock as a reason to abstain.

**Source paths.** `candidate/index.js` `withOwnershipWriteLock`, `handleWebhook`, `icRequest`. `candidate/control.js` `intercomRequest`. New `candidate/ownershipWriteLock.js`.

**Change.** The lock records whether the caller is inside it. A webhook that arrives while the lock is armed returns before the model and does not send after release. A comment write outside the lock is denied in `icRequest` and on the control comment path. Concurrent `postReply` calls still serialize and both send (`t3`).

**Integrated result.** Armed lock, scripted student-discount paragraph: 0 public, 0 model calls, including after release. Log: `SKIP ownership-lock-armed`. Control authorization of the canned sentence on an exclusive turn: `NOT_APPROVED_OUTPUT`, 0 public.

**Limitation.** A comment that has already entered the lock still completes when the previous holder finishes. That is the serializer. The armed-intake skip applies to a new webhook, not to a send already inside the lock.

## 4. Spread state

**Cause.** Measured on constructed turns at `c9f957a5`:

| Turn | Before | First divergence |
| --- | --- | --- |
| Idle `spread-test-credential` ("can I get a demo login to check spreads") | Template sent, state `offered` | None. The sealed miss was not reproduced on this sentence |
| Idle `strong-spread-phrase` ("what are the spreads?") | No template, state idle | Design: idle entry is only `spread-test-credential` |
| Offered, personal cue ("my login will not accept the password") | 0 public, state idle | None |
| Offered, no personal cue ("please look at my payout status", "thanks, that helps") | Template sent | None. Silence here would be a false refusal |
| Older event than the stored `eventAt` | Template sent, reason `offered-resend` | State/persistence. The older event overwrote nothing in the return, but it did send |
| Template plus a link | `NOT_APPROVED_OUTPUT`, 0 public | None. URL hold already applied |
| Personal spread complaint with no test-credential reason | No template. A short main-route identity sentence can still post | Not a spread-template send. Design forbids the template, not every main-route sentence |

**Source paths.** `candidate/spreadTestState.js` `onTurn`. `candidate/index.js` spread post. `candidate/spreadAskGate.js` (not edited). `candidate/spreadPublicGuard.js` (not edited, sha256 `2158c43f…`).

**Change.** An older `eventAt` returns no send, does not save, and sets silence with reason `out-of-order`. Entry remains `spread-test-credential` only.

**Integrated result.** `t8` later non-personal offered turn still sends the template. A seeded newer `eventAt` plus an older user part sends 0 public and keeps `eventId` `newer-event`. `t1` guard copy remains byte-identical to `2158c43f`.

**Limitation.** The sealed "eligible entry missed the template" case was not reproduced on the constructed `spread-test-credential` sentence, which already sent. No entry rule was widened. A personal spread complaint can still take the ordinary identity path. That path does not post the spread template.

## What was not changed on 98e3a91

The list below is that contract commit. The cycle-2 freeze later in this file integrates the author module commits. It does not edit those modules further.

- Packs and Atom module logic (`packsDecide.js`, `atomModule.js`, propositions, catalogs).
- Design file sha256 `17e89179ae28881e2eb20b1116be7f852750ba0958009947a61c8269f820808c`.
- `matcher-params.json` sha256 `05e542ada2b4f3a937c6422c308b4f72070a7fa6a25c7cfd1fe3b9e53ad8df3f`, status frozen, `T=0`, `M=null`.
- Option A, F1/F2/F5, STOP, aiOff, Fin-wait, Risk, ownership, duplicate inflight, and the lock serializer.
- `t3` frozen pair: 27/29. The two F1 outcomes `existing-unowned-faq-path` and `module-off-fail-closed` were not "fixed".

## Author results on 98e3a91

These numbers are the contract head before Atom `63165ef6` and Packs `cfcc2292`. They are not the freeze result. The freeze table is in `FREEZE_MANIFEST.md`.

| Check | Result |
| --- | --- |
| t1 detector | 57/57 PASS |
| t2 transport | 54/54 PASS |
| t3 faq/language/module | 27/29 FAIL (frozen pair, unchanged) |
| t4 logs | 8/8 PASS |
| t5 isolation (`unshare -rn`) | 10/10 PASS |
| t6 modules | 39/39 PASS |
| t7 corpus | 6/6 PASS |
| t8 remediation | 7/7 PASS |
| t9 remediation | 6/6 PASS |
| t10 contract | 5/5 PASS |
| Packs dev `decide` / `route` | 94/94, false refusals 0/69 PASS |
| Packs gold-send webhook | 69/69 approved, 0 model PASS |
| Atom dev module and router | 401/401, false refusals 0/287, mismatches 0 PASS |
| Sealed set | UNTESTED |
| Production / Intercom | BLOCKED (not run; staging only) |

## Cycle-2 freeze

Atom `63165ef6` (commit `31d8f7b`, source `db98c83` on `t742-impl-atom`) and Packs `cfcc2292` are on one candidate. The outbound contract stays the authority. Conflict resolutions and the rerun are in `FREEZE_MANIFEST.md`.

t6 ON2 fails because Atom now abstains `unresolved-policy` / `policy.fee-refunds` on "Can I get my Atom challenge fee back after the first payout?" before the account-state refusal. Atom logic was not edited to make that assertion pass. The t3 F1 pair is unchanged. Packs held-out required sends stay 7/12 exact. Nothing was tuned toward that score.
