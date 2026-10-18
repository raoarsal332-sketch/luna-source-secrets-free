# t742 Phase D — design and acceptance plan

Status: DESIGN ONLY. No implementation in this commit. Cycles 1 and 2 stay exhausted. This is not a third patch cycle.

Source tree the design cites: `3b4acc1fbba05f5d936924326fb22374535e4c6b` on `t739-mt5-shared` (freeze `t739-integrated-r2-full`). All line numbers are from that tree under `staging-repair-t739/candidate/` unless a path is written out.

Requested model: `claude-sonnet-5-5`. Actual model for this document: `grok-4.7`. Implementation model after freeze: Grok 4.7. Blinded reviewer: `bc-ad6955b1`. This author does not review the sealed set and does not claim model diversity.

Scope: staging only. No production, no SSH, no VPS, no deploy, no restart, no real Intercom write, no credentials, no paid model call, no network retrieval. Synthetic data only.

`part_type=comment` write-op defect: separate workstream. Out of this design.

---

## Binding decisions, as designed

1. A customer-facing automated reply is an approved catalog body or an approved immutable template, selected by id and checked against that id's hash. The model does not compose a public sentence. Envelope replies and the spread template stay sendable as compositions of those parts. Section (c) enumerates every current legitimate public output.
2. Staff hold note, exact text: `Reply held by safety check (reason: CODE). Nothing was sent to the customer.` Automated safety holds post nothing. Held text and credentials never appear in a note, a log, or a public comment.
3. Atom clarification: abstain.
4. Atom 2-Step trailing: abstain.
5. Multi-intent: abstain unless one approved body covers every intent. The spread template is its own approved output and is not a second policy body.
6. Uncertain language on a module-specific request fails closed while that module is OFF. A clearly non-English turn is not relabelled English and is not swallowed by a module-off claim. See the owner question in (m): decision 1 forbids a model-written non-English paragraph, and no non-English row is sendable.
7. One router. Claims are `exclusive`, `shared`, or `none`. Selector vocabulary does not create ownership. STOP, aiOff, Risk/Escalations, human ownership, duplicate prevention, locks, and the approved containment guard stay in force.
8. MT5 public writes are deny-by-default at the single transport. Output must match an approved composition exactly. Spread-test state is persistent per conversation. No investor login or password is released. `spreadPublicGuard.js` stays the `2158c43f` bytes. A guard whose hash starts `846c225f` is never restored.
9. Packs and Atom retrieve sendable catalog rows only, abstain when the score is not calibrated, and consult the unresolved-policy registry by name. No new FAQ row, no new body, no id change, no sendability change. One shared matcher, specified in (g).
10. Missing sources are one list in (n) and (k), with exact relative paths.
11. Implementation is Grok 4.7. Review is `bc-ad6955b1`, blinded, separate from this author.
12. Acceptance is a new held-out sealed set: 0 safety failures, no non-sendable emission, no mandatory-control bypass, no new agreed-baseline regression, at least 95% correct, at most 5% false refusal. Packs/Atom end-to-end PASS requires the real delivery and persistence dependencies. Without them that stratum is BLOCKED, not failed.
13. Recovery rehearses file restore now, and rehearses runtime/op-store recovery only where a real staging file exists.

---

## (a) Components, data flow, precedence

```
customer turn
    |
    v
mandatory controls          STOP, aiOff, Risk/Escalations, human ownership,
(unchanged, first)          duplicate prevention, locks, Fin-wait
    |
    v
normalizeForRoute           NFKC, strip format chars, confusable skeleton
(once; match side only)     does not rewrite the stored catalog body
    |
    v
language gate               en / non-en / uncertain, on the normalized text
    |
    v
spread-test state           idle | offered, persisted atomic JSON
    |
    v
router                      exclusive | shared | none
                            conflict -> abstain, no public text
    |
    v
shared matcher              one sendable id, or abstain
(V12, and Packs/Atom        never returns prose
 when that module is ON)
    |
    v
composition                 greeting slot + at most one body + optional spread
                            each part checked by id and hash
    |
    v
public-write boundary       deny unless the composition verifies
index.js icRequestUnguarded same decision for plan persistence
axios at line 352
    |
    v
Intercom comment            or silence
                            staff safety hold -> fixed note only
```

Precedence, highest first. A later stage never overrides an earlier denial.

1. Mandatory controls. A STOP, aiOff, Risk/Escalations, human-ownership, duplicate, lock, or Fin-wait denial sends no automated public comment and clears spread-test state when that control is one of the clear events in (d).
2. Spread-test state `offered`, and this turn is not a personal-account turn and not a clear event. The approved output is `tpl.spread.safe-reply`, alone or as `comp.catalog-plus-spread` when step 4 returns exactly one body. No access-word list is consulted on this turn.
3. Router. Two `exclusive` claims, or an `exclusive` claim that also contains the other module's entity, abstain with no public text. One `exclusive` claim with that module OFF is terminal silence for `en` and for `uncertain`. `shared` and `none` are not claims. A `non-en` clause is not a module claim.
4. Shared matcher on the catalog the router allowed: the ON module's sendable rows, otherwise the 12 sendable V12 rows. One id, or abstain.
5. Abstain. No model sentence. No public comment. An automated abstain posts no note.

The in-memory `pendingSpreadTemplateAppend` map (`index.js` line 4106) is not the state machine. It is replaced by the persisted record in (d). The webhook `finally` flush at lines 11379–11386 is deleted as a second sender; a turn that owes the spread template sends it through the same boundary as every other public comment.

---

## (b) Router contract

One module, new file at implementation time: `staging-repair-t739/candidate/publicRouter.js`. Packs and Atom do not register by calling `detect()` in list order. `faqModuleDetectors.js` lines 166–168 register Packs first and Atom second, and `faqAssistance.js` `moduleScope` (lines 435–467) gives the first `detect()===true` the turn. That order is the Phase 4 cross-silence bug. The new router asks both modules for a claim and then applies the conflict rule. Selector return values are ignored for ownership.

### Claim

Each module implements `claim({ text, normalized, prior })`:

| Field | Values |
| --- | --- |
| `kind` | `exclusive`, `shared`, or `none` |
| `entity` | `packs`, `atom`, or `null` |
| `evidenceSpans` | offsets into `normalized`; empty when `kind` is not `exclusive` |

`exclusive` is legal only when this module's product entity is present in `normalized` and the other product entity is absent.

Product entity, after `normalizeForRoute`:

- Packs: the phrase `elite packs` or the token `packs` / `pack`, including spaced and confusable forms the normalizer already folded. The token `pack` inside `packet`, `package`, or `backpack` is not an entity (the current scrub in `faqModuleDetectors.js` stays the definition of those exclusions).
- Atom: the phrase `elite atom` or the token `atom`, after the current exclusions `atomic`, `anatomy`, `anatomical`, `atomizer`.

These two entity definitions are the only surface forms that may produce `exclusive`. They are the product names, not a selector vocabulary.

`shared` is the required kind when the text contains a selector word and does not contain this module's entity. The words that Phase 4 treated as Packs ownership are `shared` for both modules and establish nothing: `discount`, `subscription`, `refund`, `dashboard`, `elite` alone, `atom` inside a Packs claim, `card`, `credit`, `checkout`, `simulated`. `packsProductHint` (`packs/packsAnswerSelect.js` lines 68–76) returns `elite-packs` for that list, including `\batom\b`. The router must not call `packsProductHint` to decide ownership.

`none` means no entity and no shared word.

### Conflict rule

| Claims | Result |
| --- | --- |
| one `exclusive`, the other `none` or `shared` | that module owns the turn |
| two `exclusive` | abstain, no public text |
| `exclusive` but the other module's entity span is also present | abstain, no public text |
| no `exclusive` | nobody owns the turn; V12 matcher and spread state may still run |

A throw from `claim` is an `exclusive` claim for that module (fail closed), same as today's detector `onThrow: true` in `faqAssistance.js` `safeBool`.

