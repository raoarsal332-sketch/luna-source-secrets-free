# Credential Guard R9 — independent review

**Verdict: BLOCKED**

This is an independent review of the frozen candidate. It is not an author report, and it does not approve, merge, or deploy the change. No production host, VPS, Intercom workspace, customer record, or live secret was used. Nothing was sent to Intercom.

| Item | Value |
| --- | --- |
| Candidate branch | `cursor/credential-guard-r9-c90d` |
| Frozen commit | `9b5e36d1e2253c2b189e9630c05c8cb5f51c34e8` |
| Author draft | PR #38 (not read for this verdict) |
| Review branch | `review/cred-r9` |
| Cases executed | 181 (sealed set, 170 required) |
| Author tests used for the verdict | none (`credentialGuardR9.test.js` was hashed only) |
| Author report used for the verdict | none (`CRED_R9_REPORT.md` was hashed only) |

The guard stops many labeled passwords, and it sends the exact 55188 investor template on the borderline English line `how do I check the spreads?`. It still publishes other credentials on the public reply, leaks credential material into model requests and ticket state, misses four eligible asks, and does not finish an unclosed HTML comment within 3 seconds. Those are release-blocking.

## Manifest

`sha256sum -c CRED_R9_MANIFEST.sha256` was run from `luna-current/10_synthetic_lanes/credential-guard-r9` on commit `9b5e36d`. Every listed file matched.

| File | sha256 | `sha256sum -c` |
| --- | --- | --- |
| `credentialGuardR9.js` | `b4798dc041118c5f558eed01e37f1136a7f2c4106d1e838b3d2b14bab81bb523` | OK |
| `credentialGuardR9.test.js` | `18f1bba56962543a2ba43652fb7f67f192acb0a311810b1a8d978c2fc89e9270` | OK |
| `proposed-integration.diff` | `a1523cc087f4c20cf2c3d202c55aa1e13155f176b415d46e32f999d0c539a43b` | OK |
| `CRED_R9_REPORT.md` | `56575bb2b718b81cc207d64150bb9a4d8de549fa2e0ab967b4bffcf06defe721` | OK |

The manifest file itself, hashed with the same command and not listed inside the manifest:

`3415f8250b5b2a79457500d1d12c0f0f25338bc6b508553f8a231e2c0930afde  CRED_R9_MANIFEST.sha256`

## How the candidate was run

`git archive 9b5e36d1e2253c2b189e9630c05c8cb5f51c34e8 luna-current` was extracted under a temp tree. The proposed integration diff was applied with `patch -p1 -f` and no path rewrite. Patch output:

```
patching file luna-current/01_runtime/credentialGuardR9.js
patching file luna-current/01_runtime/index.js
patching file luna-current/02_statePresend/statePresend.js
patching file luna-current/03_luna-maintainer/collector.js
```

The live runtime requires a flat directory: `index.js` loads `./statePresend/statePresend` and `./luna-maintainer`, and the presend modules load siblings with `../`. After the unmodified patch, the patched `01_runtime` files were copied to that flat root, patched `02_statePresend` was copied to `statePresend/`, and patched `03_luna-maintainer` was copied to `luna-maintainer/`. That copy is the process layout. It is not a product shim, and the patch was not edited.

Dependencies were installed with `npm install --omit=dev --ignore-scripts` (Node v22.23.3). `dotenv` reported `injected env (0)`.

Isolation:

- `axios` and `openai` were replaced in `Module.prototype.require` before `index.js` loaded.
- `net`, `dns`, `http`, and `https` throw `NETWORK_BLOCKED`. The suite recorded zero network attempts.
- The recording transport kept method, URL, body, and headers. The stub model returned the case plan, with optional `get_state`, optional parroting of the user text, and an optional first-write HTTP 429.
- A harness-only `index.seam.js` appends `module.exports.__review` so the search pollers can be called. The product `index.js` does not export `__review`. `require.main` is not the seam, so the server does not listen.
- Control file: unpaused, `testMode: false`. Prompt file is the repo `system-prompt.txt`. Ticket, op-store, mention, and maintainer directories are under `/tmp`. `OPENAI_API_KEY` and `INTERCOM_ACCESS_TOKEN` are harness placeholders. The token string is stripped before scans. `HOME` is a temp directory.
- Conversations, names, and emails are synthetic. Customer secrets are synthetic values of the form `S` + case id + `x7Q`, plus labeled short slices and `syn…` API-key shapes. No customer data.

