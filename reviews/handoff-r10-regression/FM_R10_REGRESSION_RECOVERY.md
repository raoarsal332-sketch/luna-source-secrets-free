# Regression and recovery: Fixed-Message Handoff R10

**Verdict: NEEDS CHANGES**

This is a regression, recovery, and rollback check of the frozen candidate. It does not re-score the independent review in PR #63.

## Freeze

| Item | Value |
|---|---|
| Candidate | `cursor/fixed-message-handoff-r10-8ad1` |
| Commit | `c4553a93f20751b84ebdca5fb21cc7703af84a03` |
| PR | #59 |
| Parent / R9 freeze | `9fb86f70d37cc353183703de25e0cc69fcefbcd0` |
| Baseline | `luna-current` on `main` at `e999d3c8caf327bf9a102e5ba562d9c114a92109` |
| Report SHA-256 | `a7a84a7b90ad2aeae6b8179567be42d9feebb9f4ad6fc06253b4caa8af16867a` |

Synthetic staging only. The webhook runner uses a stub model and a recording axios adapter. `http.request`, `https.request`, `net.connect`, `dns.lookup`, and `fetch` throw `NETWORK_TRIPWIRE`. The only scripted host is `api.intercom.io`. `faq.fundedelite.com` returns an empty 403 so the local FAQ file is used. The token is `synthetic-regression-token`. No production host, VPS, live Intercom call, secret file, deploy, or merge was used.

All 452 corpus processes and all 23 recovery processes reported the tripwire armed. None recorded an unexpected host.

## File hashes

`sha256sum` of `FM_R10_REPORT.md` matches the freeze commit message. All 18 hashes in that report match the frozen tree. The seven runtime files and the R4 through R9 tests the report says are unchanged from R9 match `9fb86f70` byte for byte.

| File | Matches report |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | yes |
| `luna-current/01_runtime/index.js` | yes |
| `luna-current/01_runtime/challengeVariantGuard.js` | yes |
| `luna-current/01_runtime/softEdges.js` | yes |
| `luna-current/01_runtime/imageAskGuard.js` | yes |
| `luna-current/01_runtime/escalateRelatedOnly.js` | yes |
| `luna-current/01_runtime/teammateHandoffGates.js` | yes |
| `luna-current/02_statePresend/credentialSanitizer.js` | yes |
| `luna-current/02_statePresend/targetedRegeneration.js` | yes |
| `luna-current/02_statePresend/statePresend.js` | yes |
| `luna-current/02_statePresend/textUtils.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js` | yes |

## Existing suites

Every selftest and suite entry point on each tree was run. `01_runtime/smoke_*.js` scripts call the live model and read `/home/ubuntu/.env`. They are not suites and were not executed. The retrieval selftest needs `axios` on `NODE_PATH`; the first isolated launch failed before any assertion because that module was absent. The row below is the rerun with the synthetic dependency available. The same 1 pass and 9 failures occur on all three trees.