### Flags off

Flags stay default-off. Packs on only when `LUNA_PACKS_ENABLED=1`. Atom on only when `LUNA_ATOM_SELECTOR_ENABLED=1`.

| Turn | Flag | Public result |
| --- | --- | --- |
| `exclusive` Packs or Atom, language `en` or `uncertain` | OFF | terminal silence, reason `module-off-fail-closed` or `language-uncertain-module-off` |
| `exclusive`, language `non-en` | OFF or ON | not a claim; non-English main route (f) |
| `shared` or `none` | OFF | not a claim; V12 and spread are not silenced |
| `exclusive`, flag ON, delivery deps present | ON | matcher may return one sendable id |
| `exclusive`, flag ON, delivery deps absent | ON | terminal reason `module-on-delivery-not-wired`; no invented body |

`shared` does not silence the 3 V12 rows, 3 FAQ rows, and 9 spread rows that Phase 4 lost while flags were off, and it does not let Packs own the Atom asks.

### What the router does not do

It does not select an answer id. It does not read `packsProductHint`, the V12 `SELECTORS` loop (`faqAnswerSelect.js` line 289), or any cue list. It does not run before the mandatory controls.

---

## (c) Public-write boundary

### The single transport

Customer-visible HTTP writes go through `postReply` (line 6124) → `postReplyWithOwnershipLock` → `icRequest` → `icRequestUnguarded` → `axios({ method, url, data })` at line 352. `isWrite` is any method other than GET, HEAD, or OPTIONS (line 300). Holds today also run at lines 261, 307, and 344. Those three call sites stay as the places a decision is made. The decision changes from `holdOutgoingPayload` (allow unless a credential cue fires, and notes return null at `publicCredentialHold.js` lines 750–756) to deny-by-default `assertApprovedPublicOutput`.

The same function judges plan persistence, replacing `holdPlanForPersistence` (`publicCredentialHold.js` lines 799–807). A plan that would not be legal to send is not written.

Direct `axios.get` calls (admins, contacts, attachment fetch) are reads. They are not public replies and are not passed through the allowlist.

Staff `REPLY` (lines 7462–7490) and any `FOLLOW` that reaches `postReply(..., 'comment', ...)` use this function on the raw note body, HTML, href, src, and attachments before send. A free-text staff body is denied. A staff command may carry an approved id; the boundary loads that id and verifies the hash. On deny, the only write is the staff hold note. Automated denies write nothing.

### Allowlist check

`assertApprovedPublicOutput(data)` returns `{ ok: true, ids, hashes }` or `{ ok: false, code }`. Default is deny.

For `message_type === 'comment'` (and for any write that is not a note):

1. Attachments absent or empty. There is no approved attachment. Code `ATTACHMENT_DENIED`.
2. Collect every `href` and `src`. None of the approved parts below contain a URL. Any href or src is `URL_DENIED`.
3. Visible text, after the existing `normalizeBody` (CRLF, collapsed spaces, collapsed blank lines, trim — `faqApprovedAnswers.js` lines 32–38), splits on `\n\n` into parts.
4. Every part matches exactly one approved part class below. Order is fixed: optional greeting, then at most one catalog or template body, then optional spread template. Any other shape is `NOT_APPROVED_OUTPUT`.
5. The selected ids' stored hashes equal the hashes recomputed from the part text.

For `message_type === 'note'`:

- Not a customer reply. It is still denied unless it is an approved note template.
- The only safety-hold note is `note.staff.hold`, format below. `CODE` matches `^[A-Z0-9_]{1,48}$`.
- Automated safety denial does not post this note and does not post a comment.
- A note is denied when its text contains the customer turn or the denied public body. Code `NOTE_LEAK`.
- Existing constant command notes that contain neither customer text nor a denied body may stay. They are listed as note templates, not as public outputs. Dynamic interpolation into a note is denied.

### Logs

Every boundary decision logs one JSON object and nothing else:

```
{ "event": "PUBLIC_WRITE", "code": "<CODE>", "ids": ["<id>", ...], "bodyLen": <int>, "hrefCount": <int>, "attachmentCount": <int> }
```

No body, no href value, no attachment name, no `e.message`, no `e.stack`, no slice of a draft reason. This replaces the carriers Phase 4 case ids MT5R2-143 and MT5R2-179 can hit:

| Carrier | Site | What it can emit today |
| --- | --- | --- |
| `IC_REQ_ERR` | `index.js` line 380 | `e.message` |
| `IMAGE_SKIP quoted-history` | `index.js` line 3860 | attachment `name` slice of 40 |
| `TOOL_BUDGET_EMPTY_FALLBACK` | `index.js` line 9048 | `__whyS.slice(0, 60)` |
| draft `BODY:` interpolation | `index.js` lines 9053–9054 | `__whyS.slice(0, 80)` written into a draft that can be posted |
| `WEBHOOK_ERR` | `index.js` line 11395 | `e.message` and `e.stack` |

The line 9053 draft also dies at the boundary: a sentence built from a runtime reason is not an approved part.

### Hashes

`normalizeBody` sha256, UTF-8, as `faqApprovedAnswers.sha256`. Greeting and template hashes below were computed that way on this tree.

#### Spread template

| id | hash | justification |
| --- | --- | --- |
| `tpl.spread.safe-reply` | `c480da9de5399b500a68891349d81edf9f98733af19cd031fbc63c277e3e05b3` | `SAFE_SPREAD_REPLY` in `spreadPublicGuard.js` lines 13–16. Raw and normalized hashes match. This is the only spread public text. It does not contain an investor login or password. |

File hash of both guard copies: `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` (`candidate/spreadPublicGuard.js` and `base/spreadPublicGuard.2158c43f.js`).

#### V12 sendable bodies (12)

Catalog file `candidate/faq-approved-answers-v12.json` sha256 `9c1b9385b67b8a2904588305cac0481ddfdeb877b568a96f740aa91844bfbde3`, version `v12`. Sendable means `owner-approved` / `approved` via `isSendableRow`. Five rows stay non-sendable (`needs-owner-approval`): `faq.daily-loss.generic.en`, `faq.profit-split.en`, `faq.stop-loss-mandatory.ur-latn`, `faq.2step-lite.daily-loss.es`, `faq.2step-lite.daily-loss.ar`.

| id | contentHash |
| --- | --- |
| `faq.stop-loss-mandatory.en` | `01788f3a81026d6ace756140efb69c86043ae7a56ad2bb44ea44b73da3db67f5` |
| `faq.2step-lite.daily-loss.en` | `ca84c046e8d7eeb4c20d01ec55c161d855b5333b54aa1a9f7cb3612039809e47` |
| `faq.2step.daily-loss.en` | `a25964ae5db606fded8a23ea9f88b7eb6d26dc4a4b8ae0bd43ec4bb4323aa5f3` |
| `faq.1step.daily-loss.en` | `7095e110306dbe11187d0c95d6ede786e8bda0b14706c551eb3aac3b205193dc` |
| `faq.2step-lite.min-trading-days.en` | `701b60b67f360d08d2b7aacaa6c931f23a00093fec29eae08d467a8ecaf2cecb` |
| `faq.min-holding-time.en` | `b9fb747fbdcc7561b4182a40f2c6049aa44bd71cff97bef3aba83e44a9300df3` |
| `faq.soft-breach.en` | `6fc604b1e3af6eb59c5177127e73dc90a8e86eeb766c7f291be161472a7152d4` |
| `faq.travel-trade.en` | `d21601ae0974d299a88efca42542207e452e75a66d72abeb30e815be62567cc4` |
| `faq.2step-lite.leverage.en` | `39350ad409478ecf047a6cf75caac6cfb015e086b7e370c62113c7b3fc82de81` |
| `faq.payout-request-timing.en` | `b33f0576ac025654f96f26ad64ec0fc45c5d227dd74ccfdb90965ae2a13a61f4` |
| `faq.is-broker.en` | `87fe98bc1e3517212a6330aa501eccbfb4ddf7b42c5d1eb9d1e183246d9dc2bf` |
| `faq.free-trial.en` | `196458b1c6defefdbbc1bdfec6b05de3eea055bf7c918f5d1185e503f19819db` |

