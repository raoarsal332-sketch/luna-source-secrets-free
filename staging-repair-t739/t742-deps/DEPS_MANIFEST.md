# t742-deps: verified dependency closure for live index.js bf9e1fc2 (staging use only)

Built 19 Oct 2026, around 06:55 PKT, from box copies whose sha256 equals the live hash taken read-only on 19 Oct 06:15 PKT (owner approval t744). The files are byte-identical to live, with no edits or redactions. Relative paths are as in the live app dir `/home/ubuntu`. Check them with `sha256sum -c SHA256SUMS` run from this directory.

Provenance:
- **live-verified t744:** a box copy whose hash equals the live hash.
- **retrieved t744:** streamed from live on 19 Oct (prePurchaseGate, handoffClaimGate, faqDeliveryRecovery).
- **reopen-release / r87 release:** a release copy whose hash equals live.

Before copying, every file was secret-scanned for: API keys and tokens, bearer tokens, secret/password/investor-password assignments, password values, emails, phone numbers, URLs carrying key/token/signature params, MT5 login digits, long hex strings, private keys, and Intercom conversation IDs. Results:
- Intercom conversation IDs appear only as ticket references in code comments, never next to a secret. They were treated as non-secret.
- The long hex value in productRulesOverview.js is a content-hash constant.
- 6 files were initially **NOT copied**. On 19 Oct at 07:07 PKT the owner decided: 5 are added as comment-only sanitized copies (below), and `index.js` is used from the repo.

