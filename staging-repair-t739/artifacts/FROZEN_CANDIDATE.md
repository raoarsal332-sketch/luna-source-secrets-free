# FROZEN CANDIDATE

- Candidate id: `t739-initial-integrated-1` (initial integrated candidate: MT5 hold, F1/F2/F4/F5, Packs, Atom)
- Branch: `t739-mt5-shared` (private repo; never merged to main, no PR to main)
- Frozen content commit: `23488aa8daaf049ce146832f789b77e08b63330b`. This file is added by the next commit and nothing else changes after the freeze.
- Manifest: `artifacts/MANIFEST.sha256` (sha256 of the manifest file itself: `145e1394157030cecb46546ee2d88658ea8c77992595cce4e410762f34363447`). It lists the full sha256 of every file in `candidate/`, `base/`, the author sources, `harness/` and `tests/`.
- Author and integration owner: Claude Sonnet 5.5. Author report only, no PASS claim, not independently reviewed.

## Default flag configuration (both OFF)

| module | flag | default | turns ON only with |
|---|---|---|---|
| Elite Packs | `LUNA_PACKS_ENABLED` | unset = OFF | `1`, `true`, `on`, `yes` (case-insensitive) |
| Elite Atom | `LUNA_ATOM_SELECTOR_ENABLED` (the Atom module's own flag) | unset = OFF | `1` |

With both OFF, an unowned English Packs/Atom-specific turn (including a mixed turn with a module-specific English clause) is terminal-silent: no public reply, note, assignment or model call. ON paths exist only in the isolated test configuration and do not deliver (extra-catalog wiring is BLOCKED: `faqApprovedAnswers.js` has no extra-catalog loader and the Atom `resolveExtraPath` file is missing).

## Changed files in this integration cycle (full sha256 in the manifest)

| file | sha256 |
|---|---|
| candidate/faqAnswerSelect.js | f2775787b039a63daae00353d554b42d589d5240874912503de575fde07ed67b |
| candidate/faqAssistance.js | 3151e209f2a33754495b6ddac06ca6aeb5a0a6db18c0d8c4620f1189b77deae9 |
| candidate/faqModuleGates.js | 9d46fe3d520b88d7b92381a08b34d34fcfcbc442cfe98178f173f01f4785a0e8 |
| candidate/faqModuleAdapter.js | 7b19352003b5767cc3842bd85661d46054a195ca61b4d60e216ac14eea3d4642 |
| candidate/faqModuleDetectors.js | 65e697961a418777a377927dffe36a73ab7238fb38c414a63c21ff9cd1966dc6 |
| candidate/packs/packsAnswerSelect.js (byte copy of author file) | c4fc4d5e904c4fc67db6a56b07bfaf6c246c43c2b9cd91baf490cbd6c14caf05 |
| candidate/packs/packsApprovedAnswers.js (byte copy of author file) | 10dd4ef8f5fb9fd1e3a10de0bfce41ec81dde8c8119b987b0b054cbe91847a3d |
| candidate/packs/packsOwnershipPregate.js (byte copy of author file) | 581972fa508aecf1c5f32c8a91ef09c2ec35485efc2b680749ef445fa74dd309 |
| candidate/packs/faq-approved-answers-packs-v1.json (byte copy of author file) | bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318 |
| candidate/atom/atomAnswerSelect.js (byte copy of author file) | e410ee49bf713727346e9c3fc6913814852d3ed235d77cdc59c3532ecb5fb618 |
| candidate/atom/atomMoneyFrame.js (byte copy of author file) | 0e29e7c31826dccd08828ee6eae1efda56b0976976d7ebc2900b0579ed1de0be |
| candidate/atom/atomAnswerScope.js (byte copy of author file) | 16a8d8b0ac11603a1ae2684b261921f838b302a30212b922938c012f0389f406 |
| candidate/atom/atomApprovedAnswers.js (byte copy of author file) | 5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8 |
| candidate/atom/faq-approved-answers-atom-v1.json (byte copy of author file) | df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6 |

Unchanged since the previous freeze: `candidate/index.js` 48899e132ac36a0e62ac242f5f3c47ba1de7ab336d16a61760634044e60225a7, `candidate/publicCredentialHold.js` 152f8f61803e5239ef3d26afdddda196fe64509f7c1e8d6124337130410432a1, `candidate/spreadPublicGuard.js` 2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c (byte-identical to the approved 2158c43f guard; no 846c225f-prefix file exists).

## Reports

`artifacts/INTEGRATION_REPORT.md` (this cycle), `artifacts/FINAL_REPORT.md` (previous cycle, superseded in part), raw outputs in `artifacts/raw/`.