#### V12 named templates

These are already `templates` in the V12 JSON. They are approved parts, not new prose.

| id | hash |
| --- | --- |
| `tpl.v12.backendCaveatExistingHuman` | `332cd8a862260466bbc8de236164c6395270812e323dc0348290f886de8a5798` |
| `tpl.v12.backendCaveatConfirmed` | `fd0171693ab1c918241fb7f5f33a09ff9102bd6173c28ee224bdcd1e8e993ec7` |
| `tpl.v12.backendCaveatIdentity` | `e0f3b8fd3bd87776b1d89e74cee9a20bf4cfc346f26d6c8c722db1bc5cac62fd` |
| `tpl.v12.backendCaveatDefault` | `1a7ab6582496550fc2e8c4515d733099fabe9feac0164540fd03bcd9b62dc33f` |
| `tpl.v12.assuranceNoPersonalBreach` | `2de245c82b4f11b99a807abc5595f2989d86fa9b4f57080f269109e8ccb85963` |

#### Envelope parts

`ensureFirstReplyWelcomeIntro` (`index.js` lines 6343–6371) prefixes a live first name. The concatenated string matches no catalog hash. `appendSafeSpreadReply` (lines 4112–4116) concatenates a body with `SAFE_SPREAD_REPLY` and that concatenation matches neither hash. Both stay legitimate as compositions of hashed parts. The boundary never hashes the concatenation.

Exact greeting skeletons, already `PURE_GREETING_ALLOWLIST` (`faqApprovedAnswers.js` lines 65–92), plus the Arabic greeting that line 6366 already sends and that the Latin allowlist does not contain. Assigning the Arabic string an id is what keeps that live reply from being a silent block.

| id | text | hash |
| --- | --- | --- |
| `env.hello.comma` | `Hello,` | `dafe7694460f4e37b708f5134f2f7f759cb997f9cb612d6ca566dd6e6a34353f` |
| `env.hello.dot` | `Hello.` | `2d8bd7d9bb5f85ba643f0110d50cb506a1fe439e769a22503193ea6046bb87f7` |
| `env.hello.bang` | `Hello!` | `334d016f755cd6dc58c53a86e183882f8ec14f52fb05345887c8a5edd42c87b7` |
| `env.hello.bare` | `Hello` | `185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969` |
| `env.hi.comma` | `Hi,` | `bc50944723f014607ad612b6983944a7b9b77661663491a3991121c3d2885144` |
| `env.hi.dot` | `Hi.` | `17f4444f3932f8a1c554c7cdea92208dbecb03b0173a2b6a79cc2310a05c5fad` |
| `env.hi.bang` | `Hi!` | `ca51ce1fb15acc6d69b8a5700256172fcc507e02073e6f19592e341bd6508ab8` |
| `env.hi.bare` | `Hi` | `3639efcd08abb273b1619e82e78c29a7df02c1051b1820e99fc395dcaa3326b8` |
| `env.hey.comma` | `Hey,` | `6eeab484b885033840d8271bed6863a4eac0e789769730f1195a6be2e1235797` |
| `env.hey.dot` | `Hey.` | `580684f8909e025d71182afbeb6c99242d62c3c6576e7e9b0b8c2ce4eaa176a1` |
| `env.hey.bang` | `Hey!` | `b57c370a0fcc704562e14bc1765dfc6e573fde46ebfda7c229e9f429b5f5697a` |
| `env.hey.bare` | `Hey` | `581d43745726e0ee62911178bfb3887c3fe295d29eeb741f0e40f91e8a70907a` |
| `env.ciao.comma` | `Ciao,` | `4ee5d3892452b537b18e3c4f2176203233b65d6155dce9954f76af006acef02b` |
| `env.ciao.dot` | `Ciao.` | `3cc2c633532ade44baaadc14c01ca78bf0c8a07121404746e1fe7b20f841ad0f` |
| `env.ciao.bare` | `Ciao` | `25c73520e69f4bf229811e8e46ffe7d80471544b9bee15ed25044b86be4115ad` |
| `env.salam.comma` | `Salam,` | `e2232b1d352776afd4ccc781d601c683680abc28d36ffeb89328fea856b327ee` |
| `env.salam.dot` | `Salam.` | `2c873c860c7bae67fe29dbfa92f903a25a7f23fe3b89d86b8a36938bffb98495` |
| `env.salam.bare` | `Salam` | `e6aff8d7aabcab5ae824356814a091ba2867835cd6b50e6103b95e29866732a5` |
| `env.thanks.reaching` | `Thanks for reaching out.` | `20de8db34440fd0c7c7b1c730fab6660df51408e05a2bec71dd9f52174c3ee07` |
| `env.thanks.contacting` | `Thanks for contacting us.` | `e93964a50dc28c99a1faeeeaaab9dec674d7e622ab70cf1ebdba9da1b511302d` |
| `env.thanks.writing` | `Thanks for writing.` | `f6284e97cd3756edf1ae882abdfc6158c2870bdeaa26b9c7e21025526280b086` |
| `env.hope.doing` | `Hope you are doing well.` | `e370a15841e8778eb9049b53f1d1571659ab4ced8cc8c67b685c781d8c4222a8` |
| `env.hope.youre` | `Hope you're doing well.` | `dfa2b82fff5aa640a0affa65c555af83bdaa52fb6dfdd90627661675f254183e` |
| `env.hope.well` | `Hope you are well.` | `bc5c0f514059181ded9831a8830c987f1b3d22d90024e35488db46c56cc276e6` |
| `env.ar.comma` | `السلام علیکم،` | `3fd7e04df00fbae63c681658f56666dc1aff440bd9104f627fcc6fbd6b454b40` |
| `env.ar.bare` | `السلام علیکم` | `49cd94d13f541d8af10cc899cb44f5446b874c43da5563d7a565db438fdfa3d2` |

Name slot, not a whole-string hash. Id `env.greeting.with-name`. The part matches one of:

- `^(?:Hello|Hi|Hey|Ciao|Salam) [A-Za-zÀ-ÿ'\-]{1,40},$`
- `^السلام علیکم [A-Za-zÀ-ÿ'\-]{1,40}،$`

The name is the contact first name after `firstNameFromClient` (lines 6321–6328): one token, letters only. Reject if the part contains a digit or a policy word (`kyc`, `payout`, `withdraw`, `refund`, `breach`, `account`, `verified`, `approved`, `sent`, `limit`). This is the existing `PURE_GREETING_WITH_NAME` test (lines 94–95 and 198–204) plus the Arabic comma that line 6366 already emits. Identity of the slot is the hash of those two pattern strings joined by a newline: implementation records that hash next to the id before the sealed run. The rendered name is not hashed.

At most one greeting part, and it is first.

#### Composition classes

Join is `\n\n` between parts. The class id is what the log records. Verification is per part.

| class id | shape | why it exists |
| --- | --- | --- |
| `comp.body-only` | one sendable body or one named template | exact catalog reply |
| `comp.envelope-plus-body` | one greeting part, then one sendable body or named template | the info/envelope replies that are correct today and match neither a body hash nor a template hash |
| `comp.spread-only` | `tpl.spread.safe-reply` | eligible spread-test reply, including a follow-up while `offered` |
| `comp.catalog-plus-spread` | one sendable body or named template, then `tpl.spread.safe-reply` | mixed turn whose non-spread intent has exactly one covering body |
| `comp.envelope-body-spread` | greeting, one body, spread template | first reply that is both an envelope and a mixed spread |

A second catalog body in the same comment is `MULTI_BODY_DENIED`. Decision 5: no public text for the uncovered intent. If the spread state is `offered`, `comp.spread-only` is still sent.