## Included byte-identical (61 files)
| Path | sha256 | Provenance |
|---|---|---|
| accountCheckRequest.js | `40a7154c9aa887086403d8fa134275d0be3cc2821f4fa29323c8545b2f531959` | live-verified t744 |
| assistantIdentityGuard.js | `a4ec4112da76c13eb8427d03146937f4b02a93a86b120a7d9910bab786cc9dc6` | live-verified t744 |
| atomicJsonFile.js | `babeb1e6aac3cb1b0200650ed65fa18552cbd0c84f288e388420dd4a8d2e8de8` | live-verified t744 |
| challengeVariantGuard.js | `147c3448666b668d268f21b288542ce9803ba55eb9c054ccfd01edb65f5ddf69` | live-verified t744 |
| contextualFollowUp.js | `80118b1eb079be45898d44cf9bf0281099aeab208d8fba696cce7f84cbb75439` | live-verified t744 |
| continuousOwnership.js | `0c5dc007454eacaf7b1d4af0f30eaab6dde81c9ca66a59b5768dfcbb257848c8` | reopen-release, live-verified t744 |
| control.js | `b001054c9eb1b7b0179ba696b41718c3159653076d9e0e6b947b2d1ce223e141` | live-verified t744 |
| escalateProblemPolish.js | `fc8ce4e9d5d79718bcb298a5bba61046e40edf26dc1a98f658ae473169a4ee2f` | live-verified t744 |
| escalateRelatedOnly.js | `685cb16802bc9063e2ffdc3af4020dfcea6f7277107c38138b39a636db1138c1` | live-verified t744 |
| faq-kb.js | `882fb28d0bc1316c9a4c7210dd8ab3bd706990f288cca5ec6443948baf24e5cc` | live-verified t744 |
| faqAnswerSelect.js | `cb8df44284905f4477ad5b3148a81c6f9664900a897642f85a4c903164b85d5e` | live-verified t744 |
| faqApprovedAnswers.js | `f36640af229bd025b7797d0a04803c96128ea103704d162cdbed2a4ec4932749` | live-verified t744 |
| faqAssistance.js | `8ff65201adac73453cdd5fd8080c7d43b9cb2cfaca021f1cb0e09a2710e8da6a` | live-verified t744 |
| faqDeliveryRecovery.js | `8ea32800fbf0ac088825d5afb6724121623aa06a534fa728694e5462e29884d3` | retrieved t744 |
| faqOutboundSafety.js | `8e3330246e8c0ce2bf99135b502ee08df6b56c394de27352f73b0be732395623` | live-verified t744 |
| generalAccountAskGuard.js | `6b2671d1490ad664e8e6035230e5412bbb6126234cb1798b98c8fbb2dcb9dab6` | live-verified t744 |
| handoffClaimGate.js | `a0f8d7fc94caad83b091eebadf30ddf927e84b146d895a04ac7ff6bb65ef7687` | retrieved t744 |
| humanRequest.js | `5d2bacffb95c49aa63f6a8b8c9b9e458decd77d7fc743f11ab7e74bb2f8b1813` | live-verified t744 |
| identityEscalateGates.js | `e74bdf75fec2b245e4dd49f827f63a1fb26348f9d5eb3d68be6ea9a2e6dfa1cd` | live-verified t744 |
| imageEvidence.js | `43dca40193ba1cdce7bd778f29c522fb03ea9025a6279b268ab13f34d0e86bac` | live-verified t744 |
| internalNoteFormat.js | `fe1b52d948e2ca3065e8e17e0dc9d99907175b66e038b64c7b36d55920fc5395` | live-verified t744 |
| logRedact.js | `1b5b05f863a97f3e5939ae84b3a70ed2960313f1e76b57b760bc23742ac57ce2` | live-verified t744 |
| lunaEpisode.js | `185e366d1142591af855d7b199459c4be4e6d0868dfe1c65dd90fff9491b17a1` | live-verified t744 |
| lunaResponsesTransport.js | `1c71d1686b6d09b79bcbd0e1da2869d347c04da5c847593bc538ef4c469e7c81` | live-verified t744 |
| lunaToolsRuntime.js | `7885076140819f4e544f435c46859106d9929ec6531462a308e2258e2c732c3b` | live-verified t744 |
| modelConfig.js | `dac706199fde03c3fb78293afa36aa993cf1b40c8babef28cdfcf272298d7bfa` | live-verified t744 |
| modelTestGuard.js | `8f9f062c5104f69566b0848b87bcff4e99b0f9d4c9ee3265307e00dea2703c1e` | live-verified t744 |
| openaiRateGate.js | `8b1736d81d759835b3e1af3740f6b59547faac67a18be0925311a85960f9d33b` | live-verified t744 |
| ownershipBoundary.js | `3b70ed2716364943303a5be1a354afb3392ddfd5e13c172ed6192c5609605ac6` | live-verified t744 |
| partnershipIntent.js | `3a09b5088e692164f96b1cd98b159e0394fff8de1391fb70931b3879663f0ad3` | r87 release, live-verified t744 |
| policyFactGuard.js | `287a7aa2779bb334b5097b9ee2180d0546cd0d9eb0456d01e65e2b8ca2bc4834` | live-verified t744 |
| prePurchaseGate.js | `c064c235610b45954cd6fabaafe9209663891add0a0b7341a292c9076efbd9ce` | retrieved t744 |
| productComparison.js | `4736fd56cb0d1e1f5f07b1d1ea0f8e87f7a3c349160ddf9baeaf1dced928c6c7` | live-verified t744 |
| productRulesOverview.js | `e946e616f7ba609f508ba50f76d3f5aeaf66d53bf0253783432a776396d7948b` | live-verified t744 |
| publicReplyBoundary.js | `149a27507246cbdb4269817345e11a1f5c1253677db25a8f8c558d4cd3361dff` | live-verified t744 |
| publicResponseContract.js | `322d4544c2a5bbcc2ecc7ca9dde78baf5cf419e5d94f847fd3be21db1f76fbe5` | live-verified t744 |
| repeatedClientQuestion.js | `3d249196b6214138ef50da846dcfb6c1bce08ebb98812918f174a12f02ede0e2` | live-verified t744 |
| replyDecision.js | `c673fd429697c6442861af9ae2ab571d23c7b9dc1f42b39345770185172e92e8` | live-verified t744 |
| reviewRequestFlow.js | `5e3b179e74d26cb3f40a239752d6d0e26398f28cdd51f0ed994a883354aac84f` | live-verified t744 |
| riskNoteGate.js | `ba7205bc2bc3db0bb36eb82e833c210e2d0b178d58ff79545545fd30dc8b5d45` | live-verified t744 |
| secretRedact.js | `8f488910286ea6f3dca5cd8e8a1395b58a40f286bc4fc721bcb32922b874266c` | live-verified t744 |
| september-promos.js | `2995ec92a8c4e9890855f2f3996bc7ef2f2a8f8a30d3de698eb3f76f5ee91aa0` | r87 release, live-verified t744 |
| softEdges.js | `55ce21dc9ac2cfa152d89755cc255b750699378eb173ce5e145ce4ec1fb96aea` | live-verified t744 |
| spreadAskGate.js | `f7c32ff18829a228db28c173548805ac92988a91fd5a1480eb7603862c420a6f` | live-verified t744 |
| spreadPublicGuard.js | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` | live-verified t744 |
| statePathGuard.js | `c9b6de4c5d4ad621c1af76652aa4fa501505b0b276abdfcfefbccf41b3efdcb0` | live-verified t744 |
| statePresend/conversationState.js | `3c594651c5cb450335403b5e1f0bca1185a5ddacdeec3acb2e975327c6ecff6b` | live-verified t744 |
| statePresend/credentialSanitizer.js | `ed62aa7b330aa090d7faeac9ef70f75e1f2ef312361d6530158e2dd30123d64a` | live-verified t744 |
| statePresend/multiAskCompleteness.js | `47aeb539083f644a33478ffdcf731b069fd2ddc1246c6bd8ecdfb2386b82db6b` | live-verified t744 |
| statePresend/policyEvidence.js | `e2f587b935363e7208b8866684e5f11f2d54289f23a2924c7176f225c4455314` | live-verified t744 |
| statePresend/statePresend.js | `05da5a387dbdaac91bb67d5eb7ce3be0e73ed96d7215022ba867448e8fbd7dfb` | live-verified t744 |
| statePresend/turnIntent.js | `715c4e9638aff1ad10ffd3f31bbb4aae42cb181052ac2f171f55f84722de31d5` | live-verified t744 |
| statePresend/typoNormalizer.js | `d3a16334f31a0715bec5c27a7f5779fee4a3409239a9a4fe9b2b46b7daa270aa` | live-verified t744 |
| teammateAdmins.js | `443c14a7981c45a2c5b00a4e50f345bc99876b3a577aec3ad3e482a454d79ac8` | live-verified t744 |
| teammateAudit.js | `1e362492f376da427b38ad6c9e2402c51b086d3f64a235a90094129f45fc1971` | live-verified t744 |
| teammateTopicOwnership.js | `1151a05149ceb59d20b14797ee714d5603795e4355c88a8973c138944c77da8e` | live-verified t744 |
| tradingStagePolicy.js | `3869a4e10665d1efd15ab00cff273c087198d0ed00d26846ace09cfa32f6d588` | live-verified t744 |
| variantComparisonCompleteness.js | `9c6863dff111e03b704a71b41eb1c53d0215e2a82410de70593ab5709f253b68` | live-verified t744 |
| webhookFastAck.js | `b7594df1de07be3b4e661551c272a72186e88a558e34a9af95f78a71ab69e5b4` | live-verified t744 |
| webhookSecurity.js | `d3cf8ce2332e577be318762f6a9106d7bfbb6be9839cf983f273023ca2231e70` | live-verified t744 |
| writeOpStore.js | `2442e8e73d399cc78aa35d4d2c37de6f0a748141829eb37ca8b58cb62e11f5e6` | live-verified t744 |

## Sanitized copies (SANITIZED-COMMENTS-ONLY; owner decision 19 Oct 07:07 PKT)
Rule applied: inside **comments only**, account-number-like and phone-like digits were replaced with the same number of zeros. No emails appeared in these 5 files. Every changed value was confirmed by the acorn tokenizer to be inside a comment; none sat in a string, regex or code. Not changed:
- 15-digit Intercom conversation-ID references in comments.
- Staff/team admin IDs in string literals (teammateHandoffGates L236-238, accountNumberPrefer L538). These are functional staff configuration, not customer data.
- Challenge-size string constants (accountNumberPrefer L9-14).
- Money examples in comments (accountNumberPrefer L65/81/93).
- A staff admin ID in a comment (teammateHandoffGates L526).

accountNumberPrefer lines 166/170/308/320/394 were missed by the scan regex but hold the same kind of account-number examples, including customer-style quotes. They were sanitized under the same rule. After sanitizing, the secret scan of all 5 copies is clean (0 hits; all-zero placeholders ignored).

| Path in store | Original live sha256 | Sanitized sha256 | Provenance | Values changed | Equivalence |
|---|---|---|---|---|---|
| teammateHandoffGates.js | `3651c2da72ffa53e66b98530345b26db02a6ddad061268593ca5888958c8eefc` | `2bcc09bfb5251a5af16b85495545c45f10f7d4a1fb6622165fdd0ebb5a9fa612` | SANITIZED-COMMENTS-ONLY; reopen-release, live-verified t744 | 1 values on lines 682 (account-number-like) | acorn 8.19.0 comment-stripped token streams identical (5641 tokens); node --check OK (orig + sanitized); same byte length |
| publicRestatementGuard.js | `dd594d852e63c6f272971bd1c385152ef80ebe6d1c4e0906c2e4411a721e2e87` | `1123df36705f6ed6b9cf1710493e8122990ee87c9423fa9455432d4149b7deec` | SANITIZED-COMMENTS-ONLY; live-verified t744 | 1 values on lines 178 (account-number-like) | acorn 8.19.0 comment-stripped token streams identical (1438 tokens); node --check OK (orig + sanitized); same byte length |
| imageAskGuard.js | `5bc307ff07bdf3d9dc140096eac59ea2c3f80658e73451246cb12dbb1af1d822` | `9dddfcff40b1a113052ac5cae358b0c62c9b5917461a00395784f5e2684b4e7e` | SANITIZED-COMMENTS-ONLY; live-verified t744 | 1 values on lines 148 (account-number-like) | acorn 8.19.0 comment-stripped token streams identical (3373 tokens); node --check OK (orig + sanitized); same byte length |
| statePresend/textUtils.js | `92c3349c4b2b03c6843ea7c1df481641af6eb38a931dbf187f4dc984bc4e31e3` | `b1261a82fd49a2bc0416b0fefe072354e5b88e84e9d0ba775e8ad85572654986` | SANITIZED-COMMENTS-ONLY; live-verified t744 | 6 values on lines 89, 104 (phone-like) | acorn 8.19.0 comment-stripped token streams identical (4662 tokens); node --check OK (orig + sanitized); same byte length |
| HISTORICAL/accountNumberPrefer.js | `f24b8425618eab76daf238c5f75e4d71ab3ab33b299575d0c1b4c9956d3b00a9` | `dfed1aaf181f358a0204765c08c27193214b7d56a4721112cf7dd04f0b921b06` | SANITIZED-COMMENTS-ONLY; HISTORICAL (8 Oct live snapshot-r82; current live 795c58d7f2c8… not retrieved) | 28 values on lines 106, 162, 163, 166, 170, 201, 308, 320, 394, 413, 488, 593 (account-number-like, phone-like) | acorn 8.19.0 comment-stripped token streams identical (5026 tokens); node --check OK (orig + sanitized); same byte length |

## Current live accountNumberPrefer.js (owner approval t745, retrieved 19 Oct 15:50 PKT)
| Path in store | Original live sha256 | Sanitized sha256 | Provenance | Values changed | Equivalence |
|---|---|---|---|---|---|
| accountNumberPrefer.js | `795c58d7f2c872b831b47e079f539d5bbc54ddd9e890956fa865ca5977639ff6` | `422bfed00c6bddb2f9d6ef9e464c50113b0682c616d97b332498efd07d70b385` | SANITIZED-COMMENTS-ONLY; retrieved t745 (ubuntu@51.79.173.231:/home/ubuntu/accountNumberPrefer.js, 29712 B, mtime 2026-10-08 23:39:54 UTC) | 36 values on lines 106, 162, 163, 166, 170, 178, 219, 278, 279, 288, 342, 354, 428, 447, 522, 627 (phone-like, account-number-like) | acorn 8.19.0 comment-stripped token streams identical (5257 tokens); node --check OK (orig + sanitized); same byte length |

This file is now the current dependency. `HISTORICAL/accountNumberPrefer.js` (8 Oct f24b8425, sanitized) is kept unchanged as historical evidence only. Scan note: line 280 `const TOKEN = '(…regex…)'` matched the secret-assignment pattern. It is a regex-pattern constant named TOKEN, not a secret, so it was left unchanged (it is code, not a comment).

## index.js
Not stored here. Use the repo copy `staging-repair-t739/base/index.js` (git blob 29daecf3), which is byte-identical to live bf9e1fc25a471a578e93c2d4b78b8f787b5e1acc556a3e7f9d4580f24b0d384d. Its scan flags were account-number-like comment values and one staff email; they were already in the repo before this task.

## Not included
- Outside the 67-path verified set (versions not live-verified): luna-maintainer/ (optional), effortPolicy.js, accountSizeFormat.js, publicReplyStructure.js, fundedelite-promotion-prompt.js, statePresend second-level modules (analytics/, knowledgeGapGate, presendMega, router, structuredImageExtractor, targetedRegeneration, tools/, correctionDetector, topicChangeDetector), luna-knowledge/lib.
- Never included: .env*, bot-control.json, ecosystem.config.js, fastack config, state files, logs, KB, prompts.
