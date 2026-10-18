'use strict';
/**
 * Builds a throw-away copy of a tree for testing: the files are byte-identical except that
 * index.js gets ONE appended statement exporting internal functions the tests must reach
 * (icRequest, icRequestUnguarded, executeOwnerActionPlan, ...). verifyStripped() proves the copy
 * minus that statement equals the original hash.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MARK = '\n/*T739_TEST_EXPORT*/\n';
const EXPORT = `module.exports.__t = {
  icRequest: (...a) => icRequest(...a),
  icRequestUnguarded: (...a) => icRequestUnguarded(...a),
  executeOwnerActionPlan: typeof executeOwnerActionPlan === 'function' ? executeOwnerActionPlan : null,
  processAuthorizedNoteCommands: typeof processAuthorizedNoteCommands === 'function' ? processAuthorizedNoteCommands : null,
  postDeterministicFlowReply: typeof postDeterministicFlowReply === 'function' ? postDeterministicFlowReply : null,
  completeNonAccountEscalation: typeof completeNonAccountEscalation === 'function' ? completeNonAccountEscalation : null,
  faqAssistance, faqAssistanceDeps: typeof faqAssistanceDeps === 'function' ? faqAssistanceDeps : null,
  AUTH_COMMAND_FILE: typeof AUTH_COMMAND_FILE === 'string' ? AUTH_COMMAND_FILE : null,
  replayAuthDeferred: typeof replayAuthDeferred === 'function' ? replayAuthDeferred : null,
  deferForAuth: typeof deferForAuth === 'function' ? deferForAuth : null,
  scheduleBurstRerun: typeof scheduleBurstRerun === 'function' ? scheduleBurstRerun : null,
  burstRerunPending: typeof burstRerunPending !== 'undefined' ? burstRerunPending : null,
  ownershipBoundary,
};
`;

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function make(srcDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't739-tree-'));
  const copyTree = (from, to) => {
    for (const f of fs.readdirSync(from)) {
      const p = path.join(from, f);
      const st = fs.statSync(p);
      if (st.isFile()) fs.copyFileSync(p, path.join(to, f));
      else if (st.isDirectory()) {
        fs.mkdirSync(path.join(to, f), { recursive: true });
        copyTree(p, path.join(to, f));
      }
    }
  };
  copyTree(srcDir, dir);
  const idx = path.join(dir, 'index.js');
  const orig = fs.readFileSync(idx);
  fs.appendFileSync(idx, MARK + EXPORT);
  return { dir, originalIndexSha: sha(orig) };
}

function makeBaseline(root) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 't739-basesrc-'));
  for (const f of fs.readdirSync(path.join(root, 'base'))) {
    fs.copyFileSync(path.join(root, 'base', f), path.join(stage, f === 'spreadPublicGuard.2158c43f.js' ? 'spreadPublicGuard.js' : f));
  }
  return make(stage);
}

function verifyStripped(dir, expectedSha) {
  const s = fs.readFileSync(path.join(dir, 'index.js'));
  const cut = s.indexOf(Buffer.from(MARK));
  return cut > 0 && sha(s.subarray(0, cut)) === expectedSha;
}

module.exports = { make, makeBaseline, verifyStripped, sha };
