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
4. **Account-specific** asks -> `atom.account-status.refuse.en`. A published payout schedule (first wait, interval,
   cap, how often) is not an account lookup. Personal status (KYC, breach, approval, "did I pass" with the verb
   next to the pronoun, "when will my payout arrive", "my situation", "my trailing drawdown") still refuses.
   "For a friend" and "my own accounts" on the copier row do not.
5. Exactly one **frame** must match (`split`, `payout`, `price`, `checkout`, `bundle`, or a non-money `rule` topic).
   The match is the proposition: topic + product + condition. Unknown words that do not name another topic, product,
   money relation, or unresolved policy are neutral. They do not clarify `unrecognized-qualifier` (that code is no
   longer emitted). Overlaps resolved on purpose: split+checkout->split, checkout+payout->checkout,
   bundle+price->bundle when the ask is the discount, leverage+checkout wording without an add-on->the leverage row,
   a rule topic plus an incidental payout mention (no cap, no strong timing word)->the rule row.
   Two rule topics that resolve to the same single id are that id. Two different propositions
   (split and daily loss, split and payout timing) stay `multi-intent-not-covered`.
6. Scope still narrows. A calc, an add-on price, a real policy change, another product, and the D1–D6 unresolved
   policies still abstain or hand off. Absence of risk tokens is never treated as safety. Overview is only a pure
   "what is Atom" proposition: a payout, amount, size, percent, or ratio is not overview, and a personal or
   unsupported ask does not fall through to `atom.overview.en`.
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
| Atom 1-Step minimum trading days or time limit, including a funded mention without "profitable" | `atom.1step.min-days.en` |
| profitable days or 0.5% on Atom 1-Step | `atom.1step.funded-profitable-days.en`, unless the ask is about the evaluation and does not say funded (then `atom.1step.min-days.en`, because the evaluation has no profitable-day rule) |
| funded profitable days, no product | clarify `product` (only Atom 1-Step has them) |
| 1:150, 150:1, or 150 next to leverage, including when 2-Step is named | `atom.obsolete.leverage-150-default.en` (sendable; body says the default is 1:30, and 1:50 or 1:100 is a 2-Step checkout option, not a universal 1:150) |
| choosing 1:50 or 1:100 on 2-Step | `atom.2step.leverage.en` |
| explicit Atom 2-Step trailing drawdown | `atom.2step.max-loss.en` (the body says the loss is 10% static and the floor never moves; that is the catalog answer to the trailing premise) |
| list price / sizes, including 7K | `atom.prices.list.en` (body lists 7K $19/$29; `atom.obsolete.price-161-permanent.en`, `atom.obsolete.sizes-5k-10k.en` for those figures) |
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
* `tests/` — author (tuning) suite and a frozen held-out file that is not part of that suite (`REMEDIATION_R2_NOTES.md`)

## Integration: BLOCKED (not implemented, not guessed)

The Atom-tree `faqApprovedAnswers.js` that contains/resolves `resolveExtraPath` is **missing** (requested from owner).
Until it is supplied, this module only guarantees the selector contract above. See `REPORT_T739_ATOM.md` section 6.
