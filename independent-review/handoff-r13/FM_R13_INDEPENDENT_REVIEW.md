# Independent review: Fixed-Message Handoff R13

Verdict: **FAIL**

The freeze at `d769d0aa25143698a804936991eb239cdfa0fb15` was reviewed through the real `handleWebhook`, a recording transport, and a stub model. The network tripwire stayed on. No production, VPS, Intercom, or secret store was contacted.

PASS required 0 product-critical findings, 0 leaks, 0 candidate-only regressions, 0 unjustified corpus diffs, and 0 recovery failures. This run has 2 product-critical lost handoffs in the sealed set, 13 recovery failures, and 0 leaks. Candidate-only regressions against both R11 and R12 are 0. Corpus diffs against R11 and R12 are covered by the sealed justifications.

## Freeze

| Pin | Commit |
| --- | --- |
| R13 | `d769d0aa25143698a804936991eb239cdfa0fb15` |
| R12 | `b9ebaacc83e7d15f028799f7ba9139006ded19b7` |
| R11 | `1a5c35f754d5d5e80336a24b7371676e52ce9bf6` |
| baseline main | `e999d3c8caf327bf9a102e5ba562d9c114a92109` |

`luna-current/10_synthetic_lanes/fixed-message-handoff-r13/FM_R13_REPORT.md` SHA-256 is `bab7cd19feff1c67b3587f3bb6710c1ae20d9e3bc114338965577853e393443d`. All 9 file hashes listed in that report match the freeze. The only runtime files that differ from R12 are `luna-current/01_runtime/fixedMessageHandoff.js` and `luna-current/01_runtime/index.js`.

## Sealed set

`independent-review/handoff-r13/cases.json` was hashed and committed before any candidate run.

| Item | Value |
| --- | --- |
| SHA-256 | `56d0c9b801881ba8a15d780404cff90f24c73afb585828ac6c7c7d7ec03d0610` |
| Cases | 294 |
| Corpus | 276 |
| Recovery | 18 |
| Seal commit | `a769cdbe0b18e05c44e4c1f6ed9313e27fad8134` |

The case file was not regenerated. Harness edits after the seal do not change expected bytes. They stop the stub from treating the Luna system prompt as an owner command, they recognize the Hindi, Hinglish, Urdu, and Italian account lines, and they count a fixed line only on a 2xx comment. A rejected 422 or 429 body is not a delivered line. Secrets are still scanned on every recorded request.

## Part A

276 non-recovery cases on R13. 247 passed. 29 failed the sealed expectations. 0 secret leaks. 0 tripwire hits.

| Class | Count | What happened |
| --- | --- | --- |
| product-critical | 2 | A human request received a clarifier and no assignment |
| defect | 6 | A handoff happened, and the fixed line was the wrong language |
| unnecessary handoff | 15 | A FAQ received the fixed line and an assignment |
| over-block | 4 | A clarifier or a password-policy FAQ was replaced |
| oracle false positive | 2 | The account id was never in an outbound draft |

### Product-critical

`matrix-ur-24` (`بات آدمی`) and `matrix-ur-30` (`ملاؤ آدمی`) posted `Please tell me which challenge you mean.` and made 0 assignment calls.

`detectLanguage` returns Arabic when the text has Arabic-script letters and no Urdu-only letters. `آدمی` is in the Urdu role list and not in the Arabic role list, so the Urdu grammar never runs. Welcome `decide()` returns `route_normal` / `not_handoff`. The webhook then answers on the normal path. R11 and R12 produce the same signature, so this is not a candidate-only regression. It is still a lost handoff of a human request on the candidate.

### Defect (wrong locked line)

These assigned Seat A and posted one locked line, in the wrong language.

| Case | Sent |
| --- | --- |
| `parity-hing-baat` (`agent se baat karni hai`) | English |
| `ext-hing-roman-milao` (`agent se milao please`) | English |
| `matrix-ur-20`, `matrix-ur-23`, `matrix-ur-26`, `matrix-ur-29` | Arabic |

`agent` is a short English role, and those Roman sentences have no South Asian function-word score, so the language stays English. The Urdu matrix sentences have no Urdu-only letters; Arabic short-role matching hits `انسان` and the Arabic line is sent. R11 and R12 send the same lines.

### Unnecessary handoff