#### Packs sendable bodies (40)

Catalog `candidate/packs/faq-approved-answers-packs-v1.json` sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`, version `elite_packs.v1.20261017`, 259 rows, 40 sendable under `packsApprovedAnswers.isSendableRow`. These ids are approved public parts only when the router has an `exclusive` Packs claim, the flag is on, and delivery deps are present. While the flag is off or delivery is unwired they are not emitted. Naming them here is what stops a later patch from inventing a body. Sendability flags stay as they are.

| id | contentHash |
| --- | --- |
| `packs.overview.en` | `f5e1a59e8520aed277a0169cb5a2e53c7a69fb3be6c099b6fb1a4722adb4fcff` |
| `packs.dashboard-tabs.en` | `ca5983b73c18374873532f92bf20ebb10f9764608c569272762c5045fa34aa64` |
| `packs.cards-per-pack.en` | `b02f0c1ed306b325d2829c5e0ab7410f9738e98339a565b1c1d7069f29a305f3` |
| `packs.which-pack-best.en` | `a385e70bd77c0940d16bd70c3cfec7c264ca1636f7e487e70e93e6b35fec48e1` |
| `packs.pack-costs-floors.en` | `a593dfd875fb448dc158b7cfdc4da3a8f4f7972ea66d80c581daa64026e465b6` |
| `packs.drop-rates.en` | `9b1b8f36f6ad2a0642e9c476a419eb111c5e98500f5c844721664e9764787b19` |
| `packs.card-count.en` | `8ca53485a0c76cb26a5b93c20df508db44009d221e65beed6f130bae16180308` |
| `packs.rarity-floor.en` | `dfb98799ebbdae425cd4734803df4eac7e9883effcedf5b31a8253a4f1334e87` |
| `packs.credits-vs-payout-credits.en` | `86d225907fa74daf84334299f1e529347057f8244b64e72844e38e6765aca236` |
| `packs.buy-credits.en` | `524e93570855a4325a7afe3406a7c154a919a87ce0c2afb164fc40cda6d8c8ef` |
| `packs.convert-payout-credits.en` | `830240469dc826a88c116962ba4ae7b753f7fe09d44fde911e6976157660d4da` |
| `packs.withdraw-credits.en` | `14689cf865e7a41cb69bd51cc00d015682fb80a11489e3552329620a431210e4` |
| `packs.monthly-subscription.en` | `3e68be02120f6005e94f31be43bc7ec112e28c104a8adabf8ae77d394a85f0ac` |
| `packs.cancel-subscription.en` | `52fbe8903b0c503832e33b1c0a11122b9914f6605bca45f622725d5d9c3241b8` |
| `packs.crypto-discount.en` | `9fb95e7fb7188ee05303ec6142f1cbbc39f9df0d45d736a59bca81bfd8d53266` |
| `packs.opening-and-charges.en` | `0f6a4da09246f6b814d6b09248d22c5015fe39c420e09138774cbd208b9e893d` |
| `packs.chain-upgrade-discounts.en` | `f10d36387e35b0a5c8d39d87fa79a74894d592a318a747088b12186a0e350005` |
| `packs.inventory-use-card.en` | `519c5d47bc984fcaafb28ee3f5368f91817dfcc8117f01ee9bba10cbfa4c4133` |
| `packs.card-auto-apply.en` | `25d3104f839fd2e7973deceb4a8cbfe8942326cc671dcee872bb7ec1a60362f9` |
| `packs.uses-multiplier.en` | `43dbd4cc6fefc64dee3deae010e0869a296020e2db25ef4bd9c24595364869df` |
| `packs.discount-stacking.en` | `e97f34e85a768bb6b3fcb1ac70f4329a4b4721614c00cc662ba7bfe39f34be3e` |
| `packs.eligibility-labels.en` | `3129c3b642183bd85e484900bb62609bc7a3f8dff8def8b572cb41403dba3f99` |
| `packs.exotic-cards.en` | `258eee1da6ccc61dff2f574d519952600b9c63840adb067ec50e658d3e177df8` |
| `packs.the-million.en` | `a15d10b4df9e89b4e239f21805767f8cdb0266055e2ff61570b854402a7014d3` |
| `packs.lucky-streak.en` | `31d20bc6207c882ca929a0c74849764e149f45625d8d42c1051ee974d10d2b0c` |
| `packs.pack-pass.en` | `7baabfeed1cb0b816ecdad6f6de2d20f2c081edc63e6e7d6f35928d5cce4f2e8` |
| `packs.special-packs.en` | `93bbfadb0a75d5e6d5f0bbc7435c19018159ae4dea37c70e4e5a60007af9c35b` |
| `packs.my-packs-keys.en` | `f5597b7c62ab30a103c03ec2dd5099c26a80298da6620b4b68f450360427efd0` |
| `packs.collection.en` | `a72357f8345903281a98a1301d722966ec9e9a11aeeb453114be6a816ac7ca64` |
| `packs.free-packs-general.en` | `eb6179eb6d0fa8cfe5493c2bf9ef15852acbf6261b8f29aba5ae0d7898f68d0a` |
| `packs.refunds-legal.en` | `e39b5fe616372c3c7eaaf2a36ca849d6491266f6981e1f260173d564b16ae00c` |
| `packs.missing-reward.en` | `904db1038b24a96cb33effec9a636f76bc858d6822d8907b82d869e9f44dae71` |
| `packs.account-status.refuse.en` | `084d4da1970176508bcf2f994e003c466cfe2a44f1226070c2c335dc43a580ea` |
| `packs.followup.whale-pack.en` | `7f002f91aa0c552461745ac0ccc27cdcbc6efb9a31c88033cb98fd5d3387ad3c` |
| `packs.followup.oracle-pack.en` | `35923ac48f3d28dc8b085f37f416f8c9403d836da06a3bbe65e8da19e87b7f24` |
| `packs.followup.payout-boost-100.en` | `7d38976df023cde290afbf3879065d2e1f58d1ea64d9d1d8f761c83d4593c443` |
| `packs.followup.purple-card-ambiguous.en` | `5d0151b17a71a9d55957c9b392799b57e33e60c51a45c365190d110e53c49782` |
| `packs.atom-bundle-distinct.en` | `dd63dc2f96573334e58efd438fa66d015ecdbe6cee5411cf415119856d262bc6` |
| `packs.handoff.unverified.en` | `711e367ff423b475860478dbd2e5b66d1b8c0b3372efd0298558876cc0f940f0` |
| `packs.simulated.en` | `a744add2f83e38d98fd870f5b07b616a7cd93df5d507077c26566d468b478bb7` |

Packs templates, same hashes as the identical V12 string where the text matches:

| id | hash |
| --- | --- |
| `tpl.packs.backendCaveatExistingHuman` | `332cd8a862260466bbc8de236164c6395270812e323dc0348290f886de8a5798` |
| `tpl.packs.assuranceNoPersonalOwnership` | `1a34c7b6f4f8076912298b075e6f278dc87393ffb5a02e69e213a27e3c6c83e9` |

#### Atom sendable bodies (31)

Catalog file that exists: `candidate/atom/faq-approved-answers-atom-v1.json` sha256 `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6`, version `elite_atom.v1.20261017`, 198 rows, 31 sendable under `computeSendable`. The loader's default path does not point at this file; see (n). Same emission rule as Packs: flag on, exclusive claim, delivery deps present.

| id | contentHash |
| --- | --- |
| `atom.overview.en` | `d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632` |
| `atom.2step.phases.en` | `3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3` |
| `atom.2step.daily-loss.en` | `bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b` |
| `atom.2step.max-loss.en` | `e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526` |
| `atom.2step.min-days.en` | `de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7` |
| `atom.2step.consistency.en` | `9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7` |
| `atom.2step.news.en` | `06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4` |
| `atom.2step.leverage.en` | `9359b2fb2ce639351a49f157e876df5d3645c51188bf1f6a47f9ed1b303d65da` |
| `atom.2step.reward.en` | `07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01` |
| `atom.1step.phases.en` | `2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb` |
| `atom.1step.daily-loss.en` | `a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1` |
| `atom.1step.max-loss.en` | `78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc` |
| `atom.1step.min-days.en` | `4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6` |
| `atom.1step.consistency.en` | `56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982` |
| `atom.1step.news.en` | `8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee` |
| `atom.1step.leverage.en` | `2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe` |
| `atom.1step.reward.en` | `5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac` |
| `atom.1step.funded-profitable-days.en` | `3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53` |
| `atom.payouts.general.en` | `290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924` |
| `atom.prices.list.en` | `202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5` |
| `atom.checkout.options.en` | `903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a` |
| `atom.bundles.en` | `c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a` |
| `atom.house.eas-copy.en` | `2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae` |
| `atom.house.simulated.en` | `41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478` |
| `atom.handoff.unverified.en` | `ff7878e016e0c5d7286afd81ca5e7c80a1d90c89e858ef32edfb635c0fedbbc6` |
| `atom.account-status.refuse.en` | `c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128` |
| `atom.obsolete.10pct-1step.en` | `71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5` |
| `atom.obsolete.first-payout-14.en` | `74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239` |
| `atom.obsolete.leverage-150-default.en` | `45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01` |
| `atom.obsolete.price-161-permanent.en` | `b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d` |
| `atom.obsolete.sizes-5k-10k.en` | `dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2` |

Atom templates:

| id | hash |
| --- | --- |
| `tpl.atom.backendCaveatExistingHuman` | `332cd8a862260466bbc8de236164c6395270812e323dc0348290f886de8a5798` |
| `tpl.atom.assuranceNoPersonalBreach` | `2de245c82b4f11b99a807abc5595f2989d86fa9b4f57080f269109e8ccb85963` |

#### Note templates (not public comments)

| id | text | hash of the literal with `CODE` |
| --- | --- | --- |
| `note.staff.hold` | `Reply held by safety check (reason: CODE). Nothing was sent to the customer.` | `a81a4390251eb45525c92fe040cd13d03dbb67de33e72908e79efdbd6c11c1af` |

The hash is of the format with the four characters `CODE`. A real note substitutes a safe code and is checked by pattern, not by that hash. `staffHoldNote` (`publicCredentialHold.js` lines 824–826) already returns this sentence.

### Blocked, with justification

| Output | Code | Justification |
| --- | --- | --- |
| Any model-composed sentence, including a paraphrase of a catalog body | `NOT_APPROVED_OUTPUT` | Decision 1. The model may return an id. It may not return a sentence. |
| Staff `REPLY` / `FOLLOW` free text | `NOT_APPROVED_OUTPUT`, then `note.staff.hold` | Decision 1. Staff may name an approved id. The Phase 4 S09 leak was a staff `REPLY` whose predicate returned null (`index.js` lines 7477–7480). |
| Public attachment | `ATTACHMENT_DENIED` | No approved attachment exists. Phase 4 leaked on this channel. |
| Any href or src | `URL_DENIED` | No approved part contains a URL. |
| Investor login, investor password, or any credential pair | `NOT_APPROVED_OUTPUT` | Decision 8. No such template exists. The `2158c43f` guard remains a backstop inside the hold module and is not the allowlist. |
| A single hash of `body + SAFE_SPREAD_REPLY` or `greeting + body` | `NOT_APPROVED_OUTPUT` | Those concatenations are compositions. Hashing them as one string would either reject the 64/64 envelope replies or admit a string nobody approved. |
| Non-sendable catalog rows | `NON_SENDABLE` | Status flags unchanged. V12 pending five; Packs 219 non-sendable; Atom 167 non-sendable. |
| Clarify, nudge, engage, and scope-decline sentences whose source modules are absent | `NOT_APPROVED_OUTPUT` | Decision 5 abstains. The text lives in modules that are not in this tree (`UNCLEAR` path around `index.js` line 5409 calls into missing modules). This design does not invent that text and does not assign a hash. |
| Two policy bodies in one comment | `MULTI_BODY_DENIED` | Decision 5. |

`assertAllowlistedFinal` (`faqApprovedAnswers.js` lines 224–278) already admits exact bodies and greeting-plus-body compositions for the FAQ path. The transport boundary is the generalization of that check to every public write, including model text, spread concatenation, and staff `REPLY`, which do not pass through it today.

---

## (d) Spread-test state machine

Persist one record per conversation through `atomicJsonFile.readJsonSafe` / `writeJsonAtomic` (the call shapes `index.js` line 146 already uses; the implementation in this repo is the harness stub `harness/stubs/atomicJsonFile.js`). File: `spread-test-state.json` beside the existing ticket-state file (`AUTH_DEFERRED_FILE` is built the same way at line 215). Record:

```
{ "v": 1, "conversationId": "<id>", "state": "idle"|"offered", "templateId": "tpl.spread.safe-reply", "templateHash": "c480da9d…e05b3", "offeredAt": "<iso>" }
```

Write is temp file plus rename, as the stub already does. No new database.

| From | Event | To | Public output |
| --- | --- | --- | --- |
| `idle` | entry predicate true, and the turn is not personal-account | `offered` | `comp.spread-only`, or `comp.catalog-plus-spread` / `comp.envelope-body-spread` when exactly one approved body covers the other intent |
| `idle` | anything else | `idle` | no spread template |
| `offered` | later turn, not personal, not a clear event | `offered` | the spread template again, with no access-word, "again", or "resend" list |
| `offered` | personal-account turn | `idle` | no spread template, no investor content. The personal turn is not answered by this route. |
| `offered` | STOP, aiOff, human ownership change, Risk/Escalations, Fin-wait | `idle` | no spread template |

Entry predicate, idle to offered only: the current positive class `spreadAskGate.explain()` returns `spread-test-credential` (`spreadAskGate.js` `explain` at line 101: personal-account is decided first; the positive class is a test/demo/investor access ask that is not a personal-account problem). Follow-up detection `isBareSpreadFollowUpAsk` (line 191) and the mixed cue list `hasAdditionalNonSpreadAsk` (line 179) are not used once state exists. They are the cue lists Phase 4 showed do not cover bare follow-ups (12 of the 22 false refusals).

Personal-account while `offered` clears the offer. A later "yes" is then not a spread resend. Investor content is never an output in any state.

This entry predicate is the one lexical step the state machine still needs, because a conversation has to enter `offered` somehow and decision 8 does not name another signal. It is not a list that grows to cover follow-ups. See (m) if the owner wants zero lexical entry; that choice blocks first-offer detection.

`gateLegacy` (line 237) already cannot veto a positive strict decision. It stays that way.

---

## (e) Normalizer

One function, `normalizeForRoute(text)`, new shared module `candidate/routeNormalizer.js`.

1. `String.prototype.normalize('NFKC')`.
2. Delete Unicode format characters (`\p{Cf}`), which includes zero-width joiners and the zero-width space.
3. Confusable skeleton: apply Unicode UTS #39 skeleton to each character that has a skeleton mapping, then lowercase. The hand map in `faqModuleDetectors.js` lines 68–75 is not the skeleton and is not reused.

Applied once, to the customer text, before the language gate, before `claim`, and before the matcher. `faqAssistance.js` lines 446–448 run `languageGate` on the raw clause and `continue` on `non-en`, which drops a confusable or format-character ask before the detector's own normalizer can fold it. That order is why unicode asks fell through.

The normalizer does not rewrite a catalog body, a template, or a public comment. Outbound bytes stay the stored approved text. `normalizeBody` remains the whitespace normalizer used for hashes.

---

## (f) Language gate

`languageGate` (`faqAnswerSelect.js` lines 95–103) stays the tri-state: `non-en`, `en`, `uncertain`. It runs on `normalizeForRoute` output, not on the raw clause.

Order inside the gate stays: non-English evidence first (line 97), then reliable English (line 98), then prior turns, else uncertain. `nonEnglishEvidence` (line 68) is any non-ASCII character or a Portuguese, Spanish, or Roman-Urdu cue. Portuguese cues stay the current `PT_CUE_RE` (line 17), which is what stops mixed Portuguese plus English rule terms from being labelled `en`. `shortClearEnglish` (lines 56–62) keeps a short clearly English question with an English prior. `payout?` stays uncertain (one token).

Effects:

- Clearly non-English: not a module claim (`moduleScope` already `continue`s on `non-en`, line 448). Not answered with an English row (`selectApprovedAnswer` abstains when `lang !== 'en'`, lines 277–278). That is the preserved main-route behaviour.
- Uncertain plus an `exclusive` module claim plus flag OFF: terminal silence (decision 6).
- Uncertain plus no module claim: V12 matcher does not run (it requires `en`). No model sentence.
- The gate does not select a product and does not create ownership.

No sendable non-English row exists (V12 non-English rows are `needs-owner-approval`; Packs and Atom translations are `provisional` or `pending`). The preserved route therefore does not emit a non-English catalog body. Whether a model-written non-English paragraph may still go out is the conflict in (m). The design default is that it may not.

---

## (g) Shared matcher

One function, `matchApproved({ normalized, rows, params })`, in `candidate/approvedMatcher.js`. V12, Packs, and Atom all call it. In-process. No paid model. No network. No per-module word list.

Catalog rows have no question, alias, or exemplar field (verified on all three JSON files: row keys are id, body, hashes, status, tags, source). The match text of a row is its stored body. The customer text never has to equal that body.

### Algorithm

Inputs: normalized customer text `T`, sendable rows only.

1. Tokens: Unicode words (`\p{L}|\p{N}`) of length ≥ 2 on `T` and on each body. Tokens are the normalizer output, lowercased.
2. IDF from the sendable pool in memory: `idf(w) = ln((N+1) / (df(w)+1))` where `N` is the number of rows in this call and `df` is how many of those rows contain `w`. A word in every row has almost no weight. `discount`, `subscription`, `atom`, `elite`, `dashboard` cannot by themselves pick a row when they occur across many rows.
3. Features of a text: the IDF-weighted set of its tokens, plus the IDF-weighted set of its overlapping character trigrams (trigram IDF computed the same way over the same pool).
4. Score(row) = cosine similarity of the two feature vectors.
5. Let `s1` be the best score and `s2` the second. Return that row only when `s1 ≥ T` and `(s1 - s2) ≥ M` and no other row also has score ≥ T. Otherwise abstain.
6. If two rows both have score ≥ T, abstain, even when the margin would have picked one (decision 5).
7. After a win, the module `select` may still abstain because of the unresolved-policy registry. The matcher itself does not contain those topic names.

`T` and `M` are not chosen in this document. Inventing them here would be an uncalibrated threshold.

### Why this is not a cue list

A cue list is a hand-maintained set of strings whose membership is the decision. `packsProductHint` is that: adding `\batom\b` both claims Packs and selects a Packs path. This matcher has no such set. Its features are the approved bodies and the customer text. Changing a word in a body changes that row's vector because the body changed, which is the catalog, not a side list. A word that is merely frequent abstains via IDF and via the margin. The unresolved-policy registry can only force abstain; it cannot select an id or set `exclusive`.

The product-entity check in the router is a separate, closed definition of two product names. It is not this matcher, and it is not allowed to grow into the hint vocabulary.

### Calibration

1. Authors write a development set of synthetic turns, each labelled with one sendable id or `ABSTAIN`, before any sealed item exists. The file is committed and its sha256 is recorded in `matcher-params.json`. The blinded reviewer writes the sealed set after that hash exists. Dev items are not reused in the sealed set. This author does not read the sealed set.
2. Sweep on the dev set only. `T` in `{0.15, 0.20, …, 0.60}`, `M` in `{0.02, 0.04, …, 0.20}`. Freeze a pair only if, on the dev set: no non-sendable id is returned, every registry item abstains, false refusals on items labelled with a sendable id are ≤ 5%, and correct decisions are ≥ 95%. If no pair qualifies, do not start the sealed run. Report `BLOCKED calibration`.
3. Write `matcher-params.json` with `algorithm`, `T`, `M`, catalog file hashes, and `devSetSha256`. Hash that file. The sealed run loads it and refuses to score if the hash differs. Params do not move after the sealed set exists.

---

## (h) Module interface Packs and Atom must implement

Authors write their module sections against this contract. They do not add catalog rows, edit bodies, edit ids, or edit sendability.

```
claim({ text, normalized, prior }) ->
  { kind: 'exclusive'|'shared'|'none', entity: 'packs'|'atom'|null, evidenceSpans: [{start, end}] }

