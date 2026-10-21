# Supplemental probes (same patched module, not part of the 165)

Run against `/tmp/cred-r8-review/runtime/credentialGuardR8.js` after the sealed suite. Synthetic values only.

## Eligibility (`isExplicitSpreadTestRequest`)

| Id | Result |
| --- | --- |
| `स्प्रेड टेस्ट खाता भेजिए` | false |
| `कृपया स्प्रेड टेस्ट अकाउंट भेजो` | false |
| `स्प्रेड टेस्ट अकाउंट भेजो` | false |
| `कृपया मुझे स्प्रेड टेस्ट अकाउंट भेजो` | true |
| `براہ کرم مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجو` | false |
| `مجھے سپریڈ ٹیسٹ اکاؤنٹ دیں` | false |
| `how do I check the spreads?` | false |
| `How do I check the spreads on the test account?` | true |
| `How do I test the spreads with the test account?` | false |
| `Please send me the spread test account, no rush.` | false |
| `Please send the spread test account. This is not about my payout.` | false |
| `I do not have an account yet. Please send me the spread test account.` | true |
| `Please send me the spread test account.` | true |
| `Do not send me the spread test account.` | false |
| `What is a spread test account?` | false |
| `I already tested the spreads on the test account.` | false |
| `What is the spread on EURUSD during news?` | false |
| `أرسل لي حساب اختبار السبريد` | true |

`normalizeForMatch('سپریڈ ٹیسٹ اکاؤنٹ')` returned `سپریڈ ٹیسٹ اکاونٹ`.

## Extraction and bearer floor

- `extractSecrets('password hain Za9Hain91')` → `[]`
- `extractSecrets('mera password hai Za9Hing91')` → `Za9Hing91`
- `extractSecrets('password: hun ter 99x')` → `[]`
- `extractSecrets('pin: a! b@ c#')` → `[]`
- `extractSecrets('password: Za9Semi;91')` → `Za9Semi;91`
- `Za9Bearer91abcd` length 15: `keyMaterialValues` empty; `guardSend` of `Bearer` plus that token → `allow` / `clean`
- `Za9Bearer91abcde` and `Za9bearer91abcde` length 16: both captured; `redactText` → `Bearer [secret]`; `guardSend` → `fixed_message` / `key_material`, token absent from the body
- Fullwidth `ｓｋ－Za9FullKey91abcd`: `keyMaterialValues` empty
- `sk-Za9skLower91abcd`: captured
- `sk-` + ZWSP + `Za9ZwspKey91abcd`: `keyMaterialValues` empty

## Base64 hang (`extractSecrets`, 3s kill)

| Input | Result |
| --- | --- |
| `password: WmE5QjY0UGFkOTE=` | return in 4 ms: base64 value and decoded `Za9B64Pad91` |
| `Client: password: WmE5QjY0UGFkOTE=` | hang |
| `Client: password: WmE5QjY0UmF3OTE` | hang |
| `Client: password: WmE5QjY0VXJsOTE` | hang |

## Template bytes

- Exact `SPREAD_TEST_REPLY`: `isDeliverableSpreadTemplate` true. `guardSend` with client text `Please send me the spread test account.` → `allow` / `spread_template`.
- Same template with a blank line inserted between each prose line: `isDeliverableSpreadTemplate` false. `guardSend` with the same client text → `fixed_message` / `template_password`.

## Search decision

- Real auto-close filter (no `body` field): `no_public_body`, `post: true`.
- Same object plus `body: 'password: Za9Search91'`: `post: true`, replacement body is the fixed sentence, caller object still holds `password: Za9Search91`.
