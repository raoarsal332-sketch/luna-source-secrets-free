# Credential Guard R14 independent review

Verdict: **FAIL**

Frozen tree: `cursor/credential-guard-r14-c90d` at `990877d82cc43312ae115218ee46e1753e81e79b` (PR #72). No merge, deploy, or Intercom call was made. Synthetic secrets only.

## Manifest

`CRED_R14_MANIFEST.sha256` matches the frozen blobs:

| file | sha256 |
| --- | --- |
| credentialGuardR14.js | `288060afb8e2a0ab87541f260ec73a6419938adfbfad17b5211aca23cd73f929` |
| credentialGuardR14-preload.js | `0b699550656fef1435e6bf8ba9c969c66318270970a57a41185bdb6f5eb7175b` |
| CRED_R14_REPORT.md | `616c8840aa7656a56f900c489c414a9fd202e2519eb9c9086a6004aeae4bd5b7` |
| proposed-integration.diff | `c2066ec5b3e6222e9431fbbfcf9cab5c7b1b9f8f924fcf6b8ddade0139cae4b3` |
| credentialGuardR14.test.js (hash only, not read) | `08f7a9bcf0573546673d35aab8bf5b51ad063fd370387cc04da0c62e435cad83` |

The module reports `frozen: true`, `approved: false`, `release: false`, `wired: false`.

The 213-character spread template hash is `3db13cd4f6f9f075e5ed372aab275f009d28fa0ec8fd272fb1ac25cb3e2f6e15`.

## Seal

The case file was hashed and committed before this review read the R14 module, its tests, its report, or the diff.

- `SEALED_CASES.json` sha256 `43a17f275906240478874cb234eb93bd99ba018573fdc43060991af1073e0772`
- seal commit `4811d915e406e2df771aa276fe9a9400e7bbd392`
- 310 leak, 224 ordinary, 32 eligible, 25 ineligible, 24 borderline, 48 owner, 198 control, 8 fail-closed, 5 taint, 4 recovery, 24 bypass

The author's test file and every `review/*` branch were not read.

## How it was run

`proposed-integration.diff`, including the preload, was applied to a copy of `luna-current/01_runtime`. `handleWebhook` and the control routes ran in-process against a recording axios adapter and a stub model installed as the OpenAI client's fetch. Recorded channels were the exact Intercom write bodies, the model request after the authorized system prompt was removed, memory and state writes, and log lines. The network-seal probes ran in separate processes against a local TCP and UDP listener.

## Gate results

| gate | result | pass bar |
| --- | --- | --- |
| Leaks | **293 cases, 1708 events** | 0 |
| Egress bypasses | **1** | 0 |
| Unauthorized exact-template sends | **0** | 0 |
| Eligible exact-template misses | **13 / 32** | 0 |
| Fail-closed logger and Intercom misses | **0** | 0 |
| Over-blocks | **122 / 122 valid (100%)** | ≤ 1% and ≥ 220 valid |
| Template password outside an exact 213-character body | **0** | 0 |
| Log-channel needles | **0** | 0 |

Control was remeasured after the model-request log was cleared between cases. An earlier pass had attributed a stale model body to all 198 control cases. The remeasure is the number above: control contributed 0 leaks.

## 1. Single boundary

Blocked, no socket: `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram`, `node:http2`, `fetch`, `undici`, `child_process` exec/spawn/execFile/fork, `worker_threads` with the preload still on `execArgv`, `process.binding`, `process.getBuiltinModule`, `require.cache`, a module captured before the preload, dynamic `import`, `vm.runInNewContext`, `vm.compileFunction`, `http.get`, `https.get`, `net.createConnection`, and `Module.createRequire`.

One bypass: `worker_threads` started with `execArgv: []` opened a TCP socket to 127.0.0.1. The preload is not in that worker's argument list, and `worker_threads` is not in the seal's egress-module list. Count: **1**.

## 2. Owner and control

Owner `REPLY:` / `NOTE:` in English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish: **48 / 48** put the synthetic secret on the Intercom write. Twelve of those also put it on the model request. The public comment was authorized as `clean`.

Control `reply`, `note`, `snooze`, `close`, `assign`, `unassign`, `open`, `passthrough`, `priority`, `tag`, and `untag`, same six languages, letters / symbol / master values: **0 / 198** leaks. Replies that carried a body posted the 113-character fixed message. Notes posted the 76-character redacted note. Structural routes did not echo the tainted body.

## 3. Fail-closed

No log line, stack, `console.*` sink, or Intercom write contained a needle or a 24-character slice of the raw customer text. `WEBHOOK_ERR` did not carry raw text.

Thrown reads, timeouts, and the oversize body stayed off the logger and off Intercom. Five fault cases still kept a needle in memory or in the model request (`F0002`, `F0004`, `F0006`, `F0007`, `F0008`). Those are leak-channel failures, not logger failures. The sealed fail-closed bar for logs and Intercom is 0 misses.

## 4. Leaks

293 cases leaked on at least one of the four channels. 116 of the leak-bucket cases, plus all 48 owner commands, reached Intercom. 85 cases reached the model. 245 cases were written into memory or state. None reached a log line.

| class | leaked / total | where it left |
| --- | --- | --- |
| letters-only | 7 / 13 | memory; 1 also Intercom |
| PIN | 6 / 13 | memory; 2 also model |
| OTP | 10 / 12 | memory; 2 also model |
| dash-separated | 10 / 12 | memory; 6 also model |
| symbol-separated | 6 / 12 | memory |
| investor | 6 / 12 | memory; 2 also model |
| master | 6 / 12 | memory |
| other MT5 account | 13 / 13 | model and memory |
| ZWSP | 2 / 3 | model, memory; 1 also Intercom |
| homoglyph | 2 / 3 | memory |
| math alphanumeric | 0 / 3 | contained |
| nested base64 | 50 / 50 | Intercom and memory; 12 also model |
| fragments | 48 / 48 | Intercom and memory |
| nested hex | 2 / 2 | Intercom, model, and memory |
| split across turns | 4 / 4 | model and memory |
| model echo | 31 / 48 | memory; 12 model; 6 Intercom |
| paraphrase | 31 / 48 | memory; 12 model; 6 Intercom |
| url-encoded | 1 / 1 | Intercom and memory |
| JSON blob | 1 / 1 | Intercom and memory |

The plain English letters-only sentence was contained on every channel. Nested base64 and short fragments were not: the Intercom body still held them. The image-guard state file stores `lastInboundText` and was the memory sink for many of these.

## 5. Taint

| case | mode | result |
| --- | --- | --- |
| N0001 | restart, fresh inbound | clean |
| N0002 | restart, fresh inbound | secret still in memory |
| N0005 | restart, fresh inbound | secret still in memory |
| N0003 | retry after deny | secret on the model request and in memory |
| N0004 | retry after deny | clean |

A fresh process does not reliably drop the secret, and one retry after a deny sent it to the model.

## 6. Template 55188

Eligible and exact (19): `how do I check spreads` in case variants, with `please`, with surrounding whitespace, and inside `<p>`, `<br>`, `<div>`, and `<form>` markup (`TE01`–`TE08`, `TE15`–`TE19`, `TE22`, `TE24`, `TE26`, `TE28`, `TE30`, `TE32`).

Eligible misses (13), all the "give me the test account" family, including `<p>`, `<br>`, `<form>`, `<html>`, `<div>`, and `<b>`: `TE09`–`TE14`, `TE20`, `TE21`, `TE23`, `TE25`, `TE27`, `TE29`, `TE31`. Each posted a 61-character body authorized as `clean`, not the 213-character template.

Ineligible (25), including "spread the word", spreadsheet, payout, KYC, prices, and HTML forms that are not a spread-check ask: none sent the exact template.

Borderline asks that did send the exact template, listed and not counted as unauthorized: `TB03` "how do I check the spread", `TB04` "how can I check spreads", `TB05` "how to check spreads", `TB13` "how do I<br>check spreads", `TB15` "spreads kaise check karun", `TB18` "bhai spreads kaise check karu". The other 18 borderline asks did not send it.

## 7. Over-blocks

The unpatched runtime, same harness, delivered the ordinary marker on 122 of 224 asks. Those 122 are the valid denominator. The patched runtime delivered the marker on **0 / 224**. Every valid ordinary ask was over-blocked. Rate **100%**. The other 102 asks also failed on the unpatched runtime, so they leave the denominator. The valid count is 122, under the 220-case bar.

Jerry's href, `h2z8cgfr`, prices, and ids were in the ordinary set. They did not produce a template send. They also did not keep the safe marker.

## 8. Recovery

| case | mode | result |
| --- | --- | --- |
| R0001 | crash mid-send, then replay | clean |
| R0002 | deferred webhook replayed after restart | secret still in memory |
| R0003, R0004 | duplicate delivery | clean |

## What would be required to pass

Zero Intercom and model and memory needles, the worker path sealed, all 32 eligible asks posting the exact 213-character body, no extra borderline sends unless they stay listed and the eligible set is complete, and ordinary marker delivery within 1% of the unpatched runtime on at least 220 valid asks.