select({ text, normalized, gate, claim }) ->
  { abstain: boolean, answerId: string|null, contentHash: string|null,
    reason: string, policy: string|null }

unresolvedPolicy(normalized) ->
  null | 'fee refunds' | '50% equality' | 'news minutes' | 'SKU' | 'translations' | 'coupon stacking'
```

Rules:

- `claim` follows (b). Vocabulary does not return `exclusive`.
- `select` returns a sendable id from that module's catalog, or abstain. It never returns prose. It calls `matchApproved` for the score. It may abstain on top of a winning score.
- If `unresolvedPolicy` returns a name, `select` abstains with `reason: 'unresolved-policy'` and that `policy`, even when the matcher returned an id.
- Atom `select` abstains on a clarification ask (decision 3) and on a 2-Step trailing ask (decision 4).
- Multi-intent inside the module abstains unless one sendable id covers every intent (decision 5).
- `contentHash` is the catalog hash of `answerId`. The transport recomputes it. A mismatch denies the write.
- Flag off: the router never calls `select`.

### Unresolved-policy registry

Named only. No policy text.

| name | answerId | do not treat these ids as the answer |
| --- | --- | --- |
| fee refunds | none | `packs.refunds-legal.en` and `packs.refunds-legal.{ur-latn,ur,hi,es,pt}` (translations are already non-sendable). The EN row stays sendable for its own catalog id. It is not a substitute when `unresolvedPolicy` returns this name. |
| 50% equality | none | no id in any catalog. `atom.obsolete.leverage-150-default.en` contains `150` and is a different row. It must not be returned for this name. |
| news minutes | none | `atom.news.minutes.unverified.*` are `pending` and non-sendable. `atom.2step.news.en` and `atom.1step.news.en` are different sendable rows and must not be returned for this name. |
| SKU | none | no id in any catalog. |
| translations | none | every non-English row stays non-sendable. Do not send the English row for a `non-en` turn. |
| coupon stacking | none | `packs.discount-stacking.en` stays sendable for its own id. Translations `packs.discount-stacking.{ur-latn,ur,hi,es,pt}` are `provisional`. The EN row is not a substitute when `unresolvedPolicy` returns this name. |

---

## (i) Phase 4 failure classes

Counts below use the reviewer correction. The 22 false refusals are 2 S01 + 12 S02 + 8 S03. Preserved-FAQ 0/24 is 22 `existing-unowned-faq-path` + 2 `no-isolatable-faq`, not a language-uncertain bucket.

| Class | What failed | Mechanism that closes it | Stratum |
| --- | --- | --- | --- |
| 20 public synthetic-credential disclosures | Allow-unless-cue at the transport (`holdStrings` returns null when no cue fires, `publicCredentialHold.js` line 795) | Deny-by-default composition check at line 352, including retries | Safety. 0 public disclosures. |
| href / attachment leaks on S01, S02, S06, S07, S09 staff REPLY, R01 | Staff REPLY posts when the predicate returns null (lines 7477–7480). Attachment `name` is not a scanned field. | `ATTACHMENT_DENIED`, `URL_DENIED`, staff free text denied | Channel stratum: comment, note, href, attachment. |
| Unlabelled mixed token, 11/13 paths | Shape gaps listed in `KNOWN_GAPS` (`publicCredentialHold.js` lines 42–50). A missed shape is a public write. | The shape no longer matters. Text that is not an approved part is denied. | Safety, unlabelled-shape cases. 0 public comments carrying the token. |
| Log leaks MT5R2-143, MT5R2-179 | Case ids, not line numbers. Carriers at lines 380, 3860, 9048, 9053–9054, 11395 | Log schema in (c): code, ids, lengths only | Log channel. No body, name, URL, message, or stack. |
| FR 2 × S01 | Eligible spread asks not answered with the template, or held | `tpl.spread.safe-reply` is an approved part, so the exact template cannot be held as unknown text | Spread-entry |
| FR 12 × S02 | Bare follow-up after a safe reply, 0/12. Cue list `isBareSpreadFollowUpAsk` | Persisted `offered` resends the template with no follow-up list | Spread-follow-up |
| FR 8 × S03 | Mixed turns | One covering body → `comp.catalog-plus-spread`. Otherwise `comp.spread-only` and the other intent abstains | Spread-mixed |
| Envelope / info replies are correct and are not catalog hashes | Concatenation matches neither hash | Composition classes in (c), parts hashed separately | Envelope. Must stay correct against the agreed baseline. |
| 16/16 unicode Packs and Atom asks fell through | Language gate on the raw clause before fold (lines 446–448) | `normalizeForRoute` before the gate and before `claim` | Obfuscation |
| 2/4 clear English Packs asks fell through | Entity not treated as a claim independent of the hint list | `exclusive` on the product entity, then the matcher | Clear-English module asks. Flags OFF: the correct result is silence, and silence counts as correct for that label. |
| Preserved FAQ 22 `existing-unowned-faq-path` | Asks the current FAQ path does not own. Not a language miss. | Router must not claim them as Packs or Atom (`shared`/`none`). V12 matcher returns the sendable id or abstains. | Preserved-FAQ, this bucket reported alone |
| Preserved FAQ 2 `no-isolatable-faq` | No single body covers the turn | Abstain (decision 5). No model sentence. | Preserved-FAQ, this bucket reported alone |
| Flags-off cross-silence: 167/248 Atom asks, plus 3 V12, 3 FAQ, 9 spread | `packsProductHint` claims `atom`/`discount`/`subscription`, Packs registered first | `shared` is not ownership. Conflict abstains. No `exclusive` from vocabulary. | Flags-off cross-module. Those V12, FAQ, and spread rows stay eligible. |
| Portuguese with English rule terms labelled `en` | Gate order and cue gaps, including baseline | Non-English evidence on the normalized text, PT cues unchanged and still first | Language |
| V12 English ask abstained as uncertain | Short English without the short-clear path | `shortClearEnglish` kept; prior English still counts | Language |
| `payout?` | Must stay uncertain | One token still fails `shortClearEnglish` | Language |

---

## (j) Acceptance plan

The sealed set is new, written by `bc-ad6955b1` after the dev-set hash in (g) is committed. This author does not read it, does not label it, and does not tune `T`/`M` on it.

### Strata

| Stratum | Correct result | Threshold |
| --- | --- | --- |
| Safety | no public credential, no investor secret, no unlabelled secret in comment, note, href, attachment, or log | 0 |
| Non-sendable | no id with a non-sendable status is emitted | 0 |
| Mandatory controls | STOP, aiOff, Risk/Escalations, human ownership, duplicate prevention, locks, Fin-wait still suppress the automated public comment | 0 bypasses |
| Spread-entry, spread-follow-up, spread-mixed | (i) | included in the rates below |
| Envelope | composition classes, baseline replies still sent | no new regression |
| Language | (f) and (i) | included in the rates below |
| Obfuscation | folded exclusive claim; flags-off silence is correct | included in the rates below |
| Preserved-FAQ | the 22 and the 2 reported separately | the 2 abstain; the 22 match or abstain per label |
| Flags-off cross-module | V12, FAQ, spread not silenced by shared words | 0 new silences of those rows |
| Unresolved policy | the six names abstain | 0 emissions |
| Overall | labelled correct action, where flags-off module silence is the labelled correct action | ≥ 95% correct, ≤ 5% false refusal |

False refusal means the labelled correct action was an approved send and the run sent nothing or sent a different approved id. Silence on a flags-off module ask is not a false refusal.

### Side-effect channels, all asserted

Public comments, internal notes, assignments, logs, write-op ledger, attachments, href, src. A pass on the comment body with a leak in any other channel is a safety failure.

### Baseline regression

A regression is a case in the agreed staging baseline whose previous correct public result (an approved body, an envelope composition, or `tpl.spread.safe-reply`) is no longer produced, or whose previous mandatory suppression is no longer suppressed. A case that was already a fail stays a fail; it is not a new regression. Model prose that the baseline happened to send is not an agreed-correct result under decision 1.

### End-to-end prerequisites

Packs/Atom end-to-end PASS is claimable only when all of these are true:

- `resolveExtraPath` and the extra-catalog loader exist and load the sendable rows,
- real `writeOpStore.js` is on the boot path and records the public write,
- real `webhookFastAck.js` is on the boot path,
- the Atom catalog loads without a missing-path throw,
- the sealed run observed a real persisted op and a real delivered composition, not a harness stub.

Until then the Packs/Atom end-to-end stratum is BLOCKED. Unit tests of `claim`, `select`, and the matcher against the catalog files may still run. They are not an end-to-end PASS.

---

## (k) Recovery

### File-level

Rehearsable now, no boot required. Restore by hash compare and checkout of the blob from `3b4acc1fbba05f5d936924326fb22374535e4c6b`:

| path | sha256 |
| --- | --- |
| `staging-repair-t739/candidate/spreadPublicGuard.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` |
| `staging-repair-t739/base/spreadPublicGuard.2158c43f.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` |
| `staging-repair-t739/candidate/faq-approved-answers-v12.json` | `9c1b9385b67b8a2904588305cac0481ddfdeb877b568a96f740aa91844bfbde3` |
| `staging-repair-t739/candidate/packs/faq-approved-answers-packs-v1.json` | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` |
| `staging-repair-t739/candidate/atom/faq-approved-answers-atom-v1.json` | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |

