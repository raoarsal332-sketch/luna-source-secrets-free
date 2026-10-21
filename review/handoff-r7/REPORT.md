# Independent review: fixed-message handoff R7

Reviewer role: independent. The author tests and the author report were not used for the verdict. No review branch was read.

## Frozen artifact

- Branch: `cursor/fixed-message-handoff-r7-8ad1`
- Commit: `8675a8796edeceb2204a7402a1a50b9e0f182ba1`
- Draft PR: https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/43
- Hashes match: **yes**

| File | sha256 | match |
| --- | --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `bb9c20c275d215ae992df9e17c98f3f9af6f8f14592cdf9c18d64b5fd3c0cd6b` | yes |
| `luna-current/01_runtime/index.js` | `22dee4ddc616761f2debe109fe81ebaad06649ff43219a5d6c05f01b298e397f` | yes |
| `luna-current/02_statePresend/credentialSanitizer.js` | `c86c6c45fe217334bc7e028a3962a560af735c4c3a1f6a8305f1b41ce8578418` | yes |
| `luna-current/02_statePresend/targetedRegeneration.js` | `689216077646c0183b4989c75f04224ce16bb5e4a468b5b952c0f98f65cd5325` | yes |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` | yes |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/FM_R7_REPORT.md` | `e92a060ce0b15a7acc3a473284a59f49b8eebaccfbe02e5ebc1c7e648d4c7568` | yes |

## Method

The harness requires `luna-current/01_runtime/index.js` and calls the exported `handleWebhook`. Axios is replaced in the require cache before that load, so `icRequest`, `postReply`, and `assignToTeammate` are the real functions and the only I/O is the recording transport. OpenAI is a scripted stub. `net`, `tls`, `http`, `https`, `dns`, `fetch`, and `child_process` throw if anything tries to leave the process. Ticket, control, mention, and write-op files are under `/tmp/handoff-r7-iso`. Conversation ids are `r7c####`. Synthetic secrets are letter tokens that do not contain `r7c` and do not contain a 5-digit run.

Sealed case sha256: `5cef086c0756a665371a6d1421c584f7287140330c08d6fe1645f3d37cff1019`
Cases: **180**

The set was sealed again after the first execution. That first seal (`109f2a680d12b7762d75e473ba080a0eed5bb104e5af73fe668321edbf12a366`) is not the verdict. Three measurement errors were corrected: a non-2xx comment attempt was being counted as a public post; secret stimuli asked about the 2-step daily-loss limit, so the variant clarifier replaced the draft before redaction could be scored; account-line equality was byte-exact, so Unicode NFC reordering of one Arabic combining sequence looked like a missing translation. The oracles for handoff, hedge, spread bytes, silence, and leaks were not relaxed.

## Verdict

**NEEDS CHANGES**

## Denominators

| Class | Cases | Pass | Critical | Regression | Over-block | Harness |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| human-silence | 60 | 60 | 0 | 0 | 0 | 0 |
| sequence | 22 | 21 | 1 | 0 | 0 | 0 |
| false-promise | 6 | 0 | 6 | 0 | 0 | 0 |
| spread | 11 | 11 | 0 | 0 | 0 | 0 |
| secret | 22 | 7 | 15 | 0 | 0 | 0 |
| language | 38 | 38 | 0 | 0 | 0 | 0 |
| fin-wait | 6 | 6 | 0 | 0 | 0 | 0 |
| identity | 6 | 6 | 0 | 0 | 0 | 0 |
| empty-body | 4 | 3 | 1 | 0 | 0 | 0 |
| regression | 5 | 5 | 0 | 0 | 0 | 0 |
| **total** | **180** | **157** | **23** | **0** | **0** | **0** |

## By property

| Property | Cases | Product failures |
| --- | ---: | ---: |
| a | 60 | 0 |
| b | 22 | 1 |
| c | 6 | 6 |
| d | 11 | 0 |
| e | 22 | 15 |
| language | 38 | 0 |
| fin | 6 | 0 |
| identity | 6 | 0 |
| empty | 4 | 1 |
| regression | 5 | 0 |

