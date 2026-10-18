#!/usr/bin/env bash
# Run the full t739 Atom author suite (isolated; no network; Atom ON only via opts.enabled in tests).
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
node --test tests/author_suite.test.js 2>&1 | tail -45
echo '--- raw counts per set'
node tests/report_counts.js
echo '--- baseline (dd3b9f79) vs corrected'
node tests/baseline_compare.js
