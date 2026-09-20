'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || process.cwd();

function patchPromo(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('function isRulesBypass')) {
    s = s.replace(
      /(function assert\([\s\S]*?\n\}\n)/,
      `$1
/** soft-edges: plan-diff may return null OR { useExistingRulesFlow:true, reply:null } */
function isRulesBypass(r) {
  if (r == null) return true;
  if (typeof r === 'object' && r.useExistingRulesFlow === true && (r.reply == null || r.reply === '')) return true;
  return false;
}
`
    );
  }
  s = s.replace(
    "assert('wired-engine', idx.includes('fresh-2026-09-15-promo-scope'));",
    "assert('wired-engine', /fresh-2026-09-15-(promo-scope|soft-edges-v1)/.test(idx));"
  );
  s = s.replace(
    "assert('diff-lite-standard-null', r == null, r);",
    "assert('diff-lite-standard-null', isRulesBypass(r), r);"
  );
  s = s.replace(
    "assert('lite-vs-freeretry-null', r == null, r);",
    "assert('lite-vs-freeretry-null', isRulesBypass(r), r);"
  );
  s = s.replace(
    "assert('daily-loss-lite-null', r == null, r);",
    "assert('daily-loss-lite-null', isRulesBypass(r), r);"
  );
  s = s.replace(
    "assert('diff-followup-2step-null', r == null, r);",
    "assert('diff-followup-2step-null', isRulesBypass(r), r);"
  );
  s = s.replace(
    "assert('diff-followup-no-sep35', r == null || !/SEP35/i.test(String(r)));",
    "assert('diff-followup-no-sep35', isRulesBypass(r) || (typeof r === 'string' && !/SEP35/i.test(r)));"
  );
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

function patchReview(file) {
  let s = fs.readFileSync(file, 'utf8');
  const old =
    'assert(src.includes("engine: \'fresh-2026-09-15-review-status-direct\'"), "health engine string");';
  const neu =
    'assert(/engine:\\s*[\'"]fresh-2026-09-15-(review-status-direct|soft-edges-v1)[\'"]/.test(src), "health engine string");';
  if (!s.includes(old) && !s.includes('soft-edges-v1)[\'"]/.test(src)')) {
    // try alternate quoting
    s = s.replace(
      /assert\(src\.includes\("engine: 'fresh-2026-09-15-review-status-direct'"\), "health engine string"\);/,
      neu
    );
  } else {
    s = s.replace(old, neu);
  }
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

function patchAck(file) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(
    '/fresh-2026-09-15-escalate-ack-norepeat/.test(src) && /postEscalateHoldingStatus/.test(src)',
    '/fresh-2026-09-15-(escalate-ack-norepeat|soft-edges-v1)/.test(src) && /postEscalateHoldingStatus/.test(src)'
  );
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

patchPromo(path.join(ROOT, 'selftest-promo-prompt.js'));
patchReview(path.join(ROOT, 'selftest-review-status-direct.js'));
patchAck(path.join(ROOT, 'test-escalate-ack-norepeat.js'));