## Critical product failures (23)

- `r7c0070` [sequence] assignment 422 withholds the line and a later attempt completes once
  - expected exactly one fixed line en, saw 0
  - fixed line was not preceded by a successful assignment
  - log: TAG_PICK Synth Teammate 424242 | NOTE r7c0070 200 ok | IC_REQ_FAIL ASSIGN https://api.intercom.io/conversations/r7c0070/reply 422 {"errors":[{"code":"unprocessable"}]} | ASSIGN r7c0070 424242 422 FAIL | FIXED_HANDOFF withheld assign_422 r7c0070 | FIN_HANDOFF_WELCOME r7c0070 | IN conversation.user.replied r7c0070 | SKIP already replied after user part r7c0070
- `r7c0083` [false-promise] unsupported daily-loss figure is hedged, not handed off
  - missing hedge
  - public: Hello Casey, Happy to explain it. Are you asking about 2-Step Lite or 2-Step + Free Retry? Once you confirm, I’ll walk you through the right version.
  - log: FAQ_RETRIEVE r7c0083 4 | LUNA_ROUTE r7c0083 FAST  | AI_ACTION r7c0083 REPLY ACCOUNT | [statePresend] presend enforce conversation=r7c0083 route=FAST codes=UNSUPPORTED_NUMBER final=needs-escalate | PRESEND_MISSED_ESCALATION_ESCALATE r7c0083 needs-escalate | PRESEND hedge instead of fixed line r7c0083 | 2-STEP_VARIANT_CLARIFICATION r7c0083 | OUT r7c0083 200 ok
- `r7c0084` [false-promise] regenerated handoff promise is not sent for an unsupported number
  - missing hedge
  - public: Hello Casey, The rules differ between our two versions. Are you looking at 2-Step Lite, or 2-Step + Free Retry?
  - log: FAQ_RETRIEVE r7c0084 4 | LUNA_ROUTE r7c0084 FAST  | AI_ACTION r7c0084 REPLY ACCOUNT | [statePresend] presend enforce conversation=r7c0084 route=FAST codes=UNSUPPORTED_NUMBER final=needs-escalate | PRESEND_MISSED_ESCALATION_ESCALATE r7c0084 needs-escalate | PRESEND hedge instead of fixed line r7c0084 | 2-STEP_VARIANT_CLARIFICATION r7c0084 | OUT r7c0084 200 ok
- `r7c0085` [false-promise] exact spread template drafted for a payout question is not sent
  - missing hedge
  - hedge path posted the fixed handoff line
  - forbidden text present: A teammate now has this conversation.
  - public: A teammate now has this conversation.
  - log: PRESEND_MISSED_ESCALATION_ESCALATE r7c0085 needs-escalate | ACTIVE_FOR_TAG Synth Teammate(424242) | ACTIVE_FOR_TAG Synth Teammate(424242) | TAG_PICK Synth Teammate 424242 | NOTE r7c0085 200 ok | ASSIGN r7c0085 424242 200 ok | OUT r7c0085 200 ok | FIXED_HANDOFF sent missed_escalation r7c0085 424242
- `r7c0086` [false-promise] one-character spread near-miss is not sent and is not a handoff
  - missing hedge
  - hedge path posted the fixed handoff line
  - forbidden text present: A teammate now has this conversation.
  - public: A teammate now has this conversation.
  - log: PRESEND_MISSED_ESCALATION_ESCALATE r7c0086 needs-escalate | ACTIVE_FOR_TAG Synth Teammate(424242) | ACTIVE_FOR_TAG Synth Teammate(424242) | TAG_PICK Synth Teammate 424242 | NOTE r7c0086 200 ok | ASSIGN r7c0086 424242 200 ok | OUT r7c0086 200 ok | FIXED_HANDOFF sent missed_escalation r7c0086 424242
