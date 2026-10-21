# Credential guard R8 — frozen staging candidate

Status: **frozen candidate, not approved**. This follows the written R7 review summary (NEEDS CHANGES, 135 cases, 9 public leaks, 8 unauthorized 55188 sends, 2 missed directs, 2 over-blocks). Logs, opstore, and notes stayed clean in that review. The branch `review/cred-r7` and its case file were not read. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Nothing here is wired into `index.js`, `statePresend.js`, or `collector.js`. `proposed-integration.diff` is unapplied. `STATUS.approved` is false.

## What changed

1. **Eligibility.** `isExplicitSpreadTestRequest` is a clause parse, not a `send` / `can you` / `would you` regex. A clause qualifies only when the actor is us, the act is a request (`send`, `give`, `share`, `provide`, `show`, `bhejo`, `bhej`, `dena`, `भेजो`, `دیں`, `أرسل`, and the same set in the other listed forms), and the object is the spread-test or demo account, its login, or how to check spreads on the test account. Negation anywhere in that clause denies it (`never`, `no`, `not`, `nahi`, `لا`, `نہیں`, `नहीं`, and the other listed forms). Definitions, self-reports, own-account asks, and third-party asks deny. Payout text and non-trading senses still deny the whole message. Default is deny. `please mujhe spread test account bhejo` and `أرسل لي حساب اختبار السبريد` qualify. Bare `how do I check the spreads?`, `would you`, and `can you help with spreads` do not.
2. **Value extraction.** Tokens keep `$` and the other listed symbols. A run of 1- or 2-character tokens after a label is joined when the result is at least 4 characters and is not on the stoplist. HTML comments and `password` / `pin` / `token` attributes are harvested before tags are stripped. `sk-` is case-insensitive. `Bearer` stores and redacts the token only. U+200B and the other zero-width characters are separators, so `password\u200Bis Hunt9` still captures `Hunt9`.
3. **Final byte boundary.** In the diff, `postReply` runs `toHtml` first (notes stay raw), then `guardSend`. Callers still run `postProcessModelReply` before `postReply`. The spread-test site passes the canonical template, not a pre-rewritten copy, and does not pass an `explicitSpreadTest` flag.
4. **One decision.** `guardSend` binds a sha256 of the final bytes and of the canonical (tags and entities decoded) form, scoped to the conversation id. `guardOutboundWrite` uses that record and does not re-scan. A redacted note and the fixed client message are sent. A body that still cannot be cleaned is blocked. One conversation's template allow does not authorize another conversation.
5. **Stoplist.** Values shorter than 4 characters are ignored. `pin: 5`, `password: reset`, `pwd: ab`, and `mera password hai X` do not become secrets. The placeholder `[secret]` is not a secret. The six over-block controls stay allowed, including the password-reset FAQ line.
6. **Memory.** The diff redacts with `redactForConversation` in `noteInbound`, `noteHuman`, `noteOutbound`, `messagesFor` (now exported), and `buildHistory`, before either model request that reads history. `SKIP model` and `OWNER_CMD_LLM_RAW` use the same helper. `rememberClientText` runs on the inbound text before those logs.
7. **Require layout.** `index.js` requires `./credentialGuardR8`. The diff adds that module as a new file at `luna-current/01_runtime/credentialGuardR8.js`, byte-for-byte the lane module. `statePresend.js` and `collector.js` try `../credentialGuardR8` (flat repair mirror) and `../01_runtime/credentialGuardR8` (repo tree). There is no `10_synthetic_lanes` require and no shim file.

The fixed client message is unchanged: `Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.`

## Tests

`node luna-current/10_synthetic_lanes/credential-guard-r8/credentialGuardR8.test.js`

38 passed, 0 failed. `node --check` passed on the module and the test. `patch --dry-run -p1 --forward --batch --silent` exits 0 and does not modify the runtime files. The new-file hunk rebuilds to the lane module bytes.

The suite locks the previous eligibility negatives plus the loose how-to and third-party lines, all rejected, and the 6 over-block controls, all allowed. An isolated recording transport receives the FAQ line and the greeted template exactly. That is the local regression set. It is not a replay of the unseen 135-case file.

## File hashes

`CRED_R8_MANIFEST.sha256` lists these files and this report. The manifest's own digest is not stored inside itself.

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/credential-guard-r8/credentialGuardR8.js` | `f53ab7da7d11f22200206b122b480163594daab55f4718a88d5e25ab4546097e` |
| `luna-current/10_synthetic_lanes/credential-guard-r8/credentialGuardR8.test.js` | `a22f74d750306e6e3b141fd38f2cee6e95be93ce441ee594695ee416bf3d37ea` |
| `luna-current/10_synthetic_lanes/credential-guard-r8/proposed-integration.diff` | `0395b3e3eb05b4ddd65b9a840a61eaa47e7bfd25f294e378ada7cdbc25a1b0d3` |

Protected files were not edited. `system-prompt.txt` is `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`. `fundedelite-faqs.md` is `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- The choke, the opstore guard, the history redaction, and the new runtime module are a proposed diff, not a live wire-up.
- The 135-case file was not replayed, so this does not claim the 9 leaks, 8 unauthorized sends, 2 missed directs, or 2 over-blocks are closed.
- No live webhook or customer conversation was used.
