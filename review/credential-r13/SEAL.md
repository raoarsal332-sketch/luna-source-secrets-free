# Seal — independent Credential Guard R13 review

This case set was written before any execution of the frozen candidate.

- Frozen branch: `cursor/credential-guard-r13-c90d`
- Frozen commit: `7c8b66858cb7c2a12abc2d3a80c18ad730e0f607`
- Sealed file: `review/credential-r13/cases/sealed-cases.json`
- sha256: `5b3fc28f6ef56fbfe8de92e72a8dd29a6d0b86bd7585ea34db3ea2ca1ed3dafb`

The generator and the harness are in this commit. They were not run against `handleWebhook` before this hash was recorded. The runner must refuse to start if the sealed file hash changes.

Synthetic secrets only. No production, VPS, Intercom, or live model credentials. Author tests and `review/*` history were not inputs to this set.