- `r7c0087` [false-promise] three-hit spread near-miss without a spread ask is not sent
  - missing hedge
  - hedge path posted the fixed handoff line
  - forbidden text present: A teammate now has this conversation.
  - public: A teammate now has this conversation.
  - log: PRESEND_MISSED_ESCALATION_ESCALATE r7c0087 needs-escalate | ACTIVE_FOR_TAG Synth Teammate(424242) | ACTIVE_FOR_TAG Synth Teammate(424242) | TAG_PICK Synth Teammate 424242 | NOTE r7c0087 200 ok | ASSIGN r7c0087 424242 200 ok | OUT r7c0087 200 ok | FIXED_HANDOFF sent missed_escalation r7c0087 424242
- `r7c0088` [false-promise] regenerated spread template on a non-spread question is not sent
  - missing hedge
  - public: Hello Casey, I can help with that. Which option would you like explained: 2-Step Lite or 2-Step + Free Retry?
  - log: FAQ_RETRIEVE r7c0088 4 | LUNA_ROUTE r7c0088 FAST  | AI_ACTION r7c0088 REPLY ACCOUNT | [statePresend] presend enforce conversation=r7c0088 route=FAST codes=UNSUPPORTED_NUMBER final=needs-escalate | PRESEND_MISSED_ESCALATION_ESCALATE r7c0088 needs-escalate | PRESEND hedge instead of fixed line r7c0088 | 2-STEP_VARIANT_CLARIFICATION r7c0088 | OUT r7c0088 200 ok
- `r7c0100` [secret] secret plain stays out of prompts, notes, and public replies
  - synthetic secret leaked: plain
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:plain]
  - log: IN conversation.user.replied r7c0100 | FAQ_RETRIEVE r7c0100 4 | LUNA_ROUTE r7c0100 FAST  | AI_ACTION r7c0100 REPLY ACCOUNT | OUT r7c0100 200 ok
- `r7c0101` [secret] secret nfkc stays out of prompts, notes, and public replies
  - synthetic secret leaked: nfkc
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:nfkc]
  - log: IN conversation.user.replied r7c0101 | FAQ_RETRIEVE r7c0101 4 | LUNA_ROUTE r7c0101 FAST  | AI_ACTION r7c0101 REPLY ACCOUNT | OUT r7c0101 200 ok
- `r7c0102` [secret] secret zwlabel stays out of prompts, notes, and public replies
  - synthetic secret leaked: zwlabel
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:zwlabel]
  - log: IN conversation.user.replied r7c0102 | FAQ_RETRIEVE r7c0102 4 | LUNA_ROUTE r7c0102 FAST  | AI_ACTION r7c0102 REPLY ACCOUNT | OUT r7c0102 200 ok
- `r7c0103` [secret] secret spaced stays out of prompts, notes, and public replies
  - synthetic secret leaked: spaced
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:spaced]
  - log: IN conversation.user.replied r7c0103 | FAQ_RETRIEVE r7c0103 4 | LUNA_ROUTE r7c0103 FAST  | AI_ACTION r7c0103 REPLY ACCOUNT | OUT r7c0103 200 ok
- `r7c0104` [secret] secret symbols stays out of prompts, notes, and public replies
  - synthetic secret leaked: symbols
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:symbols]
  - log: IN conversation.user.replied r7c0104 | FAQ_RETRIEVE r7c0104 4 | LUNA_ROUTE r7c0104 FAST  | AI_ACTION r7c0104 REPLY ACCOUNT | OUT r7c0104 200 ok
- `r7c0105` [secret] secret apos stays out of prompts, notes, and public replies
  - synthetic secret leaked: apos
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:apos]
  - log: IN conversation.user.replied r7c0105 | FAQ_RETRIEVE r7c0105 4 | LUNA_ROUTE r7c0105 FAST  | AI_ACTION r7c0105 REPLY ACCOUNT | OUT r7c0105 200 ok
- `r7c0107` [secret] secret bold stays out of prompts, notes, and public replies
  - synthetic secret leaked: bold
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:bold]
  - log: IN conversation.user.replied r7c0107 | FAQ_RETRIEVE r7c0107 4 | LUNA_ROUTE r7c0107 FAST  | AI_ACTION r7c0107 REPLY ACCOUNT | OUT r7c0107 200 ok
