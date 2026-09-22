# Luna fail-fix staging (2026-09-22)

Isolated work copy. **Not used by PM2.** Production remains `/home/ubuntu` (`intercom-bot` → `index.js`).

This folder holds highest-confidence patches from the post-benchmark failure analysis:

1. `challengeVariantGuard.js` — do not Instant-vs-Elite-clarify when the client already named a standard Instant size (R104); dual-overview templates now ask “which one”.
2. `faq-kb.js` — targeted retrieval boosts for 300K overlay, 72-hour live issuance, account rolling, crypto $500 cap, credentials, gambling soft-breach.
3. `assistantIdentityGuard.js` — keep the FAQ remainder when an identity rewrite would drop a multi-part support ask (R127).
4. `FAILURE_ANALYSIS.md` — full 25-section post-benchmark report (real 2026-09-22 artifacts only).

Run (from this directory only, on the VPS work copy that also has `fundedelite-faqs.md` and `statePresend/`):

```bash
node selftest-product-variant-awareness.js
node selftest-both-variants-not-decline.js
node selftest-faq-reset-time-retrieval.js
node selftest-bench-failfix-variant.js
node selftest-bench-failfix-retrieval.js
node selftest-bench-failfix-identity.js
```

Do not copy these files back to `/home/ubuntu` or restart PM2 unless Arsal explicitly deploys them.
