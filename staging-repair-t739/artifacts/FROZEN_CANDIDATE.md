# FROZEN CANDIDATE

- Candidate id: `t739-integrated-r1` (remediation cycle 1 of max 2)
- Branch: `t739-mt5-shared` (private repo; never merged to main, no PR to main)
- Frozen content commit: `76e1c9ee8be6aa522818a8905a6d98af21621ac8`. This file is added by the next commit.
- Manifest: `artifacts/MANIFEST.sha256` (sha256 of the manifest file itself: `66322f8011a73a39b3f468c542ecbceef44f1613930171cac079a526fcd266bf`).
- Requested model for this cycle: `claude-sonnet-5-5`. Actual model: `grok-4.7`. The prior run on this same cycle errored on a usage limit and is not a new cycle.
- Author and integration owner report only. No PASS claim. Not independently reviewed.

## Default flag configuration (both OFF)

| module | flag | default | turns ON only with |
|---|---|---|---|
| Elite Packs | `LUNA_PACKS_ENABLED` | unset = OFF | `1`, `true`, `on`, `yes` (case-insensitive) |
| Elite Atom | `LUNA_ATOM_SELECTOR_ENABLED` (the Atom module's own flag) | unset = OFF | `1` |

Atom delivery wiring stays BLOCKED (`resolveExtraPath` is not added; `faqApprovedAnswers.js` has no extra-catalog loader). Packs r1 is not copied in this freeze. The Atom r1 selector copy, if it follows, is a later commit and is not part of this frozen content commit.

## Changed in this cycle (full sha256 in the manifest)

| file | sha256 |
|---|---|
| candidate/index.js | `f1f441fedf40d0a3eb0b4d17e92ec4a1ec420dd5095b1d284346abbc1d100d4e` |
| candidate/publicCredentialHold.js | `17d6abb9c5aade6ea10a8951679209a0c6dac6bcd4aeda46d7d087427d8f6bab` |
| candidate/spreadAskGate.js | `a58a431c652dce6a32eb667d03d44b107f1b1538219a133d6351599b1b880960` |
| candidate/faqAnswerSelect.js | `ecc6bcac8883c259b0c620ba88f391fc32694eba4b4b3b14e896345d2491a8bb` |
| candidate/faqAssistance.js | `231b58c58cd294a0122c1bf8bf91fedf9c0ab8171f8ae23618644e79c15cb004` |

Unchanged and byte-identical to the approved guard: `candidate/spreadPublicGuard.js` `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c`. No file with sha256 prefix `846c225f` is in the tree.

## Report

`artifacts/REMEDIATION_R1_REPORT.md`. Incremental notes: `REMEDIATION_R1_NOTES.md`. Raw counts: `artifacts/raw/`.
