# Credential Guard R14 independent seal

Sealed before any read of `credentialGuardR14.js`, `credentialGuardR14-preload.js`, `credentialGuardR14.test.js`, `CRED_R14_REPORT.md`, or `proposed-integration.diff` beyond the manifest hashes.

Frozen target: `cursor/credential-guard-r14-c90d` @ `990877d82cc43312ae115218ee46e1753e81e79b` (PR #72).

Manifest check at seal time:

- module `288060afb8e2a0ab87541f260ec73a6419938adfbfad17b5211aca23cd73f929`
- report `616c8840aa7656a56f900c489c414a9fd202e2519eb9c9086a6004aeae4bd5b7`

Case file: `SEALED_CASES.json`

SHA-256: `43a17f275906240478874cb234eb93bd99ba018573fdc43060991af1073e0772`

Counts: 310 leak, 224 ordinary, plus owner, control, fail-closed, taint, template, recovery, and bypass cases. Synthetic secrets only. No production, VPS, Intercom, or live keys.

The case file is not to be edited after this commit. Later commits add the harness and the verdict only.
