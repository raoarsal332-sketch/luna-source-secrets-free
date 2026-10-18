# INTERFACE_REQUEST — Elite Packs KB on FAQ V12 (staging)

**Date:** 2026-10-17 (updated t728 deny-by-default ownership gate)  
**To:** FAQ V12 agent / owner  
**From:** Elite Packs deny-default staging module (`staging-elite-packs-deny-default-20261017`)  
**Constraint:** Do **not** edit V12 core files from the Packs workstream. This file requests a minimal hook only.  
**Customer-facing Packs remains disabled in production** until independent PASS with 0 CRITICAL ownership leaks + owner D1–D3 + this hook.

## Deny-by-default pre-gate (required if/when hooked)

Any future FAQ/Packs routing **must** call `evaluateOwnershipPregate` (`packsOwnershipPregate.js`) **before** every selector, shortcut, and ML fallback. Default invert: any first-person / possessive / implicit-subject stance (any language/script) together with a Packs item or account-status term → refuse, unless the message is unambiguously a general product-information question (positive structure allow-list). Missing / uncertain / thrown gate → fail-closed. Product select is permitted only when `productSelectPermitted(gate) === true`. Never substitute a product FAQ for an unresolved personal question. This candidate does **not** attach the shared V12 `kb/elite_packs` symlink.

The prior Option-1 tree (`staging-elite-packs-pregate-20261017`) is preserved and was not edited.

## Dependency on V12 final

This thin hook is **dependent on V12 final**. Packs must not patch V12 core while V12 fix attempt 1 (and ownership fixture `215476300195795`) is in progress. Staging may keep the `kb/elite_packs` symlink + local adapters only. Production attach / `LUNA_FAQ_APPROVED_ANSWERS_EXTRA` wiring waits until:

1. V12 candidate is ownership-clean and independently certified, and  
2. Owner accepts this INTERFACE_REQUEST against that final V12 surface.

## What Packs needs (thin)

1. **Load path** — Allow an optional additional approved-answer file, e.g.  
   `LUNA_FAQ_APPROVED_ANSWERS_EXTRA=/home/ubuntu/staging-elite-packs-20261017/kb/elite_packs/faq-approved-answers-packs-v1.json`  
   or merge ordered catalogs where **Packs ids win** over generic FAQ ids when the ask is Elite Packs-scoped.  
   Only **sendable** Packs rows (`approval: source-verified`) may enter the delivery allowlist; `pending` / `needs_owner_decision` / `provisional` must fail closed.

2. **Product hint** — Extend `productHint()` (or accept an injected hint function) so that  
   `/elite\s*packs?|pack\s*credits?|ignition|oracle\s*pack|whale\s*pack|the\s*million|pack\s*pass|lucky\s*streak|instant\s*override|primordial/`  
   maps to `elite-packs`. Without this, Packs asks may fall into generic challenge FAQ answers.

3. **Precedence** — When the ask is Packs-scoped, Packs `answer_id`s beat older generic Help Center slogans. Fail closed if the Packs catalog has no exact id. Keep **Elite Atom** same-order bundle answers distinct.

4. **Translations** — Unverified translations stay non-sendable; EN `source-verified` fallback is the production path (D3).

5. **Intent-class safety** — Consult the deny-by-default pre-gate first. Personal eligibility / balance / ownership / payout-KYC → refuse; refund / missing-item → their dedicated answers; never a general product FAQ. Every downstream selector must honor `productSelectPermitted(gate)`.

6. **No architecture fork** — Packs reuses `faqApprovedAnswers` allowlist equality + `faqAnswerSelect` classify/select-only. No free-text FAQ composition.

## What Packs ships without the hook

- Versioned KB set at `staging-faq-v12-20261017/kb/elite_packs` (symlink → original Packs module, **not** this deny-default tree).
- Thin local adapter: `packsApprovedAnswers.js` + `packsAnswerSelect.js` + `packsOwnershipPregate.js`.
- Release-package `preflight.sh` / `install.sh` / `rollback.sh` (staging symlink only; refuse production).
- Staging tests offline.

## Explicit non-requests

- No production install, PM2 restart, Intercom writes, knowledge promotion, Decisions Shadow, or K3/nginx changes.
- No edits to MT5 spread-test staging tree, V12 core files, or Elite Atom staging tree.