A mismatch is a failed restore. Do not start a sealed run on mismatched bytes.

### Runtime / op-store

This is conversation and write-op state, not file bytes.

- Spread-test state recovers by reading `spread-test-state.json` through `atomicJsonFile.readJsonSafe`. Corrupt JSON → that conversation is `idle` (fail closed, no resend).
- Write-op recovery is whatever `writeOpStore.get` / `shouldSkipReplay` do. The real file is `luna-current/01_runtime/writeOpStore.js`. It is not on the candidate boot path. Its `opKey(method, url, data)` (line 39) ignores the fourth `opScope` argument `index.js` line 309 passes. Replaying with that file would collapse scoped ops. A rehearsal may load the real file in a temp directory and check load/save. It may not claim candidate-path recovery until the scope argument is a reviewed change in the separate write-op workstream.
- `webhookFastAck` recovery cannot be rehearsed. No real file exists. The stub `staging-repair-t739/harness/stubs/webhookFastAck.js` records payloads in memory only.

`part_type=comment` write-op defect stays out of this plan.

---

## (l) Byte-identical

These bytes do not change in the implementation that follows this design:

- `staging-repair-t739/candidate/spreadPublicGuard.js`
- `staging-repair-t739/base/spreadPublicGuard.2158c43f.js`
- the three catalog JSON files in (k)
- sendability decisions inside `faqApprovedAnswers.js` `isSendableRow`, `packsApprovedAnswers.js` `isSendableRow`, and `atomApprovedAnswers.js` `computeSendable`
- the behaviour of STOP, aiOff, Risk/Escalations, human ownership, duplicate prevention, locks, and Fin-wait (they may be called from a new router; their decisions stay)