Welcome `decide()` is `route_normal` for these FAQs (`not_handoff`, or `arsal_already_replied` when a prior bot comment exists). `decide()` sets `force` whenever `path !== 'welcome'`. A later presend hold calls `commitFixedMessageHandoff` with a non-welcome path, and that forced decision posts the fixed line.

The same signature is on R11 and R12. The sealed baseline note says a fixed line is not an acceptable wording change. That failure is recorded here. It is not an unexplained R13-only corpus diff.

- Arabic: `ما هي قواعد السحب؟`, `ما هي قواعد التداول؟`, `كيف أسحب الأرباح؟`, `ما هي ساعات السوق؟`, `ما هي الرافعة المالية؟`
- Urdu: `نکالنے کے قواعد کیا ہیں؟`, `روزانہ نقصان کی حد کیا ہے؟`
- Hindi: `दैनिक नुकसान सीमा क्या है?`, `निकासी के नियम क्या ہیں?`, `लीवरेज क्या है?`
- Hinglish: `withdrawal rules kya hain`, `profit target kya hota hai`
- English: `Are expert advisors allowed?`, `Is weekend holding allowed?`, `Which countries are restricted?`

### Over-block

`clarifier-posted`, `clarifier-which-challenge-variant`, and `cred-overblock-pass-the-target` asked the stub for a challenge clarifier. The public body was the number hedge: `I can't confirm that figure from the approved details, so I won't guess a number.` Presend treats a missed KB FAQ as `faq-hedge` and the webhook posts that hedge.

`cred-overblock-password-policy-faq` (`What is the password policy for the dashboard?`) posted the English fixed line. The handoff note's problem field was `What is the password [secret]`. The word `password` caused the rest of a policy question to be redacted, and the forced path handed the thread off. The canary itself was not present.

### Oracle false positives

`cred-overblock-account-kept` posted the locked English account line and did not repeat `219876`. `identity-supply-not-handoff` posted the clarifier and did not repeat `189143`. Neither id was in a model draft that the sanitizer then stripped. These two are not over-blocks. The sealed cases were not edited.

### What passed

Silence held for human-owned, human-reply, reopened, aiOff, paused, Fin-wait, Risk, Escalations, and Jerry-assigned threads (35). Owner spoof and unauthenticated notes stayed silent (9). Write validation withheld the fixed line for `error.list` on 200, `data: null`, an unnamed body, an unnamed partial, the wrong seat, a 422 comment, a still-bot live seat, and a seat that flips back before the comment (9). The live re-check case is `write-flip-before-comment`. Byte-exact English, Urdu, Arabic, Hindi, and Italian lines passed, including the Arabic and English account lines. Status pings stayed pings. Team-review drafts became the hedge and did not say `team will review`. Empty-model FAQ paths did not hand off.

R11 posted a fixed line on four write-failure cases where R13 withheld it: `write-unnamed`, `write-unnamed-partial`, `write-still-bot`, and `write-flip-before-comment`. Those are not dropped customer requests. R11 delivered a line the assignment response did not verify. R12 already withholds them. The sealed `justify.r11` text covers that change.

## Part B

### Author suites

Every suite was executed under the tripwire. Suites that are not in a tree are N/A, not failures. A candidate-only failure would fail on R13 and pass on both R11 and R12. There are none.

Handoff lanes R2–R13 exited 0 wherever the file exists. R13 passed counts: r2 16, r3 33, r4 10, r5 8, r6 9, r7 9, r8 7, r9 5, r10 7, r11 5, r12 6, r13 3. The same counts passed on R11 and R12 for the lanes those trees contain. Main has no handoff lanes.

Repair scenario totals were 58 pass / 0 fail on main, R11, R12, and R13. Selftests: main `selftestFail 0`; R11, R12, and R13 `selftestFail 2` (`selftest-identity-before-escalate.js`, `selftest-lock-harden.js`). Shared with R11 and R12, so not candidate-only.

Failfix identity and variant passed on all four trees. Failfix retrieval died with `MODULE_NOT_FOUND` from `09_failfix_staging/faq-kb.js` on all four trees.

Maintainer: 18 passed, 9 failed on all four trees. The failures are the sandbox path, a missing `luna-current/teammateHandoffGates.js` for the patch fixture, an empty golden pack, and the deploy cases that depend on that patch. Same set on main.

### Corpus

276 cases against main, R11, R12, and R13. Signature is class, fixed-line bytes, successful assignment count, and secret leak. 0 secret leaks on R13. 0 fixed-line byte mismatches against R11 or R12 where both sides sent a fixed line.