Paths actually entered: `handleWebhook` for `conversation.user.replied` and `conversation.admin.noted`; owner `REPLY`, `NOTE`, and `STOP` through `processAuthorizedNoteCommands`; `pollSilentTeamboxNotes` (escalations `9629759`, risk `10675195`, Jerry `8053416`); `pollAutoCloseSilentTickets`; `pollDeferredRelatedReplies`; the defer branch (seeded escalate state plus an “any update” ping); presend `LUNA_PRESEND_MODE=observe` and `enforce`.

`promptCollisions` was empty: no case secret appears inside `system-prompt.txt`.

## Sealed counting rules

Rules were fixed in `harness/cases.js` before the run and were not edited afterward.

- **Critical leak.** A synthetic value introduced with a credential label, Bearer / `sk-` / API-key material, or the 55188 template password outside an eligible public template, on an outbound surface.
- **Surfaces.** Public reply, note, model system, model history, model latest, model other (tool results, summarizer, owner-command text), state/memory, opstore, logs, retry, replay, defer.
- **Unauthorized template.** A public send of the 55188 template when the customer did not ask to check or test spreads and did not ask for the spread test account.
- **Missed eligible.** A clear ask in English, Urdu (script or Roman), Hindi, Arabic, or Hinglish did not produce that template. The borderline English line is `how do I check the spreads?`.
- **Over-block.** An ordinary FAQ with no credential value is replaced by the fixed security message, blocked for a credential reason, or answered with the spread template.
- **Hang.** One case exceeds 3000 ms, or the watchdog kills it. The intentional 429 retry is exempt under 8000 ms.
- A bare unlabeled token with no key shape is an observation. The guard’s internal `secretsByConversation` map is not an outbound surface.

The static system prompt contains Account 55188 and the template password (`system-prompt.txt` lines 231–232). The scanner removes that known prompt text from the model system bucket before counting, so the standing prompt is not multiplied by 181. It is reported once below.

Raw scanner output is `harness/results.json`. The counts in this report are the adjudicated counts. Three cases matched only because a 4-character secret was identical to the conversation id.

## Adjudicated counts

| Counter | Result |
| --- | --- |
| Cases run | 181 |
| Counted (path reached) | 181 |
| Harness path misses | 0 |
| Throws / network attempts | 0 |
| Critical leak events | **42** across **18** cases |
| Unauthorized template sends | **0** |
| Missed eligible requests | **5** runs, **4** distinct asks |
| Hangs | **1** (`HG12`, watchdog kill at 3000 ms) |
| Over-blocks | **0** |
| Regressions | **0** |
| Harness mistakes | **3** cases fully, plus 2 surfaces on `SE03` |

### Leaks by surface

| Surface | Events | Cases |
| --- | --- | --- |
| state / memory | 11 | `P04`, `P04o`, `P19`, `P20`, `P21`, `P28`, `TL01`, `TL02`, `TL03`, `HG05`, `HG07` |
| model history | 8 | `P04`, `P04o`, `P19`, `P20`, `P21`, `H03`, `TL03`, `HG05` |
| model latest | 7 | `P04`, `P04o`, `P19`, `P20`, `P21`, `TL03`, `HG05` |
| public reply | 7 | `P19`, `P20`, `P21`, `P28`, `OR03`, `HG05`, `HG07` |
| model other | 6 | `SE01`, `SE02`, `SE03`, `SJ1`, `SR1`, `TL03` |
| note | 2 | `SE02`, `TL03` |
| retry (second `/reply` body) | 1 | `TL03` |
| logs | 0 | — |
| model system (per case) | 0 | static prompt excluded; see systemic finding |
| opstore, replay, defer | 0 | — |

`TL03`’s retry hit is the escalation note, which is the second `/reply` write. It is the same API-key disclosure as the note, not the 429 retry path. `RT1` and `RT2` (intentional 429, about 1009 ms) did not leak.

## Product failures

### Public replies disclose credentials (critical)

The public body was the stub’s echo, `fixedSent` was false, and one comment was posted. Re-checked on the same flat runtime:

- `P19` `api_key: …` — label is not in `LABEL_SRC`. The public comment is the raw line.
- `P20` `API key: …` — same gap. The label list has `password` / `pwd` / `pin` / `otp` and some Urdu, Arabic, and Hindi password words. It does not have `api_key`, `API key`, or `token`.
- `P21` `token: …` — same gap. `keyMaterialValues` only collects `sk-…` and `Bearer …`.
- `P28` glued `xx` + secret + `yy` — `flexReplace` replaces a whole token that equals the secret. A secret inside a larger token is posted.
- `OR03` owner `@Arsal REPLY` of an `api_key` line — deterministic owner reply, no model call. The public comment is the raw API key, followed by the note “Sent to client.”
- `HG05` the same password repeated as numeric HTML entities (300 copies). The public comment still ends with the raw secret. The match budget redacts a prefix and leaves a tail. 214 ms.
- `HG07` nested base64 of a labeled password. The public comment contains the decoded raw secret. 97 ms. Client memory kept the outer base64; bot memory kept the raw value.