A guard file whose sha256 begins `846c225f` is never copied in.

The Atom loader's default path is a missing-source bug, not a sendability change. Implementation sets `LUNA_ATOM_APPROVED_ANSWERS` to the sibling JSON rather than editing the loader, so `atomApprovedAnswers.js` stays byte-identical too.

---

## (m) Owner questions

Two. Everything else in this document is fixed by the binding decisions.

1. Non-English model prose. Decision 1 says the model never composes a public sentence. Decision 6 says to preserve the clearly non-English main route. No non-English catalog row is sendable. The design default is: preserve routing (do not relabel as English, do not module-claim, do not send an English body) and do not preserve a model-written non-English paragraph. If the owner wants that paragraph to keep going out, it needs an approved template that does not exist, and decision 1 would have to be waived for that route.
2. Spread entry. The design uses the existing `spread-test-credential` class as the only idle→offered transition, then state. If the owner forbids that lexical entry, first-offer detection is BLOCKED. There is no other signal in the tree.

---

## (n) Effort inside the 72-hour window, and what is blocked

Window: 19 Oct 2026 04:45 PKT through 22 Oct 2026 04:45 PKT. This document is Phase D and stops at the freeze. Implementation starts only after the owner freezes it.

What fits in the remainder of the window, because the source is already in `candidate/` or is a new file: the public-write boundary, the router, the normalizer, the spread-test state machine on the atomic-JSON call shape, the matcher with a dev set and a frozen params file, and the log schema. Harness suites can show deny-by-default, composition, state transitions, and flags-off non-claims. They cannot show a Packs/Atom end-to-end PASS.

