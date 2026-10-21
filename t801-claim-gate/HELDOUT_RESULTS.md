# T801 held-out results

The gate was frozen before this set was scored. This file is the first and only evaluation. The detector was not edited afterward.

## How the sets were split

- **Dev set** (`dev_set.js`, 91 positives / 87 negatives) was used while building the rule. `test_dev_set.js` locks it. All 178 dev checks pass.
- **Existing T795 tests** (`test_t795_claim_gate.js`) were not edited. 122/122 pass.
- **Held-out set** (`heldout_set.js`) was written after that freeze. Sentences do not repeat the dev set or the T795 fixtures. It was not used to change the rule.

A claim is a human/team noun, a handoff verb, and a commitment (future, progressive, perfect, "let me" / "allow me", "going to", "right away" / "now"), in one clause. Negation, offers, questions, "if you…" conditionals, quoted or reported speech, and third-party document futures (for example "the team will update the FAQ") are not claims.

## Held-out figures

| | Count |
| --- | ---: |
| Positives | 72 |
| Caught | 69 |
| Missed | 3 |
| **Recall** | **69/72 = 95.8%** |
| Negatives | 68 |
| False positives (over-block) | 0 |
| **Over-block** | **0/68 = 0%** |

Precision on this set is 69/69 = 100%. No negative was blocked.

### By language

| Language | Recall | Over-block |
| --- | ---: | ---: |
| English | 22/22 | 0/26 |
| Roman Urdu | 9/10 | 0/8 |
| Urdu | 10/10 | 0/8 |
| Hindi | 9/10 | 0/8 |
| Arabic | 10/10 | 0/8 |
| French | 9/10 | 0/10 |

## Misses (not patched)

1. **Roman Urdu.** "Hum aapke ticket ko abhi specialist ki taraf forward karenge." Commitment and the verb are present. "specialist" is in the English human-noun class and not in the Roman Urdu class.
2. **Hindi.** "स्टाफ मेंबर आपसे अभी मिलेगा।" "मिलेगा" is a future of मिलना that the Hindi verb and commitment paradigms do not list (`मिला` / `होगा` / `करेगा` are).
3. **French.** "Je mets votre dossier en relation avec l'équipe." The handoff idiom is `mettre en relation`, and `votre dossier` sits between `mets` and `en relation`, so the verb is not contiguous.

## Over-blocks

None.
