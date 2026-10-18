# Elite Atom selector — interface (t739, STAGING, isolated)

Status: candidate, **not verified by an independent reviewer**. Atom is **OFF by default**.
Nothing in this module is wired into `index.js`, `faqAssistance.js` or `faqAnswerSelect.js`.

## Entry point

```js
const { selectAtomAnswer } = require('./atomAnswerSelect');
const result = await selectAtomAnswer(text, opts);   // never throws; fails closed
```

`text` must be a string (anything else -> `abstain: invalid-input`).

### `opts`

| key | required | meaning |
|---|---|---|
| `enabled` | yes, to run | `true` turns the selector on. Default OFF. `LUNA_ATOM_SELECTOR_ENABLED=1` is the only env equivalent (isolated test config only). `enabled:false` always wins. |
| `languageGate` | yes | Result of the **shared** language gate. **Absent -> `abstain: language-gate-missing`** (fail closed). Accepted shapes (ASSUMED, see AS-3): the string `'en'`, or an object whose `lang` / `language` / `code` / `detected` is `en` or `en-*`, with none of `ok:false`, `allowed:false`, `pass:false`, `supported:false`, `confident:false`, `reliable:false`, `blocked:true`, `abstain:true`, `mixed:true`, `multilingual:true`, or a `status` starting `unknown/unsupported/blocked/mixed/abstain/fail`. |
| `priorClientTexts` | no | Earlier CUSTOMER messages, oldest first (last 6 used). Used for Atom scope, product, and for inheriting a deny class into a follow-up. |
| `paused` `aiOff` `stop` `finWait` `protectedTeam` | no | Existing gates; any truthy -> abstain with the matching reason (`global-pause`, `aiOff`, `STOP`, `fin-wait`, `protected-team-silence`). |
| `requireOwnerApproved` | no | Legacy flag, kept. All rows are `source-verified`, so it passes for them. |
| `debug` | no | `true` adds customer-derived tokens (`residual`) to `diagnostics`. Default: they are stripped. |
| `langHint` | ignored | A hint is **not** a gate. English-only: non-English text abstains even when the hint says `en`. |

The local English check only **narrows**: if the gate says `en` but the text is not English the result is `abstain: non-english`.

### Result

Answer:

```js
{ abstain:false, action:'answer', answerId, confidence, reason, lang:'en',
  contentHash, intentTags, status, approval, sendable:true,
  frame:{ name, relationship, product, qualifiers:[...] } }
```

Not-an-answer (never carries `answerId`):

```js
{ abstain:true, action:'abstain'|'clarify'|'handoff', reason, failClosed:true, lang:'en', sendable:false,
  handoff?:true, handoffAnswerId?:'atom.handoff.unverified.en', clarify?:{slot}, diagnostics? }
```

* `action:'clarify'` -> a slot is missing (`product`, `monetary-referent`, `amount`, `qualifier`). **No approved clarification text exists**, so the caller must either route to a human or add an owner-approved clarification row. The selector never composes text.
* `action:'handoff'` -> a known-unresolved topic. `handoffAnswerId` is a *suggestion* naming the existing approved `atom.handoff.unverified.en`; the caller decides whether to send it. It is never returned as `answerId`.
* The caller (`faqAnswerSelect.atomwired`) copies `answerId` out of abstain results; this module guarantees there is none.

### Reason codes (stable)

`atom-off`, `empty`, `invalid-input`, `global-pause`, `aiOff`, `STOP`, `fin-wait`, `protected-team-silence`,
`language-gate-missing|malformed|not-english|not-confident`, `ask-too-long`, `non-english`, `not-atom-scope`,
`atom-fee-policy-owner-decision` (and `inherited:` + any fee/money reason), `monetary-referent-unresolved`,
`unresolved:consistency-equality|news-minutes|checkout-sku-selection|coupon-stacking|translation`,
`multi-intent-not-covered`, `multi-product-not-covered`, `product-required`, `unrecognized-qualifier`,
`amount-ambiguous-with-price`, `qualifier-not-covered:<q>`, `money-referent-in-rule-ask`,
`no-exact-approved-answer`, `scope-narrowed:*`, `non-sendable-status-fail-closed`, `needs-owner-approval`,
`selector-error-fail-closed`, plus the boundary answer reason `account-status-boundary`.

## Resolution order (what changed)

1. Gates: OFF default, pause/stop, shared language gate, length cap, local English check, Atom scope.
2. Resolve **monetary referent** (fee paid / list price / payout / profit), then **relationship**
   (recovery, split, timing, cap, cost, options, discount), then **conditions** (product, payout ordinal,
   amounts, sizes, percents, purchased options). All of this happens before any answer is ranked.
