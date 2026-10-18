# INTERFACE_REQUEST — Elite Atom KB on FAQ V12 (staging)

**Date:** 2026-10-17  
**To:** FAQ V12 agent (`bc-7dfc1617`) / owner  
**From:** Elite Atom staging module (`staging-elite-atom-20261017`)  
**Constraint:** Do **not** edit V12 core files from the Atom workstream. This file requests a minimal hook only.

## What Atom needs (thin)

1. **Load path** — Allow an optional additional approved-answer file, e.g.  
   `LUNA_FAQ_APPROVED_ANSWERS_EXTRA=/home/ubuntu/staging-faq-v12-20261017/kb/elite_atom/faq-approved-answers-atom-v1.json`  
   or merge ordered catalogs where **Atom ids win** over generic FAQ ids when both match for the same Atom-tagged ask.

2. **Product hint** — Extend `productHint()` (or accept an injected hint function) so that `/atom|elite\s*atom/` maps to `atom-2step` / `atom-1step` (with `2-step` / `1-step` disambiguation). Without this, Atom asks fall into generic 1-Step/2-Step Free Retry answers (wrong daily loss / targets).

3. **Precedence** — When the ask is Atom-scoped, Atom `answer_id`s beat older generic Help Center / homepage slogans. Fail closed if the Atom catalog has no exact id.

4. **Translations** — Keep V12 gate: `translationStatus: unverified` not selectable unless `LUNA_FAQ_ALLOW_UNVERIFIED_TRANSLATIONS=1` (staging tests only).

5. **No architecture fork** — Atom reuses `faqApprovedAnswers` allowlist equality + `faqAnswerSelect` classify/select-only. No free-text FAQ composition.

## What Atom ships without the hook

- Versioned KB set at `staging-faq-v12-20261017/kb/elite_atom/` (symlink → this module).
- Thin local adapter: `atomApprovedAnswers.js` + `atomAnswerSelect.js` that mirror V12 APIs against the Atom catalog only.
- Staging tests that exercise Atom select / fail-closed / safety controls offline.

## Explicit non-requests

- No production install, PM2 restart, Intercom writes, knowledge promotion, Decisions Shadow, or K3/nginx changes.
- No edits to MT5 spread-test staging tree.