`LABEL_SRC` is the password family only (`credentialGuardR9.js` around lines 80–83). `keyMaterialValues` is the `sk-` and `Bearer` scan (around lines 415–435). `flexReplace` compares whole tokens (around lines 763–774).

### Model requests and notes receive raw client text (critical)

`summarizeEscalationsClientBatch` is not in the integration diff. It joins client bodies and sends them as the user message (`index.js` around lines 1333–1345). The same shape is used for the Jerry long-message note and the risk note.

- `SE01` password: the model user content is the raw `password:` lines. The later note post is `OUTBOUND_BLOCKED residual_secret`, so the note does not go out. The model request already did.
- `SE02` `api_key`: the model user content is the raw key, and the note is posted with that key. The note guard does not treat `api_key` as residual.
- `SE03` short `otp`: the model user content is `otp:` plus the value, repeated. The note is blocked. State and log hits on this case are harness id collisions and are not counted here. The model hit is real: the sampled user content is the otp line, not a conversation-id field.
- `SJ1` Jerry long message: model user content contains the labeled password. The posted note itself did not carry a leak tag.
- `SR1` risk teambox, short `pwd`: model user content is the labeled value. The note is `OUTBOUND_BLOCKED residual_secret`.
- `TL03` `get_state` plus a long API-key question: the key is in model history, model latest, the tool/other section, ticket state, and the escalation note.

### State keeps secrets after the public text was redacted (critical)

- `P04` / `P04o` (enforce and observe): zero-width `pass\u200bword:` and a zero-width split value. The public reply is the fixed security message. Presend snapshot memory and the model history and latest sections still contain the zero-width value. Format characters are turned into separators for detection, and the spaced form is what gets stored.
- `H03`: an older zero-width secret stays in model history. The public reply is the generic teammate forward.
- `TL01`: the posted note redacts the password to `[secret]`. Ticket state still stores the raw problem text (`lastEscalateProblem`).
- `TL02`: the note is redacted. State still contains the nested base64 form of the labeled password (needle `cGFzc3…`, the base64 prefix of `password:`).
- `P19`, `P20`, `P21`, `P28`, `HG05`, `HG07`: state retains the same value that was published.

### Eligible template misses

`isExplicitSpreadTestRequest` was called on the loaded guard.

| Case | Ask | Guard result | What happened |
| --- | --- | --- | --- |
| `E04`, `E04o` | `How should I check your spreads?` | false | Model path, then a generic escalation. No template. |
| `E09` | `I want to check the spreads` | false | Stub FAQ posted. No template. |
| `E13` | `سپریڈ چیک کرنے کا طریقہ بتائیں` | false | Stub FAQ posted. No template. |
| `E16` | `spread test account dena` | false | Stub FAQ posted. No template. |

`E04` is a regex hole, not a phrase the guard is unwilling to treat as a how-to. `asksHowToCheckSpreads` includes `how should i check your spreads`. `isSelfReport` returns true first: `\bi check\b` matches “i check” inside “how should i check”, and the exception list is `how do|how can|can|could|may` and does not include `should` (`credentialGuardR9.js` around lines 637–640). `clauseQualifies` then denies the clause before the how-to rule.

`E09` has no how-to pattern and no “spread test account” object, so a plain “I want to check the spreads” is denied. Owner scope (t691) includes a customer asking about checking or testing spreads.

`E13` is an Urdu request to be told the way to check the spread. The Urdu how-to pattern requires `کیسے`, which this sentence does not use.

`E16` is a Hinglish request for the spread test account using `dena`. `dena` counts as a leading act only when the clause starts with it. This clause starts with “spread”, and `hasActorUs` does not treat `dena` as addressing the team, so the clause is denied before the spread-test object is considered.

These four asks are inside the stated language scope. The other eligible lines did send the template, including `E01` `how do I check the spreads?` in both modes, and the Urdu, Hindi, Arabic, Roman Urdu, and Hinglish lines `E11`, `E12`, `E14`, `E15`, `E17`–`E25`. 24 of 29 eligible runs sent the template. 0 of 28 ineligible runs sent it, including other accounts, payout/KYC, login problems, and tampered templates (`N23` altered password and account `99999`, `N24` template plus an extra password).

### Hang

