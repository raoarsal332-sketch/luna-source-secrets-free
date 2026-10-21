# Independent review: Fixed-Message Handoff R10

**Verdict: PASS**

0 product-critical failures, 0 credential leaks, 0 regressions against the R9 behaviors this set checked. Three product defects are recorded below. They do not post the fixed handoff line without a verified assignment, and they do not leak a secret.

This review did not merge, deploy, or call Intercom. It did not read `review/*` branches, earlier review reports, or the author's test files.

## Freeze

| Item | Value |
|---|---|
| Branch | `cursor/fixed-message-handoff-r10-8ad1` |
| Commit | `c4553a93f20751b84ebdca5fb21cc7703af84a03` |
| PR under review | #59 |
| Worktree | detached checkout, not the review branch |

The commit message records report SHA-256 `a7a84a7b90ad2aeae6b8179567be42d9feebb9f4ad6fc06253b4caa8af16867a`. `sha256sum` of `luna-current/10_synthetic_lanes/fixed-message-handoff-r10/FM_R10_REPORT.md` matches that value. All 18 file hashes in that report match the frozen tree. The author's R10 test file was hashed only. It was not opened.

## How the cases ran

230 synthetic cases. Each case is a fresh process that calls the frozen `handleWebhook`. The OpenAI client is a stub. Axios uses a recording adapter: after `transformRequest`, `config.data` is the exact JSON string that would have been sent. `http.request`, `https.request`, `net.connect`, and `dns.lookup` throw `NETWORK_TRIPWIRE`. The only scripted host is `api.intercom.io`. `faq.fundedelite.com` returns an empty 403 so the local FAQ file is used. The access token is `synthetic-review-token`. Real Intercom, OpenAI, and secret environment variables are deleted before load.

`presendMega.js` requires `../repeatedClientQuestion` with no fallback, which resolves only when `statePresend` is a real directory beside `index.js`. The runner copies `02_statePresend` there. A symlink is realpath'd and breaks that require. From that layout, `targetedRegeneration.js` cannot load `../01_runtime/...`; those requires fail closed. The webhook still regenerates, because `index.js` passes its own regenerate callback into the presend gate.

## Seal

The case file was hashed and committed before the full run.

| Item | Value |
|---|---|
| Cases | 230 |
| File | `reviews/handoff-r10/sealed-cases.json` |
| SHA-256 | `4a3deb874500194d26854d5094577ab9dff076bf49ccfc12749a736a42b7405a` |
| Seal commit | `9f1171b01cc2b0ceba8e7474b4dd3bf993952e28` |

`sealed-cases.json` was not edited after that commit. `sha256sum -c reviews/handoff-r10/SEAL.sha256` was clean immediately before the run.

## Results

Runner: 225 passed, 5 failed, of 230. Raw runner buckets: product-critical 0, leaks 0, regressions 0, unnecessary-handoff 1, defects 3, over-block 1. The runner labels a failure with the case's declared class. Four of those five failures are oracle collisions, reclassified below. The raw rows remain in `results.json`.

| Group | Cases | Runner passes |
|---|---:|---:|
| Silence (human, reopen, aiOff, Fin, paused, Jerry, risk, escalations) | 65 | 65 |
| Owner authentication | 45 | 45 |
| Write-success and replay | 33 | 32 |
| Handoff and account lines | 17 | 15 |
| Unnecessary handoff | 30 | 29 |
| Team-review hedge | 11 | 11 |
| Credentials | 18 | 17 |
| R9 regression | 11 | 11 |

### Product defects

1. **Wrong assignee is stored as a confirmed write** (`c-wrong-assignee-then-retry`). A 200 whose `admin_assignee_id` is not the requested seat is `reason: 'failed'` inside `classifyAssignment`, and the fixed line is withheld. `icRequest` has already marked the op confirmed, because `isValidWriteSuccess` accepts any object with an id and `type: 'conversation'`. The retry sends the same assignment body, `shouldSkipReplay` returns the confirmed op as `{ok:true, status:200, data:null, skipped:true}`, and that null body is classified as partial. The line stays unposted (the safety property holds) and the assignment is never corrected. A definite 422 on the same shape retries and then posts the English line once (`c-422-then-retry`, two assignment posts, one fixed line).

2. **"Is news trading allowed?" is a status ping** (`e-faq-empty-is-news-trading-allowed`). `isStatusPing` matches the bare word `news`. The webhook returns the idle clarify line before the model and before the empty-FAQ fallback. There is no assignment and no fixed line, so this is not a handoff. The same customer sentence with a scripted FAQ answer (`e-faq-answer-is-news-trading-allowed`) also receives only the clarify; that case's oracle only forbade the fixed line, so the runner marked it pass. The customer does not get a FAQ answer.

3. **A challenge clarifier on a FAQ becomes the number hedge** (`g-later-please`). The draft `Please tell me which challenge you mean.` on "What is the daily loss limit?" is not posted. Two model calls run, and the public body is the approved number hedge. The word "Please" is not replaced with `[secret]`. This is the FAQ non-answer hedge, not a credential over-block. An empty model body on the same FAQ still posts the FAQ clarifier (`e-faq-empty-what-is-the-daily-loss-limit`).

