# T807 sealed eval sources

Public FundedElite Help Centre only. Fetched 2026-10-21 from https://faq.fundedelite.com/en/.
No repository code, no secrets, and no customer data were used.
The Intercom account MCP was not used. These pages are the public help centre.

Questions, refusals, and collision cases live only in the jsonl files.
This note lists the articles, the live daily-loss check, and the file hashes.

## Files

- `packs.jsonl` sha256 `c9bfda70047496fb38238c54bc29501db39dcb5ba7072d071b95cbad3afd0535` (240 rows: 191 answer, 32 refuse, 17 clarify)
- `atom.jsonl` sha256 `ebb5b3041b693b37b657351f0b9fffe00585a05eba56b5ac04e37ad874f34021` (165 rows: 116 answer, 32 refuse, 17 clarify)
- Sidecar files `packs.jsonl.sha256` and `atom.jsonl.sha256` hold the same digests.

Each line is JSON: `id`, `lang`, `question`, `history`, `expected` (`answer`, `refuse`, or `clarify`), `key_fact`, `source_url`.
`history` is a list of `{role, content}` turns. It is empty when the question stands alone.
Language codes: `en` English, `ur-rom` Roman Urdu, `ur` Urdu script, `ar` Arabic, `hi` Hindi, `fr` French.
For `answer` and `clarify`, `key_fact` is a verbatim substring of one text block in the cited article.
For `refuse`, `key_fact` and `source_url` are empty because the question asks for a private account fact the public articles do not contain.
`clarify` rows are product-scope collisions. The quoted fact is the public sentence that must not be merged with the other product.

## Elite Atom daily loss check

Article id `17638456`, title Elite Atom Challenge: FAQ, `dateModified` `2026-10-17T09:04:19Z`.
URL: https://faq.fundedelite.com/en/articles/17638456-elite-atom-challenge-faq

Re-read from the live page on 2026-10-21. The Daily loss rows are:

- At a glance: Atom 2-Step `3%`, Atom 1-Step `4%`.
- Atom 2-Step rules: Phase 1 `3%`, Phase 2 `3%`, Funded `3%`.
- Atom 1-Step rules: Challenge `4%`, Funded `4%`.

## Articles

| Article ID | Updated | Title | URL |
| --- | --- | --- | --- |
| 17451781 | 2026-10-08T14:00:58Z | What are Elite Packs? | https://faq.fundedelite.com/en/articles/17451781-what-are-elite-packs |
| 17451793 | 2026-10-08T14:01:00Z | Credits and Payout Credits | https://faq.fundedelite.com/en/articles/17451793-credits-and-payout-credits |
| 17451805 | 2026-10-08T14:01:01Z | The five packs and their drop rates | https://faq.fundedelite.com/en/articles/17451805-the-five-packs-and-their-drop-rates |
| 17451808 | 2026-10-08T14:01:03Z | Opening a pack | https://faq.fundedelite.com/en/articles/17451808-opening-a-pack |
| 17451820 | 2026-10-08T14:01:04Z | Your inventory and using a card | https://faq.fundedelite.com/en/articles/17451820-your-inventory-and-using-a-card |
| 17451827 | 2026-10-08T14:01:06Z | Card rarities and types | https://faq.fundedelite.com/en/articles/17451827-card-rarities-and-types |
| 17451839 | 2026-10-08T14:01:07Z | Card reference: every Elite Pack card | https://faq.fundedelite.com/en/articles/17451839-card-reference-every-elite-pack-card |
| 17451844 | 2026-10-08T14:01:09Z | Exotic cards and The Million | https://faq.fundedelite.com/en/articles/17451844-exotic-cards-and-the-million |
| 17451848 | 2026-10-08T14:01:10Z | Collection, My Packs and keys | https://faq.fundedelite.com/en/articles/17451848-collection-my-packs-and-keys |
| 17451860 | 2026-10-08T14:01:11Z | Free packs and credits with a new account | https://faq.fundedelite.com/en/articles/17451860-free-packs-and-credits-with-a-new-account |
| 17451870 | 2026-10-08T14:01:12Z | Lucky streak, Pack Pass and Special Packs | https://faq.fundedelite.com/en/articles/17451870-lucky-streak-pack-pass-and-special-packs |
| 17451876 | 2026-10-08T14:01:13Z | Elite Packs: good to know | https://faq.fundedelite.com/en/articles/17451876-elite-packs-good-to-know |
| 17638456 | 2026-10-17T09:04:19Z | Elite Atom Challenge: FAQ | https://faq.fundedelite.com/en/articles/17638456-elite-atom-challenge-faq |

Elite Packs collection: https://faq.fundedelite.com/en/collections/19777798-elite-packs
Our Programs collection (contains Elite Atom): https://faq.fundedelite.com/en/collections/19776744-our-programs