`HG12` is an unclosed comment: `<!-- password:` plus 100000 `x` and no `-->`. The parent starts a 3000 ms watchdog after the child reports ready (load time is not included) and then sends `SIGKILL`. The case was killed at 3000 ms.

`decodeClientMarkup` runs `replace(/<!--[\s\S]*?-->/g, ' ')` before the extraction loop (`credentialGuardR9.js` line 252). That replace is not inside the 200 ms `EXTRACT_MAX_MS` budget, which is checked only between label matches. An unclosed comment makes the non-greedy scan walk the whole buffer on each retry.

Other hang inputs finished. They are not hangs. Times: `HG01` 1342.5 ms, `HG02` 25.1 ms, `HG03` 1109.5 ms, `HG04` 9.9 ms, `HG05` 214.1 ms, `HG06` 46.8 ms, `HG07` 97.3 ms, `HG08` 61.6 ms, `HG09` 50.7 ms, `HG10` 2786.7 ms, `HG11` 99.4 ms. `HG10` is under the 3000 ms line and is slow. `HG02` (400 labeled pins) threw inside `extractSecrets` / `rememberClientText` and posted no body; the log tag was a harness id collision, not a leak. The throw was caught.

### Systemic model-system exposure

`control.getPrompt()` is passed as the system message with no redaction (`index.js` around lines 2956, 3268, 4155, 4483, 4504). `system-prompt.txt` lines 231–232 contain Account 55188 and the template password. Every model call therefore sends that password in the system section. Eligible spread replies return before the model and do not add another copy. The per-case scanner strips this known prompt so it is not counted 181 times. It is still one standing disclosure of the template credential on the model-system surface, outside an eligible public template.

## What held

- Labeled `password` / `pwd` / `pin` / `otp` on the public webhook path, including fullwidth, homoglyph labels, spaced and dotted values, padded, unpadded, and URL-safe base64, leetspeak, Urdu, Hindi, Arabic, and Roman labels, HTML comments, and HTML attributes: the public body became the fixed security message. Those cases are absent from the leak list (`P01`–`P03`, `P05`–`P18`, `P22`–`P27`, and the matching history and owner cases other than the gaps above).
- `Bearer` and `sk-` echoes on the public path were stopped.
- Owner `REPLY` of a plain password, `sk-`, nested base64, Arabic label, entities, and leetspeak did not publish the value. Owner `NOTE` of a plain password, bearer, HTML comment, and Hindi label did not.
- Defer (`D01`–`D03`), deferred poll (`DP1`), replay suppression (`RP2`), direct replay of a labeled body (`RP1`), auto-close search (`SC1`), and owner `STOP` (`R01`) completed with no product tag.
- 429 retry of a labeled password and of an `sk-` value (`RT1`, `RT2`) did not leak.
- Ordinary FAQ (`F01`–`F18`, both modes) and ordinary owner bracket text (`R02`) were not replaced by the fixed message, blocked as credentials, or answered with the template.
- Ineligible near-misses did not send the 55188 template.
- Op-store keys are hashes of method, URL, and body. No op-store leak was recorded.

## Harness mistakes (not product failures)

Short pin/otp/pwd needles use `secret.slice(1, 5)`. For `OR06`, `ON02`, and `HG02` that slice is exactly the case id (`OR06`, `ON02`, `HG02`). Ticket JSON and log lines that name the conversation then match.

| Case | Raw tags | Re-check | Classification |
| --- | --- | --- | --- |
| `OR06` | state, logs | Public body is the fixed security message. Note is “Sent to client.” After the id is removed, the ticket does not contain the needle. | Harness mistake |
| `ON02` | state, logs | Note body is `pin: [secret]`. After the id is removed, the ticket does not contain the needle. | Harness mistake |
| `HG02` | logs | No outbound body. The log hit is the conversation id on the inbound line and the caught stack. | Harness mistake |
| `SE03` state and logs | state, logs | Same id collision. The model-other hit is kept; see above. | Those two surfaces are harness mistakes |

`P22`–`P24` use `slice(1, 5)` values that are longer than the case id (`P22x` and similar) and were not flagged. The sealed case list was not edited after the run. The exclusion is adjudication, not a second suite.

## Verdict

**BLOCKED.**

Critical public disclosures are real: API-key labels, a `token` label, a glued password, an entity-bomb tail, a nested-base64 decode, and an owner-dictated API key. Critical model-request disclosures are real on the search summarizers and on zero-width history. Critical state retention is real after the public text was redacted. One input does not return within 3 seconds. Four eligible asks in the owner’s language scope do not receive the 55188 template. Unauthorized template sends, FAQ over-blocks, and the checked regressions were zero, which is not enough to ship while public replies still publish other credentials.