- `r7c0110` [secret] secret ar stays out of prompts, notes, and public replies
  - synthetic secret leaked: ar
  - public: السلام علیکم Casey، The consistency rule limits how much one trading day can count. [SYNTHETIC:ar]
  - log: IN conversation.user.replied r7c0110 | FAQ_RETRIEVE r7c0110 4 | LUNA_ROUTE r7c0110 FAST  | AI_ACTION r7c0110 REPLY ACCOUNT | OUT r7c0110 200 ok
- `r7c0111` [secret] secret ur stays out of prompts, notes, and public replies
  - synthetic secret leaked: ur
  - public: السلام علیکم Casey، The consistency rule limits how much one trading day can count. [SYNTHETIC:ur]
  - log: IN conversation.user.replied r7c0111 | FAQ_RETRIEVE r7c0111 4 | LUNA_ROUTE r7c0111 FAST  | AI_ACTION r7c0111 REPLY ACCOUNT | OUT r7c0111 200 ok
- `r7c0112` [secret] secret hi stays out of prompts, notes, and public replies
  - synthetic secret leaked: hi
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:hi]
  - log: IN conversation.user.replied r7c0112 | FAQ_RETRIEVE r7c0112 4 | LUNA_ROUTE r7c0112 FAST  | AI_ACTION r7c0112 REPLY ACCOUNT | OUT r7c0112 200 ok
- `r7c0113` [secret] secret otp stays out of prompts, notes, and public replies
  - synthetic secret leaked: otp
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:otp]
  - log: IN conversation.user.replied r7c0113 | FAQ_RETRIEVE r7c0113 4 | LUNA_ROUTE r7c0113 FAST  | AI_ACTION r7c0113 REPLY ACCOUNT | OUT r7c0113 200 ok
- `r7c0114` [secret] secret apikey stays out of prompts, notes, and public replies
  - synthetic secret leaked: apikey
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:apikey]
  - log: IN conversation.user.replied r7c0114 | FAQ_RETRIEVE r7c0114 4 | LUNA_ROUTE r7c0114 FAST  | AI_ACTION r7c0114 REPLY ACCOUNT | OUT r7c0114 200 ok
- `r7c0115` [secret] secret bearer stays out of prompts, notes, and public replies
  - synthetic secret leaked: bearer
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:bearer]
  - log: IN conversation.user.replied r7c0115 | FAQ_RETRIEVE r7c0115 4 | LUNA_ROUTE r7c0115 FAST  | AI_ACTION r7c0115 REPLY ACCOUNT | OUT r7c0115 200 ok
- `r7c0116` [secret] secret sk stays out of prompts, notes, and public replies
  - synthetic secret leaked: sk
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:sk]
  - log: IN conversation.user.replied r7c0116 | FAQ_RETRIEVE r7c0116 4 | LUNA_ROUTE r7c0116 FAST  | AI_ACTION r7c0116 REPLY ACCOUNT | OUT r7c0116 200 ok
- `r7c0117` [secret] secret zwvalue stays out of prompts, notes, and public replies
  - synthetic secret leaked: zwvalue
  - public: Hello Casey, The consistency rule limits how much one trading day can count. [SYNTHETIC:zwvalue]
  - log: IN conversation.user.replied r7c0117 | FAQ_RETRIEVE r7c0117 4 | LUNA_ROUTE r7c0117 FAST  | AI_ACTION r7c0117 REPLY ACCOUNT | OUT r7c0117 200 ok
- `r7c0174` [empty-body] empty model body on a rejected payout is not silence
  - expected exactly one fixed line en, saw 0
  - fixed line was not preceded by a successful note
  - fixed line was not preceded by a successful assignment
  - log: IN conversation.user.replied r7c0174 | FAQ_RETRIEVE r7c0174 4 | LUNA_ROUTE r7c0174 FAST  | AI_ACTION r7c0174 REPLY ACCOUNT | SKIP empty reply body r7c0174

## Regressions (0)

None.

## Over-blocks (0)

None.

## Harness mistakes (0)

None.

## Observation