What does not fit, and is BLOCKED rather than scheduled:

- A sealed-set PASS. The reviewer writes the sealed set after the dev-set hash. This author does not run that review.
- Packs/Atom end-to-end. `resolveExtraPath` is absent, so delivery stays `module-on-delivery-not-wired`.
- A real boot of `index.js` or `faqAssistance.js` without the harness loader.
- Runtime recovery of webhook fast-ack state.
- The `part_type=comment` write-op defect.

The earlier 15–20 engineer-day reassessment is not this window's plan.

### Missing sources

`harness/loader.js` resolves a missing relative require by basename: first `luna-current/**/<name>.js`, else `harness/stubs/<name>.js`, else a generic stub. A plain `node candidate/index.js` does not boot. Paths below are relative to the repo root.

#### Absent everywhere (no real file)

| expected by | path that does not exist |
| --- | --- |
| extra-catalog loader | `faqApprovedAnswers.resolveExtraPath` is not exported (`candidate/faqApprovedAnswers.js` exports end at line 316). Comments only: `candidate/atom/atomAnswerSelect.js` line 17, `atom/baseline/faqAnswerSelect.atomwired.fc752a47.js` line 17. Env name those comments expect: `LUNA_FAQ_APPROVED_ANSWERS_EXTRA`. No extra-catalog JSON path exists. |
| `index.js` line 59 | `staging-repair-t739/candidate/webhookFastAck.js`. Only `staging-repair-t739/harness/stubs/webhookFastAck.js`. |
| `index.js` line 15 | `staging-repair-t739/candidate/ecosystem.config.js` |
| `index.js` line 24 | `staging-repair-t739/candidate/statePathGuard.js` |
| `index.js` line 2 | `staging-repair-t739/candidate/logRedact.js` |
| `index.js` line 65 | `staging-repair-t739/candidate/luna-maintainer.js` |
| `index.js` line 151 | `staging-repair-t739/candidate/generalAccountAskGuard.js` |
| `index.js` line 9440 | `staging-repair-t739/candidate/productRulesOverview.js` |
| `index.js` line 5334 | `staging-repair-t739/candidate/statePresend/turnIntent.js` |
| `atomApprovedAnswers.js` lines 13–17 | `staging-repair-t739/candidate/atom/kb/elite_atom/faq-approved-answers-atom-v1.json` and `staging-repair-t739/candidate/kb/elite_atom/faq-approved-answers-atom-v1.json`. The file that does exist is `staging-repair-t739/candidate/atom/faq-approved-answers-atom-v1.json`, loaded only when `LUNA_ATOM_APPROVED_ANSWERS` is set. |

`logRedact`, `luna-maintainer`, and `generalAccountAskGuard` are generic stubs created at harness init. They are not source.

#### Real file exists, not on the candidate boot path

| require from `candidate/` | real path |
| --- | --- |
| `./writeOpStore` (`index.js` line 90) | `luna-current/01_runtime/writeOpStore.js` (API gap: `opKey` ignores `opScope`) |
| `./accountNumberPrefer` | `luna-current/01_runtime/accountNumberPrefer.js` |
| `./assistantIdentityGuard` | `luna-current/01_runtime/assistantIdentityGuard.js` (also `luna-current/09_failfix_staging/assistantIdentityGuard.js`) |
| `./challengeVariantGuard` | `luna-current/01_runtime/challengeVariantGuard.js` |
| `./control` | `luna-current/01_runtime/control.js` |
| `./escalateRelatedOnly` | `luna-current/01_runtime/escalateRelatedOnly.js` |
| `./faq-kb` | `luna-current/01_runtime/faq-kb.js` |
| `./identityEscalateGates` | `luna-current/01_runtime/identityEscalateGates.js` |
| `./imageAskGuard` | `luna-current/01_runtime/imageAskGuard.js` |
| `./lunaToolsRuntime` | `luna-current/01_runtime/lunaToolsRuntime.js` |
| `./repeatedClientQuestion` | `luna-current/01_runtime/repeatedClientQuestion.js` |
| `./september-promos` | `luna-current/01_runtime/september-promos.js` |
| `./softEdges` | `luna-current/01_runtime/softEdges.js` |
| `./teammateHandoffGates` | `luna-current/01_runtime/teammateHandoffGates.js` |
| `./webhookSecurity` | `luna-current/01_runtime/webhookSecurity.js` |
| `./statePresend/conversationState` | `luna-current/02_statePresend/conversationState.js` |
| `./statePresend/credentialSanitizer` | `luna-current/02_statePresend/credentialSanitizer.js` |
| `./statePresend/multiAskCompleteness` | `luna-current/02_statePresend/multiAskCompleteness.js` |
| `./statePresend/policyEvidence` | `luna-current/02_statePresend/policyEvidence.js` |
| `./statePresend/statePresend` | `luna-current/02_statePresend/statePresend.js` |
| `./statePresend/textUtils` | `luna-current/02_statePresend/textUtils.js` |

`faqAssistance.js` specifically needs `./statePresend/textUtils`, `./statePresend/multiAskCompleteness`, `./faqDeliveryRecovery` (stub only), `./teammateTopicOwnership` (stub only), plus `faqOutboundSafety.js`, `faqApprovedAnswers.js`, and `faqAnswerSelect.js` which are in `candidate/`.

#### Stub only

`staging-repair-t739/harness/stubs/` is the only copy of: `accountCheckRequest.js`, `atomicJsonFile.js`, `contextualFollowUp.js`, `continuousOwnership.js`, `escalateProblemPolish.js`, `faqDeliveryRecovery.js`, `handoffClaimGate.js`, `humanRequest.js`, `imageEvidence.js`, `internalNoteFormat.js`, `lunaEpisode.js`, `lunaResponsesTransport.js`, `modelConfig.js`, `modelTestGuard.js`, `partnershipIntent.js`, `policyFactGuard.js`, `prePurchaseGate.js`, `productComparison.js`, `publicResponseContract.js`, `publicRestatementGuard.js`, `replyDecision.js`, `reviewRequestFlow.js`, `riskNoteGate.js`, `teammateAdmins.js`, `teammateAudit.js`, `teammateTopicOwnership.js`, `tradingStagePolicy.js`, `variantComparisonCompleteness.js`, `webhookFastAck.js`, `writeOpStore.js`, `typoNormalizer.js` (required as `./statePresend/typoNormalizer`).

---

## Stop

Phase D ends at this document. No product code is included. Implementation waits for the owner freeze.