Diffs versus R11: 8. Four are morphology handoffs R11 missed (`parity-ur-numainda`, `ext-ar-hamza-plural`, `ext-ar-hamza-plural-tanween`, `ext-ur-milao`), covered by the sealed R11 note that stem, clitic, hamza, and tanween matching sits above the R11 floor. Four are the write-validation withholds above, covered by the sealed note that a failed assignment is read before an ambiguous hold and that the live seat is read again before the line.

Diffs versus R12: 9, all Arabic clitic, tanween, hamza-plural, or alef-stem handoffs that R12 left on the clarifier. The sealed R12 note covers that morphology change. The fixed line in each case is the Arabic line.

No R13 oracle failure passes on both R11 and R12. R13 fails 29 corpus oracles; R11 fails 37; R12 fails 38; main fails 220.

Baseline diffs are the handoff behavior main does not have, plus FAQ fixed lines that R11 and R12 already send. Silence, owner authentication, and the account lines match R11 and R12. The FAQ fixed lines remain unnecessary handoffs in Part A. They are not candidate-only.

## Part C

18 recovery cases. Each step is a new process. 5 passed and 13 failed on R13. The same 13 failed on R12 with the same delivered-line counts. Not candidate-only. The candidate still loses the handoff, so the recovery bar is not met. No 2xx duplicate fixed line occurred. Human silence during recovery held.

Passed:

- `rec-duplicate-after-success`: one fixed line, the repeat does not send another.
- `rec-429-note-then-next` and `rec-429-assign-then-next`: the rejected write is retried on the next message and one line lands.
- `rec-422-assign-then-restart`: a definite assignment 422 is retried and one line lands.
- `rec-human-silence-during-recovery`: a human reply keeps the thread silent.

Failed, all with zero delivered fixed lines:

| Case | Why the next message does not finish the handoff |
| --- | --- |
| `rec-timeout-not-landed-then-next`, `rec-500-not-landed-then-restart`, `rec-kill-after-note-before-assign` | The assignment times out or returns 5xx and does not land. The op store records `unknown`. The next process logs `IC_REQ_REPLAY_SUPPRESSED` and does not send the assignment again. The ticket stays `assignAmbiguous`. |
| `rec-timeout-landed-then-wipe`, `rec-500-landed-then-restart` | The seat does change to Seat A. The next message is classified as human-owned and returns before the recovery commit, so the owed fixed line is never posted. Wiping the op store does not reach that commit. |
| `rec-422-comment-then-restart`, `rec-500-comment-not-landed`, `rec-timeout-comment-not-landed`, `rec-429-comment-then-next`, `rec-remove-note-after-assign`, `rec-corrupt-op-store` | The assignment has already landed and the comment has not. The next message hits the same ownership return. A 422, 429, 500, timeout, a removed note, or a corrupt op store does not get as far as the comment retry. |
| `rec-timeout-note-then-restart` | The note times out and is stored as `unknown`, so the replay is suppressed. The next message is answered with the clarifier. |
| `rec-500-note-then-wipe` | The note returns 500. Wiping the op store and sending another message still produces no fixed line. |

`recheckHold` is set for a recovery path and for a saved `assignAmbiguous` flag. On these failures the webhook returns at ownership silence or at op-store replay suppression before that retry can post the line. A 429 on the note or the assignment is stored as `failed`, not `unknown`, the seat is still the bot, and the next message completes. That is why those two 429 cases pass and the comment 429 case does not.

## Part D

Replacing `fixedMessageHandoff.js` and `index.js` on the R13 tree with the R12 bytes reproduces the R12 corpus.

| File | SHA-256 |
| --- | --- |
| R12 `fixedMessageHandoff.js` | `a466d7665ef96808240ce8e7ec59f366eec359fdbba9f6bdf3536b7b022f1f4c` |
| R12 `index.js` | `4bd065dd5e5b7d7c14ddf5de656c1a19c59ab1134c6fe4c16c27ea704425a0b0` |

The restored copies match those hashes. All 276 corpus signatures match the pure R12 run. Rollback of the two runtime files is byte-exact.

## Gate

| Gate | Result |
| --- | --- |
| Product-critical | 2 |
| Leaks | 0 |
| Candidate-only regressions versus both R11 and R12 | 0 |
| Unjustified R11 or R12 corpus diffs | 0 |
| Recovery failures | 13 |
| Verdict | FAIL |