### Not counted as product failures

- **Arabic account line, combining-mark order** (`d-account-ar`, `d-account-fresh-arabic`). The posted sentence is the approved Arabic account line plus the Arabic welcome. `sanitizeCredentials` applies NFKC, which swaps U+0651 (shadda) and U+064E (fatha) on `تُغيَّر`. The source constant is not NFC; the posted text is. The sentence is the same. No handoff, no assignment.
- **News FAQ runner class.** The runner called the empty-news failure an unnecessary handoff because that was the case label. The product did not hand off.

Independent counts: product-critical 0, leaks 0, regressions 0, unnecessary handoffs 0, over-blocks 0, defects 3.

## Coverage

**(a) Silence.** Human assignee, human public reply, teammate author, missing part type, ambiguous assignee, stale assignment, risk, escalations, Jerry-assigned customer threads, reopened human threads, aiOff, paused, replies disabled, and fresh Fin waits (user.created, recent Elite comment, reply younger than the Fin window) posted nothing. A live-agent ask on `user.created` is not held for Fin and does hand off.

**(b) Owner authentication.** `authenticatedOwnerCommand` requires `author.type === 'admin'`, an id in the configured set, and `part_type === 'note'`. Spoofs with type `user`, `lead`, `contact`, `bot`, or `teammate`, carrying Arsal's or Jerry's id, name, or email, posted nothing on bot-owned and human-assigned threads. A public comment is not a note. A wrong admin id, an email with no id, and a missing type posted nothing. A real Arsal or Jerry admin note without an @mention posted nothing. A dictated reply on a human-assigned thread was verbatim. A dictated reply on a bot-owned thread was posted and followed by "Sent to client." A spoofed STOP did not set aiOff.

**Jerry as an owner admin id.** This was the author's choice. `index.js` passes `ownerAdminIds: [ARSAL_ID, JERRY_ID]` into `authenticatedOwnerCommand`. `AUTHORIZED_NOTE_ADMIN_IDS` was already `[ARSAL_ID, JERRY_ID]`. The system prompt already says only Arsal and Jerry can issue note commands. Jerry is also a human assignee: a customer message on a Jerry-assigned thread stays silent (`a-jerry-assigned-live` posted nothing), which is the human-ownership rule. This review does not score that choice as a defect or as proof that it is right. The code matches the prompt and the older note-admin set, and it does not let a customer or a bot borrow Jerry's id.

**(c) Write success.** 200 with `errors`, `type: 'error.list'` with or without an id, `data: null`, an empty object, an array, HTTP 500, and a timeout do not post the fixed line. A failed note does not assign. Partial, 500, and timeout assignments are not replayed on the next turn. A 422 stays pending and the retry posts the line only after a verified assignment. Wiped parts with stored flags do not post the line when the replayed assignment names the wrong seat; a wiped conversation that is rewritten does post the line after note, assignment, then the comment. A human note with the handoff shape does not count as this bot's note. Redelivery does not post a second line. Restart after the note request is in flight does not post the line. The recording judge also fails the case if a customer comment contains a fixed line before a verified assignment (2xx, object body, not an error list, no errors, `admin_assignee_id` equal to the requested `assignee_id`). That check did not fire.

**(d) Lines.** English, Urdu, Arabic, Hindi, Roman Urdu, and Hinglish handoff asks post the approved line (Hinglish and Roman Urdu use the Urdu line). Italian posts the Italian line. French, which has no approved line, posts the English line. Account-number questions in those languages post the account sentence and do not assign. A long Urdu payout sentence and a substantive English human request are not the short welcome shortcut; the substantive English request still ends on the approved English line rather than the model draft.

**(e) Unnecessary handoff.** Plain FAQ answers and empty FAQ bodies do not assign and do not use the fixed line, except the news-trading sentence in defect 2. "any update?", "status", "checking in", "still waiting", "how long", and "following up" on a bot-owned thread with no pending case post the clarify line. Hello and an identity question do not hand off. A model ESCALATE on a plain FAQ does not post the fixed line.

**(f) Team review.** Drafts that say the team will review, on a FAQ, do not reach the customer. The public body is the number hedge. Regeneration is invoked (two model calls on the regen cases). "my payout was rejected" is not forced into that hedge. A human-owned thread does not receive the hedge.

**(g) Credentials.** Symbol and fragment secrets are not echoed in the public reply or the handoff note. A labeled passphrase and a bearer token are removed from the prompt and the reply. "password: back" and "password: cat" do not scrub a later ordinary "back" or "cat". Ordinary please, thanks, review, message, help, and team, and the words update and status inside a FAQ answer, are not turned into `[secret]`.

**(h) R9.** The locked spread reply is posted only for an eligible spread ask, checked with `isExactAllowedTemplate`. The template body is not copied into this report or into `results.json`. A spread-shaped draft on a FAQ is not posted and is not a handoff. The number hedge is terminal. Identity and personal questions do not hand off. A fresh account question is answered rather than handed off. A negated spread mention does not post the spread template. An assignment-pending recovery still answers an account question.

## Limits

The crash case's judged HTTP log is the resumed process. The in-flight note stays in the op store from the killed process. The fixed line was absent after restart. Author tests were not executed. No production host was contacted.