3. **Deny classes with no approved row** abstain: fee recovery (explicit or disguised), a fee/price word or price-point
   amount combined with a payout stage, a customer's own spend plus any money relation, money + transfer verb with no
   resolved referent.
4. **Account-specific** asks -> `atom.account-status.refuse.en`, only if every substantive word is inside the boundary vocabulary.
   A published payout schedule (first wait, interval, cap, how often) is not an account lookup. Personal status
   (KYC, breach, approval, "did I pass", "when will my payout arrive") still refuses.
5. Exactly one **frame** must match (`split`, `payout`, `price`, `checkout`, `bundle`, or a non-money `rule` topic).
   Overlaps resolved on purpose: split+checkout->split, checkout+payout->checkout, bundle+price->bundle when the
   ask is the discount, leverage+the word checkout->the leverage row (that row states the checkout choice),
   funded profitable-days+a payout mention->the profitable-days row. Anything else is `multi-intent-not-covered`.
6. Money frames must match a **closed vocabulary**. Neutral discourse and request words (explain, tell me, details,
   understand, specifically, allowed, happen, and the same stems) do not change the proposition and are not
   `unrecognized-qualifier`. A substantive unknown word is: an amount or condition the row does not cover, another
   product, or an unsupported policy. Absence of risk tokens is never treated as safety.
7. The row is picked, then **narrowed** by `atomAnswerScope.js` (frame, product, qualifiers the row actually covers),
   then re-verified against the KB (`sendable`, `contentHash`). The KB JSON is the only source of bodies, ids,
   approval and sendability.

### Mapping used (existing ids only; all verified present in `faq-approved-answers-atom-v1.json`)

| ask resolves to | answer |
|---|---|
| split, product named | `atom.1step.reward.en` / `atom.2step.reward.en` |
| split, no product, **"default"** asked | `atom.payouts.general.en` (body states default 80% unless purchased config differs; same default in both reward rows) |
| split, no product, anything else | clarify `product` |
| payout timing / cap / first-withdrawal cap / rules | `atom.payouts.general.en` (there is no separate payout-cap id; `atom.obsolete.first-payout-14.en` for "first payout ... 14 days") |
| trailing drawdown, including how it locks, even with no product named | `atom.1step.max-loss.en` (only trailing row; a reviewer label `atom.trailing-drawdown.en` is not a catalog id) |
| static max loss, no product named | `atom.2step.max-loss.en` |
| max loss with neither trailing nor static, no product | clarify `product` |
| consistency formula | `atom.1step.consistency.en` / `atom.2step.consistency.en` (no separate consistency-rule id). Equality at 50% still handoffs |
| profit targets / phases | the product phases row (no separate scaling id). No product -> clarify `product` |
| no-product time limit or minimum trading days | `atom.overview.en` (the body states both products: no minimum trading days, no time limit) |
| funded profitable days, no product | clarify `product` (only Atom 1-Step has them) |
| list price / sizes | `atom.prices.list.en` (`atom.obsolete.price-161-permanent.en`, `atom.obsolete.sizes-5k-10k.en` for those figures) |
| checkout options / add-ons | `atom.checkout.options.en` |
| multi-account discount / pack credits | `atom.bundles.en` |
| account-specific | `atom.account-status.refuse.en` |
| challenge-fee refund / return / recovery | **no row -> abstain** (`atom-fee-policy-owner-decision`) |
| equality, news-minute calc, SKU selection, translation, coupon stacking | unresolved -> handoff suggestion, never answered |
| no-product leverage (default asked) | `atom.obsolete.leverage-150-default.en` (product-neutral: default 1:30) |

Price and general-payout answers are never used as a refund answer: a fee/price word or price-point amount together
with a payout stage abstains, and the price frame forbids payout/ordinal/transfer words.

## Files

* `atomAnswerSelect.js` — selector (this interface)
* `atomMoneyFrame.js` — normalisation, language-gate reader, slot extraction, evidence
* `atomAnswerScope.js` — scope sidecar (narrowing only); `validateAgainstKb()`
* `atomApprovedAnswers.js`, `faq-approved-answers-atom-v1.json` — **byte-identical** to the inventory copies
* `baseline/` — frozen originals for comparison only (not loaded by the selector)
* `tests/` — author suite (see `REPORT_T739_ATOM.md`)

## Integration: BLOCKED (not implemented, not guessed)

The Atom-tree `faqApprovedAnswers.js` that contains/resolves `resolveExtraPath` is **missing** (requested from owner).
Until it is supplied, this module only guarantees the selector contract above. See `REPORT_T739_ATOM.md` section 6.
