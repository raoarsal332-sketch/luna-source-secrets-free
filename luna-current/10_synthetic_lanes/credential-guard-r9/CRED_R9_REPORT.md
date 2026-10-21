# Credential Guard R9

Staging candidate only. `approved` is false. This report does not approve the candidate. The R8 review case file was not read and its 165 cases were not replayed. Nothing here is wired into `index.js`, `statePresend.js`, or the maintainer. No VPS, production, Intercom, or `.env` path was used.

`proposed-integration.diff` is unapplied. `patch --dry-run -p1 --forward --batch --silent` exits 0 against this tree. The lane tests are 40 passed.

Protected files are byte-identical:

- `luna-current/01_runtime/system-prompt.txt` `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`
- `luna-current/01_runtime/fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`

## What changed

1. Model requests are an outbound surface. The latest client message appended after `buildHistory`, the raw owner text in `interpretOwnerCommandViaLlm`, the repeated-question prompt, and every `messagesFor`, `buildState`, snapshot, vision-hint, and memory read are redacted before they are stored or sent to the model.

2. Label scans use a fresh regular expression on every call, so base64 recursion cannot reset another scan's `lastIndex`. Depth, match count, decoded size, and time are bounded. Crossing a bound fails closed with `validation_error` and does not post. Padded, unpadded, and URL-safe values after `password:` finish immediately.

3. NFKC is applied before key-material matching, including a fullwidth `sk-`. Format and zero-width characters are removed. Copulas match on word boundaries, so `hai` does not match inside `hain`. Spaced chunks of any shaped length are joined, including `a! b@ c#`. The proposed choke runs after `postProcessModelReply`, punctuation, spacing, and `toHtml`. Bearer tokens of 12 or more characters are caught. Labeled `pin`, `pwd`, `otp`, and password values are caught even when short, including `password: reset`. Ordinary wording such as "password reset instructions are on the site" is not a secret.

4. Explicit spread-test requests that R8 missed are eligible for the exact template only: Hindi verb-final phrasing and `कृपया` without `मुझे`, Urdu `اکاؤنٹ` and `اکاونٹ` after `normalizeForMatch`, and "how do I test/check the spreads" in English, Urdu, Hindi, Arabic, and Hinglish. `no rush` is not a negation. Clauses are split before a payout mention can veto a different clause. Every other credential stays blocked. An owner reply that is the template after `ensureCustomerReplySpacing` matches by the SHA-256 of the whitespace-normalized text.

5. Search polls, the defer store, observe mode, and `icRequest` send `guardOutboundWrite`'s returned object. Logs for those paths stay on reason codes.

## What did not change

The fixed client message is still: "Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team." It states no account, payout, or lock outcome. Unauthorized template sends stay at zero in the lane tests: the template password is posted only when the latest client ask is eligible and the body is that template. The runtime files on this branch do not require the guard.