| Suite | Baseline | R9 | R10 | Candidate-only failure |
|---|---|---|---|---|
| `08_repair_tests/run-suite.js` | PASS, selftestFail 0 | FAIL, selftestFail 2 | FAIL, selftestFail 2 | no |
| `09_failfix_staging/selftest-bench-failfix-identity.js` | PASS, 1 pass / 0 fail | PASS, 1 pass / 0 fail | PASS, 1 pass / 0 fail | no |
| `09_failfix_staging/selftest-bench-failfix-retrieval.js` | FAIL, 1 pass / 9 fail | FAIL, 1 pass / 9 fail | FAIL, 1 pass / 9 fail | no |
| `09_failfix_staging/selftest-bench-failfix-variant.js` | PASS, 5 pass / 0 fail | PASS, 5 pass / 0 fail | PASS, 5 pass / 0 fail | no |
| `03_luna-maintainer/test/run-tests.js` | FAIL, 18 pass / 9 fail | FAIL, 18 pass / 9 fail | FAIL, 18 pass / 9 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js` | absent | PASS, 16 pass / 0 fail | PASS, 16 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | absent | PASS, 33 pass / 0 fail | PASS, 33 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | absent | PASS, 10 pass / 0 fail | PASS, 10 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | absent | PASS, 8 pass / 0 fail | PASS, 8 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | absent | PASS, 9 pass / 0 fail | PASS, 9 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | absent | PASS, 9 pass / 0 fail | PASS, 9 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` | absent | PASS, 7 pass / 0 fail | PASS, 7 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js` | absent | PASS, 5 pass / 0 fail | PASS, 5 pass / 0 fail | no |
| `10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js` | absent | absent | PASS, 7 pass / 0 fail | no |

No candidate-only suite failure. The repair suite passes on the baseline and fails the same two source-shape selftests on R9 and R10: `selftest-identity-before-escalate.js` (the old identity-escalate string is no longer before the forwarded sentence) and `selftest-lock-harden.js` (it still looks for `postProcessModelReply(lockedFinHandoffWelcome)`). Those two failures are inherited from the R9 freeze. The adversarial checks inside the repair suite passed on all three trees (`adversarialFail 0`). The maintainer suite's 9 failures are the same tests on every tree; the only text difference is the absolute path in one `ENOENT`. The retrieval failures are the same nine FAQ-boost assertions on every tree.

Lane counts on the R10 tree match the freeze report: R10 7, R9 5, R8 7, R7 9, R6 9, R5 8, R4 10, R3 33, R2 16. All passed.

## Corpus

113 cases: 42 FAQ, 21 payout, 15 MT5 spread-test, 15 partnership, 20 human-owned silence. Each case is a fresh process. The public output is the SHA-256 of the raw customer-comment bodies, in order. Spread-template bodies are not copied into this report; a body that contains the locked marker is shown as `[redacted-template-or-credential-body]`.

| Result | Cases |
|---|---:|
| Byte-identical to the baseline | 70 |
| Different from the baseline, byte-identical to R9 | 37 |
| Different from both, documented R10 class | 5 |
| Different from both, not a documented R10 class | 1 |
| Rollback restored the R9 output | 113 / 113 |

### Unjustified diff

`faq-6`, customer text "Is news trading allowed?". Baseline and R9 both post the stub FAQ answer. R10 posts the idle clarify line, with a greeting. `isStatusPing` treats the bare word `news` as a status ping, and `isClearKbFaqAsk` also classifies this sentence as a KB FAQ. The freeze's class 3 example is an idle ping such as "any update?" on a bot-owned thread with no pending case. This sentence is an ordinary news-trading FAQ. The diff is not byte-identical ordinary FAQ behavior.

### Documented R10-only diffs

| Case | Customer text | What R10 posts | Class |
|---|---|---|---|
| `payout-3` | /H/o/w/ /l/o/n/g/ /d/o/ /p/a/y/o/u/t/s/ /t/a/k/e/?/ | /H/e/l/l/o/ /C/a/s/e/y/,/ /I/ /d/o/n/'/t/ /h/a/v/e/ /a/n/ /o/p/e/n/ /u/p/d/a/t/e/ /o/n/ /t/h/i/s/ /c/o/n/v/e/r/s/a/t/i/o/n/./ /W/h/a/t/ /w/o/u/l/d/ /y/o/u/ /l/i/k/e/ /m/e/ /t/o/ /c/h/e/c/k/?/ | R10 class 3 idle status ping. The customer text matches isStatusPing and is not a clear KB FAQ. |
| `payout-20` | /I/ /a/m/ /s/t/i/l/l/ /w/a/i/t/i/n/g/ /o/n/ /m/y/ /p/a/y/o/u/t/ | /H/e/l/l/o/ /C/a/s/e/y/,/ /I/ /d/o/n/'/t/ /h/a/v/e/ /a/n/ /o/p/e/n/ /u/p/d/a/t/e/ /o/n/ /t/h/i/s/ /c/o/n/v/e/r/s/a/t/i/o/n/./ /W/h/a/t/ /w/o/u/l/d/ /y/o/u/ /l/i/k/e/ /m/e/ /t/o/ /c/h/e/c/k/?/ | R10 class 3 idle status ping. The customer text matches isStatusPing and is not a clear KB FAQ. |
| `faq-empty-model` | /W/h/a/t/ /i/s/ /t/h/e/ /d/a/i/l/y/ /l/o/s/s/ /l/i/m/i/t/?/ | /H/e/l/l/o/ /C/a/s/e/y/,/ /T/h/e/ /F/A/Q/ /a/r/t/i/c/l/e/ /"/2/-/S/t/e/p/ /C/h/a/l/l/e/n/g/e/ /+/ /F/R/E/E/ /R/E/T/R/Y/"/ /c/o/v/e/r/s/ /t/h/i/s/./ /W/h/i/c/h/ /c/h/a/l/l/e/n/g/e/ /i/s/ /t/h/e/ /q/u/e/s/t/i/o/n/ /a/b/o/u/t/?/ | R10 class 3 empty model body on a plain KB FAQ posts the FAQ clarifier instead of the presend handoff. |
| `faq-team-review` | /W/h/a/t/ /i/s/ /t/h/e/ /d/a/i/l/y/ /l/o/s/s/ /l/i/m/i/t/?/ | /I/ /c/a/n/'/t/ /c/o/n/f/i/r/m/ /t/h/a/t/ /f/i/g/u/r/e/ /f/r/o/m/ /t/h/e/ /a/p/p/r/o/v/e/d/ /d/e/t/a/i/l/s/,/ /s/o/ /I/ /w/o/n/'/t/ /g/u/e/s/s/ /a/ /n/u/m/b/e/r/./ | R10 class 4. A FAQ draft that says the team will review is replaced by the approved number hedge. |
| `faq-status-ping` | /a/n/y/ /u/p/d/a/t/e/?/ | /H/e/l/l/o/ /C/a/s/e/y/,/ /I/ /d/o/n/'/t/ /h/a/v/e/ /a/n/ /o/p/e/n/ /u/p/d/a/t/e/ /o/n/ /t/h/i/s/ /c/o/n/v/e/r/s/a/t/i/o/n/./ /W/h/a/t/ /w/o/u/l/d/ /y/o/u/ /l/i/k/e/ /m/e/ /t/o/ /c/h/e/c/k/?/ | R10 class 3 idle status ping. The customer text matches isStatusPing and is not a clear KB FAQ. |

`faq-empty-model` names the article "2-Step Challenge + FREE RETRY" for a daily-loss question. That is the class 3 clarifier choosing an article by token overlap. It is not the fixed handoff line, and it does not assign.

### Diffs that match the R9 freeze

These 37 outputs differ from the baseline and match R9 byte for byte. R10 did not introduce them. Restoring the four R9 files puts them back.

| Case | Group | Why the baseline differs |
|---|---|---|
| `faq-4` | faq | R9 and R10 post the approved number hedge. Baseline posts the older forwarded-to-teammate sentence. |
| `faq-21` | faq | R9 and R10 post the fixed handoff line. Baseline posts the older forwarded-to-teammate sentence. |
| `faq-38` | faq | R9 and R10 redact the words after the label "pass" in "pass the challenge". Baseline posts the stub answer without that redaction. R10 did not introduce it. |
| `payout-2` | payout | R9 and R10 post the approved number hedge. Baseline posts the older forwarded-to-teammate sentence. |
| `spread-1` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-2` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-3` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-5` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-6` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-7` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-8` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-9` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-10` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-11` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-12` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `spread-13` | spread | R9 and R10 post the approved number hedge. Baseline posts the older forwarded-to-teammate sentence. |
| `spread-14` | spread | R9 and R10 post the approved number hedge. Baseline posts the older forwarded-to-teammate sentence. |
| `spread-15` | spread | Both R9 and R10 send a body that contains the locked spread-test marker. The bytes match each other and differ from the baseline. The exact-template greeting exemption is the R9 behavior R10 kept. The template is not copied here. |
| `silence-1` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-2` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-3` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-4` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-5` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-6` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-8` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-9` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-10` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-11` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-12` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-13` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-14` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-15` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-16` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-18` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-19` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `silence-20` | silence | Human-assigned thread. R9 and R10 post nothing. Baseline still posts a reply. Ownership silence is unchanged from R9. |
| `faq-password-back` | faq | R9 and R10 leave the later ordinary "back" in place and redact "leverage". Baseline posts the older forwarded sentence. The R10 taint change does not move this output off the R9 bytes. |

### Per-case results

| Case | Group | vs baseline | vs R9 | Rollback | Verdict |
|---|---|---|---|---|---|
| `faq-1` | faq | identical | identical | restored | pass |
| `faq-2` | faq | identical | identical | restored | pass |
| `faq-3` | faq | identical | identical | restored | pass |
| `faq-4` | faq | differs | identical | restored | pass |
| `faq-5` | faq | identical | identical | restored | pass |
| `faq-6` | faq | differs | differs | restored | fail |
| `faq-7` | faq | identical | identical | restored | pass |
| `faq-8` | faq | identical | identical | restored | pass |
| `faq-9` | faq | identical | identical | restored | pass |
| `faq-10` | faq | identical | identical | restored | pass |
| `faq-11` | faq | identical | identical | restored | pass |
| `faq-12` | faq | identical | identical | restored | pass |
| `faq-13` | faq | identical | identical | restored | pass |
| `faq-14` | faq | identical | identical | restored | pass |
| `faq-15` | faq | identical | identical | restored | pass |
| `faq-16` | faq | identical | identical | restored | pass |
| `faq-17` | faq | identical | identical | restored | pass |
| `faq-18` | faq | identical | identical | restored | pass |
| `faq-19` | faq | identical | identical | restored | pass |
| `faq-20` | faq | identical | identical | restored | pass |
| `faq-21` | faq | differs | identical | restored | pass |
| `faq-22` | faq | identical | identical | restored | pass |
| `faq-23` | faq | identical | identical | restored | pass |
| `faq-24` | faq | identical | identical | restored | pass |
| `faq-25` | faq | identical | identical | restored | pass |
| `faq-26` | faq | identical | identical | restored | pass |
| `faq-27` | faq | identical | identical | restored | pass |
| `faq-28` | faq | identical | identical | restored | pass |
| `faq-29` | faq | identical | identical | restored | pass |
| `faq-30` | faq | identical | identical | restored | pass |
| `faq-31` | faq | identical | identical | restored | pass |
| `faq-32` | faq | identical | identical | restored | pass |
| `faq-33` | faq | identical | identical | restored | pass |
| `faq-34` | faq | identical | identical | restored | pass |
| `faq-35` | faq | identical | identical | restored | pass |
| `faq-36` | faq | identical | identical | restored | pass |
| `faq-37` | faq | identical | identical | restored | pass |
| `faq-38` | faq | differs | identical | restored | pass |
| `payout-1` | payout | identical | identical | restored | pass |
| `payout-2` | payout | differs | identical | restored | pass |
| `payout-3` | payout | differs | differs | restored | pass |
| `payout-4` | payout | identical | identical | restored | pass |
| `payout-5` | payout | identical | identical | restored | pass |
| `payout-6` | payout | identical | identical | restored | pass |
| `payout-7` | payout | identical | identical | restored | pass |
| `payout-8` | payout | identical | identical | restored | pass |
| `payout-9` | payout | identical | identical | restored | pass |
| `payout-10` | payout | identical | identical | restored | pass |
| `payout-11` | payout | identical | identical | restored | pass |
| `payout-12` | payout | identical | identical | restored | pass |
| `payout-13` | payout | identical | identical | restored | pass |
| `payout-14` | payout | identical | identical | restored | pass |
| `payout-15` | payout | identical | identical | restored | pass |
| `payout-16` | payout | identical | identical | restored | pass |
| `payout-17` | payout | identical | identical | restored | pass |
| `payout-18` | payout | identical | identical | restored | pass |
| `payout-19` | payout | identical | identical | restored | pass |
| `payout-20` | payout | differs | differs | restored | pass |
| `spread-1` | spread | differs | identical | restored | pass |
| `spread-2` | spread | differs | identical | restored | pass |
| `spread-3` | spread | differs | identical | restored | pass |
| `spread-4` | spread | identical | identical | restored | pass |
| `spread-5` | spread | differs | identical | restored | pass |
| `spread-6` | spread | differs | identical | restored | pass |
| `spread-7` | spread | differs | identical | restored | pass |
| `spread-8` | spread | differs | identical | restored | pass |
| `spread-9` | spread | differs | identical | restored | pass |
| `spread-10` | spread | differs | identical | restored | pass |
| `spread-11` | spread | differs | identical | restored | pass |
| `spread-12` | spread | differs | identical | restored | pass |
| `spread-13` | spread | differs | identical | restored | pass |
| `spread-14` | spread | differs | identical | restored | pass |
| `spread-15` | spread | differs | identical | restored | pass |
| `partnership-1` | partnership | identical | identical | restored | pass |
| `partnership-2` | partnership | identical | identical | restored | pass |
| `partnership-3` | partnership | identical | identical | restored | pass |
| `partnership-4` | partnership | identical | identical | restored | pass |
| `partnership-5` | partnership | identical | identical | restored | pass |
| `partnership-6` | partnership | identical | identical | restored | pass |
| `partnership-7` | partnership | identical | identical | restored | pass |
| `partnership-8` | partnership | identical | identical | restored | pass |
| `partnership-9` | partnership | identical | identical | restored | pass |
| `partnership-10` | partnership | identical | identical | restored | pass |
| `partnership-11` | partnership | identical | identical | restored | pass |
| `partnership-12` | partnership | identical | identical | restored | pass |
| `partnership-13` | partnership | identical | identical | restored | pass |
| `partnership-14` | partnership | identical | identical | restored | pass |
| `partnership-15` | partnership | identical | identical | restored | pass |
| `silence-1` | silence | differs | identical | restored | pass |
| `silence-2` | silence | differs | identical | restored | pass |
| `silence-3` | silence | differs | identical | restored | pass |
| `silence-4` | silence | differs | identical | restored | pass |
| `silence-5` | silence | differs | identical | restored | pass |
| `silence-6` | silence | differs | identical | restored | pass |
| `silence-7` | silence | identical | identical | restored | pass |
| `silence-8` | silence | differs | identical | restored | pass |
| `silence-9` | silence | differs | identical | restored | pass |
| `silence-10` | silence | differs | identical | restored | pass |
| `silence-11` | silence | differs | identical | restored | pass |
| `silence-12` | silence | differs | identical | restored | pass |
| `silence-13` | silence | differs | identical | restored | pass |
| `silence-14` | silence | differs | identical | restored | pass |
| `silence-15` | silence | differs | identical | restored | pass |
| `silence-16` | silence | differs | identical | restored | pass |
| `silence-17` | silence | identical | identical | restored | pass |
| `silence-18` | silence | differs | identical | restored | pass |
| `silence-19` | silence | differs | identical | restored | pass |
| `silence-20` | silence | differs | identical | restored | pass |
| `faq-empty-model` | faq | differs | differs | restored | pass |
| `faq-team-review` | faq | differs | differs | restored | pass |
| `payout-team-review-personal` | payout | identical | identical | restored | pass |
| `faq-status-ping` | faq | differs | differs | restored | pass |
| `faq-password-back` | faq | differs | identical | restored | pass |

## Recovery

Recording transport, stub model, fresh process per phase. A crash is `process.exit(70)` after the earlier write has been mirrored into the conversation and confirmed in the op store, and before the next write is sent. The pending op key for the killed write is removed so the restart is not blocked by a ghost pending op. The forward write order on a live-agent handoff is note, then assignment, then the fixed line. A crash after the assignment and before the note does not occur on that path: `rec-assign-before-note` completed in one process with that order and one fixed line.

The forced state in `rec-drop-note-keep-assignment` deletes the note part and the note op after the assignment has succeeded, then restarts. That is the requested "assignment without a note" state.

| Case | Fixed public lines | Hold visible | Verified assignment before any fixed line | Result |
|---|---:|---|---|---|
| `rec-crash-after-note` | 1 | yes | yes | pass |
| `rec-crash-after-assign` | 1 | yes | yes | pass |
| `rec-crash-after-line` | 1 | yes | yes | pass |
| `rec-assign-before-note` | 1 | yes | yes | pass |
| `rec-drop-note-keep-assignment` | 0 | no | yes | FAIL: lost-handoff |
| `rec-wipe-op-after-assign` | 1 | yes | yes | pass |
| `rec-corrupt-op-after-assign` | 1 | yes | yes | pass |
| `rec-wipe-parts-and-op` | 1 | yes | yes | pass |
| `rec-duplicate-delivery` | 1 | yes | yes | pass |
| `rec-replay-after-line` | 1 | yes | yes | pass |
| `rec-429-note` | 1 | yes | yes | pass |
| `rec-429-assign` | 1 | yes | yes | pass |
| `rec-429-comment` | 1 | yes | yes | pass |
| `rec-429-all` | 1 | yes | yes | pass |
| `rec-429-exhausted-note` | 0 | yes | yes | pass |
| `rec-500-note` | 0 | yes | yes | pass |
| `rec-500-assign` | 0 | yes | yes | pass |
| `rec-500-comment` | 0 | yes | yes | pass |
| `rec-timeout-note` | 0 | yes | yes | pass |
| `rec-timeout-assign` | 0 | yes | yes | pass |
| `rec-timeout-comment` | 0 | yes | yes | pass |
| `rec-human-silence-restart` | 0 | no | yes | pass |
| `rec-human-silence-live-agent` | 0 | no | yes | pass |

Passing recovery checks:

- Kill after the note and before the assignment, then restart: one fixed line, after a verified assignment.
- Kill after the assignment and before the fixed line, then restart: one fixed line.
- Kill after the fixed line, then replay: no second public line.
- Same-process duplicate delivery: one public line.
- Wipe the op store, or replace it with invalid JSON, after the assignment: the line is posted once on replay.
- Wipe the parts and the op store: the handoff runs once.
- 429 then 200 on the note, the assignment, the comment, and all three: one line.
- 429 until retries are exhausted, HTTP 500, and timeout, each on the note, the assignment, and the comment: no fixed line, and `fixedHandoff` records an ambiguous or pending hold.
- Human-assigned FAQ, payout, and live-agent turns stay silent across a restart. A second customer message after restart is still silent.

`rec-drop-note-keep-assignment` fails. After the note is removed and the seat assignment remains, the restarted webhook treats the seat as a human owner and returns without a public comment. `fixedHandoff` is absent, so the hold is not visible in ticket state, and the fixed line is never posted. The handoff is lost. No duplicate line was posted, and no fixed line was posted without a verified assignment.

## Rollback

A copy of the R10 tree had these four files replaced with the blobs from `9fb86f70`:

- `luna-current/01_runtime/fixedMessageHandoff.js`
- `luna-current/01_runtime/index.js`
- `luna-current/02_statePresend/credentialSanitizer.js`
- `luna-current/02_statePresend/targetedRegeneration.js`

Each restored file matched the R9 worktree byte for byte (`sha256`). The state-presend directory beside `index.js` was recopied from the restored sources. All 113 corpus outputs then matched the R9 freeze. Rollback of the R10 behavior change works.

## Verdict

**NEEDS CHANGES.** Two checks fail:

1. Ordinary FAQ `faq-6` ("Is news trading allowed?") is not byte-identical to the baseline or to R9. The status-ping early return consumes a KB FAQ because the pattern treats `news` as a status word.
2. Recovery state "assignment kept, note removed" does not complete and does not leave a visible `fixedHandoff` hold. The next turn is silent because the assigned seat is treated as a human owner.

Hashes match. No candidate-only suite failure. The other 112 corpus cases are either byte-identical to the baseline, byte-identical to R9, or a documented R10 class. Reachable crash points, op-store wipe and corruption, duplicate delivery, 429, 500, timeout, and human-owned silence after restart pass. Restoring the four R9 files restores R9 corpus behavior.

Not approved. No merge, deploy, or Intercom action.