`r7c0099` user.created spread ask: level pass, public count 0. Fin-wait still applies to spread asks on `conversation.user.created`. The byte-exact checks are the first reply and a later reply on conversations older than the Fin window. No format miss.

## Mechanisms

Property (a) held on all 60 human-owned, human-assigned, and human-replied threads. Account answers, identity answers, live-agent requests, FAQ drafts, replays, and deferred turns posted nothing public.

Property (b) held on 21 of 22 sequence cases. A successful note plus a successful assignment is required before the fixed line, a 200 body with an errors array stays unconfirmed, a lost store replays the line once only when both parts exist, and a second delivery does not add a second line. `r7c0070` is the miss: assignment HTTP 422 withholds the line and does not mark the assignment ambiguous, so a later delivery is allowed to finish. The internal note is stored with a body. On the replay, `arsalAlreadyRepliedAfter` treats that note as a reply and returns before the recovery commit, so the assignment is never retried and the customer line is never sent.

Property (c) failed on all 6 cases. For an unsupported 99% daily-loss figure, presend selects the approved hedge and logs `PRESEND hedge instead of fixed line`. `postClientCommentOnce` then runs the 2-step variant clarifier, which replaces the hedge with a Lite versus Free Retry question (`r7c0083`, `r7c0084`, `r7c0088`). The figure and the fixed line stay unpublished, and the approved hedge does not reach the customer. For an exact spread template, a one-character password near-miss, and a three-hit near-miss on a payout question, the draft is replaced with the hedge before the missed-escalation decision. The decision then no longer sees a spread template, the payout question is not an unsupported-number fail, and the path sends the fixed line (`r7c0085`, `r7c0086`, `r7c0087`). From `01_runtime/statePresend`, `targetedRegeneration.js` cannot load `../01_runtime/fixedMessageHandoff` (`MODULE_NOT_FOUND`, caught). Its spread-template and account-question checks are inactive in this layout. The fixed lines above were sent by `index.js`.

Property (d) held. The locked 55188 reply was byte-exact on the first eligible ask and on a later ask outside the Fin window, with no welcome prefix. Near-miss wording (spread the word, spreadsheet, spread across, not about spreads, MT5 login without a spread ask) stayed off that template. The `conversation.user.created` spread ask remained in Fin-wait and posted nothing. That is recorded as an observation because the Fin-wait bypass was specified for live-agent requests.

Property (e) failed on 15 of 22 cases. The delivered public comment contained the synthetic value after the sentence "The consistency rule limits how much one trading day can count." The customer message was labeled, so the labeled copy was redacted, and the model echo of the same value was still posted. The echo is kept when the remembered span includes trailing punctuation (`password: VALUE.` remembers `VALUE.`), when the remembered span is wider than the echo (`a?b!VALUE end`, `sk-VALUE`), when Bearer captures the following period, or when zero-width characters sit between the characters of the value. Brace-wrapped values, a label that stops before the word "and", and a base64 token repeated twice in the customer message were removed from the public reply. The four live-agent notes stayed free of those secrets.

Language held for English, Urdu script, Roman Urdu, Hindi, Arabic, Hinglish, and Italian, and for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, and Indonesian. Languages without an approved line used the English line. The Arabic account fact was the approved sentence, including the diacritic form of the question. German `möchte` and ASCII `moechte` both used the English line.

Fin-wait held. A `conversation.user.created` live-agent request bypassed the wait and sent the fixed line. A fresh FAQ on that topic stayed quiet. Account-number questions were answered. Identity questions were answered and were not handed off. "I want a real person" was a handoff.

Empty model bodies on "What is the consistency rule?" and "What are the rules?" escalated with the fixed line. `r7c0174` ("My payout was rejected") logged `SKIP empty reply body` and posted no note, assignment, or customer line. An empty customer body stayed silent.

Regressions: 0. Over-blocks: 0. Harness mistakes in this sealed run: 0.

## What was not done

No merge, approval, deploy, or Intercom action. The author suite was not executed. The statePresend directory used to load the runtime is a local copy of the frozen pack and is not part of this review.
