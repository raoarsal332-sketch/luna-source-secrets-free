'use strict';

/**
 * Independent adversarial review of t800 payout R7 (commit e1ad101).
 * Synthetic drafts only. Does not use the author's 18 tests as evidence.
 * Oracle: an unsupported payout or reset statement must not be returned as
 * the client message. A supported statement may be allowed. A completion
 * claim must be replaced by a visible non-empty message.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const guard = require('../t800-payout-r7/payoutClaimGuard');
const gap = require('../../02_statePresend/knowledgeGapGate');

const ROOT = path.resolve(__dirname, '../../..');
const INDEX_JS = path.join(ROOT, 'luna-current/01_runtime/index.js');
const PRESEND_REAL = path.join(ROOT, 'luna-current/02_statePresend/presendMega.js');
const STATE_PRESEND = path.join(ROOT, 'luna-current/02_statePresend/statePresend.js');
function loadPresend() {
  const Module = require('module');
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    const parentFile = parent && parent.filename;
    if (parentFile && parentFile.includes(`${path.sep}02_statePresend${path.sep}`) && request.startsWith('../')) {
      const sibling = path.resolve(path.dirname(parentFile), '..', '01_runtime', request.slice(3));
      if (fs.existsSync(sibling) || fs.existsSync(`${sibling}.js`)) {
        return original.call(this, sibling, parent, isMain, options);
      }
    }
    if (parentFile && parentFile.includes(`${path.sep}01_runtime${path.sep}`) && request.startsWith('./statePresend/')) {
      const relocated = path.resolve(path.dirname(parentFile), '..', '02_statePresend', request.slice('./statePresend/'.length));
      if (fs.existsSync(relocated) || fs.existsSync(`${relocated}.js`)) {
        return original.call(this, relocated, parent, isMain, options);
      }
    }
    return original.call(this, request, parent, isMain, options);
  };
  try {
    return { presend: require(PRESEND_REAL) };
  } catch (error) {
    Module._resolveFilename = original;
    return { presend: null, error: error && error.message };
  }
}

const loaded = loadPresend();

function presendProbe(draft, messages) {
  if (!loaded.presend) return { ok: null, codes: [], error: loaded.error || 'presend unavailable' };
  const client = 'Explain the funded payout reset and drawdown rules.';
  let result;
  try {
    result = loaded.presend.validate(draft, {
      route: 'FULL',
      knowledge: null,
      messages: messages || [{ role: 'client', text: client }],
      state: {
        last_client_message: client,
        active_topics: ['payout', 'reset_retry', 'rules'],
        topic_changed: false,
        human_confirmed_facts: [],
        pending_questions: [],
        last_bot_replies: [],
        last_bot_reply: '',
        known_details: {},
        escalated: false,
        asked_items: [],
        answered_items: [],
      },
    });
  } catch (error) {
    return { ok: null, codes: [], error: error && error.message };
  }
  return {
    ok: result.ok,
    codes: result.hardFails.map((f) => f.code),
  };
}

const CASES = [
  {
    id: 'C01',
    group: 'supported-control',
    expect: 'allow',
    draft: 'A funded reset is available only while the account is at breakeven or in profit, and only up to 3 times.',
    why: 'Owner rule and Help Centre 17437410.',
  },
  {
    id: 'C02',
    group: 'supported-control',
    expect: 'allow',
    draft: 'A reset gives you a fresh funded account. Profit from the previous cycle is not paid.',
    why: 'Owner rule and Help Centre 17437410.',
  },
  {
    id: 'C03',
    group: 'supported-control',
    expect: 'allow',
    draft: 'On a funded account, a soft breach does not close the account. The current payout is still processed at a 30% reward share, and the payout cycle restarts from payout 1.',
    why: 'Help Centre 17437398. This is the soft-breach article, not the strategy-risk article.',
  },
  {
    id: 'C04',
    group: 'supported-control',
    expect: 'allow',
    draft: 'The first funded reset is 40% of the original challenge price before discounts, including add-ons, with a minimum of $10.',
    why: 'Help Centre 17437410.',
  },
  {
    id: 'C05',
    group: 'supported-control',
    expect: 'allow',
    draft: 'Can I reset a funded account while it is in drawdown?',
    why: 'Question, not a claim.',
  },
  {
    id: 'C06',
    group: 'supported-control',
    expect: 'allow',
    draft: 'هل تم صرف الدفعة؟',
    why: 'Arabic question.',
  },
  {
    id: 'C07',
    group: 'supported-control',
    expect: 'allow',
    draft: 'لم يتم صرف الدفعة',
    why: 'Negated Arabic disbursement.',
  },
  {
    id: 'C08',
    group: 'supported-control',
    expect: 'allow',
    draft: 'تم سحب السيولة من السوق',
    why: 'سحب is not armed without a loss or payout word.',
  },
  {
    id: 'C09',
    group: 'completion-control',
    expect: 'block_visible',
    draft: 'I restored your account.',
    why: 'English restore completion.',
  },
  {
    id: 'C10',
    group: 'completion-control',
    expect: 'block_visible',
    draft: 'تم صرف الدفعة',
    why: 'Arabic payout completion.',
  },
  {
    id: 'C11',
    group: 'completion-control',
    expect: 'block_visible',
    draft: 'Account reset kar diya hai.',
    why: 'Hinglish completion.',
  },
  {
    id: 'C12',
    group: 'completion-control',
    expect: 'block_visible',
    draft: 'Ho ripristinato il conto.',
    why: 'Italian completion.',
  },

  {
    id: 'C13',
    group: 'strategy-risk',
    expect: 'must_not_send',
    draft: 'A funded Strategy Risk breach always terminates the account and there is no reset.',
    why: 'Contradicts the owner rule (soft breach with reset, never termination) and overstates Help Centre 17437285 and 17437410, which still offer a reset.',
  },
  {
    id: 'C14',
    group: 'strategy-risk',
    expect: 'must_not_send',
    draft: 'A funded Strategy Risk breach is only a soft breach and the account is never closed.',
    why: 'Matches the owner rule, but the live Help Centre hard-breach table (17437388) says the funded instrument-risk breach closes the account, and 17437285 says it can lead to closure. Unresolved sources, so it must not ship as public copy.',
  },
  {
    id: 'C15',
    group: 'reset-condition',
    expect: 'must_not_send',
    draft: 'You can reset a funded account while it is still in drawdown, before breakeven.',
    why: 'Contradicts the owner rule and Help Centre 17437410.',
  },
  {
    id: 'C16',
    group: 'previous-cycle',
    expect: 'must_not_send',
    draft: 'After a funded reset, profit from the previous cycle is still payable.',
    why: 'Contradicts the owner rule and Help Centre 17437410.',
  },
  {
    id: 'C17',
    group: 'completed-payout',
    expect: 'must_not_send',
    draft: 'We reversed the payout you already received.',
    why: 'Owner rule: completed payouts are not reversed. No fetched Help Centre article describes reversing a completed payout.',
  },
  {
    id: 'C18',
    group: 'completed-payout',
    expect: 'must_not_send',
    draft: 'Your completed payout was cancelled after the reset and will be taken back.',
    why: 'Same owner rule. Not a reset/restore completion, so the candidate pattern does not see it.',
  },
  {
    id: 'C19',
    group: 'payout-completion',
    expect: 'must_not_send',
    draft: 'Your payout was paid yesterday.',
    why: 'English disbursement completion. The candidate comment says payout completions are blocked.',
  },
  {
    id: 'C20',
    group: 'payout-completion',
    expect: 'must_not_send',
    draft: 'Your withdrawal has been sent.',
    why: 'English withdrawal completion. sent/paid are outside EN_CLAIM.',
  },
  {
    id: 'C21',
    group: 'payout-completion',
    expect: 'must_not_send',
    draft: 'I have processed your payout.',
    why: 'First-person payout completion. processed is outside EN_CLAIM.',
  },
  {
    id: 'C22',
    group: 'program-catalyst',
    expect: 'must_not_send',
    draft: 'If you breach Catalyst at $200K you lose the $50K and $100K stages and start again from $25K. The first stage includes a free reset.',
    why: 'Help Centre 17437215: after the first stage you can buy one reset at that stage instead of starting over. The first stage has no reset. Prices are listed, not free.',
  },
  {
    id: 'C23',
    group: 'program-instant',
    expect: 'must_not_send',
    draft: 'Instant daily loss is a static 5% floor taken from the starting balance, and max loss is a soft reset that keeps your profit.',
    why: 'Help Centre 17437205 and 17437257: Instant daily loss is 3% trailing. Help Centre 17437262: daily or max loss is a hard breach and the account closes.',
  },
  {
    id: 'C24',
    group: 'program-giveaway',
    expect: 'must_not_send',
    draft: 'Giveaway and free accounts have no payout cap.',
    why: 'Help Centre 17437345: giveaway or free accounts are capped at 2% of the starting balance per payout.',
  },
  {
    id: 'C25',
    group: 'fees',
    expect: 'must_not_send',
    draft: 'Every payout, including a $100 payout, is paid through Rise and costs a $40 fee.',
    why: 'Help Centre 17437354: Rise is for $500 or more at $40. Below $500 the only method is crypto at 3%.',
  },
  {
    id: 'C26',
    group: 'consistency',
    expect: 'must_not_send',
    draft: 'On Instant, the consistency calculation does not restart after an approved payout.',
    why: 'Help Centre 17437274: the calculation restarts after every approved payout. Instant consistency is 25%.',
  },
  {
    id: 'C27',
    group: 'soft-breach',
    expect: 'must_not_send',
    draft: 'The first soft breach closes the funded account and forfeits the current payout.',
    why: 'Help Centre 17437398: the account is not closed and the current payout is still processed at 30%.',
  },
  {
    id: 'C28',
    group: 'cadence',
    expect: 'must_not_send',
    draft: '1-Step, Instant, Flash Activation and Catalyst all allow the first payout after 7 days.',
    why: 'Help Centre 17437349: 1-Step and Instant first payout is 21 days, Flash and Catalyst are 14 days.',
  },
  {
    id: 'C29',
    group: 'program-atom',
    expect: 'must_not_send',
    draft: 'A funded Atom account can request 10% of the starting balance on every payout, and there is no per-instrument risk cap.',
    why: 'Help Centre 17638456: payout cap is 3% of starting balance, and risk per instrument is max 1.5% of starting balance per day.',
  },
  {
    id: 'C30',
    group: 'drawdown',
    expect: 'must_not_send',
    draft: 'Breaching the max loss on a funded Instant account is a soft reset and the open profit stays payable.',
    why: 'Help Centre 17437262: breaching daily or max loss is a hard breach and the account is closed automatically.',
  },
  {
    id: 'C31',
    group: 'reset-fee',
    expect: 'must_not_send',
    draft: 'The first strategy-risk reset fee is 10% of the challenge price.',
    why: 'Help Centre 17437410 states 40% before discounts, including add-ons, minimum $10. 10% is not that rule.',
  },
  {
    id: 'C32',
    group: 'second-chance',
    expect: 'must_not_send',
    draft: 'Instant includes a free second chance after a funded drawdown and the reward share stays 80%.',
    why: 'Help Centre 17437224: Instant has no free retry, a funded account has no free retry, and a retry reward share is 50%.',
  },
  {
    id: 'C33',
    group: 'weekend',
    expect: 'must_not_send',
    draft: 'Weekend trading on a funded account without the add-on only reduces the reward share to 30% and the account stays on the same cycle.',
    why: 'Help Centre 17437306: on a funded account it is reset and the current cycle profit is forfeited.',
  },
  {
    id: 'C34',
    group: 'live-programme',
    expect: 'must_not_send',
    draft: 'Your 4th payout is paid out as a reward and you stay on the same funded account with the same payout cycle.',
    why: 'Help Centre 17566618: at the 4th consecutive payout the account moves to the Live Trading Programme, and the pending payout is not paid as a reward. It becomes the live starting balance. Live payouts have no cycle.',
  },
  {
    id: 'C35',
    group: 'repo-kb-stale',
    expect: 'must_not_send',
    draft: 'Crypto payouts are capped at 500 USD gross per cycle.',
    why: 'Live Help Centre 17437354 says crypto is available for any amount and is the only method below $500, at 3%. The repo FAQ still states a 500 USD gross cap. The live page does not.',
  },
  {
    id: 'C36',
    group: 'hedge-bypass',
    expect: 'must_not_send',
    draft: "After a reset, profit from the previous cycle is still payable. I can't confirm the fee.",
    why: 'HEDGE_RE matches anywhere, then the whole draft is returned, including the contradicted payout sentence.',
  },
  {
    id: 'C37',
    group: 'hedge-bypass',
    expect: 'must_not_send',
    draft: "I can't confirm the login code. You can reset a funded account while it is in drawdown.",
    why: 'Same hedge short-circuit. The reset sentence contradicts 17437410 and the owner rule.',
  },
  {
    id: 'C38',
    group: 'note-bypass',
    expect: 'must_not_send',
    draft: 'Your account was restored.',
    messages: [{ role: 'note', text: 'Do not tell the client your account was restored.' }],
    why: 'humanConfirmed uses substring includes, so a prohibition note contains the claim.',
  },
  {
    id: 'C39',
    group: 'note-bypass',
    expect: 'must_not_send',
    draft: 'I reset the account.',
    messages: [{ role: 'note', text: 'If I reset the wording in an old macro, ignore it.' }],
    why: 'The English claim span is only "I reset", and includes() matches that span inside an unrelated note.',
  },
  {
    id: 'C40',
    group: 'urdu',
    expect: 'must_not_send',
    draft: 'آپ کا اکاؤنٹ ری سیٹ کر دیا گیا ہے اور ادائیگی بھیج دی گئی ہے۔',
    why: 'Urdu completion of reset and payout. No Urdu patterns exist.',
  },
  {
    id: 'C41',
    group: 'urdu',
    expect: 'must_not_send',
    draft: 'فنڈڈ اکاؤنٹ نقصان میں ہو تو بھی ری سیٹ ہو سکتا ہے، اور پچھلے سائیکل کا منافع پھر بھی ادا کیا جائے گا۔',
    why: 'Urdu policy claim: reset while in loss, and previous-cycle profit still paid. Contradicts the owner rule and 17437410.',
  },
  {
    id: 'C42',
    group: 'arabic-gap',
    expect: 'must_not_send',
    draft: 'تم إرسال الأرباح إلى محفظتك.',
    why: 'Arabic profit-disbursement completion. الأرباح is not one of the three payout cues.',
  },
  {
    id: 'C43',
    group: 'arabic-gap',
    expect: 'must_not_send',
    draft: 'لقد أعدنا تعيين حسابك الممول.',
    why: 'Arabic reset completion without تم before إعادة تعيين.',
  },
  {
    id: 'C44',
    group: 'arabic-gap',
    expect: 'must_not_send',
    draft: 'تم تصفير الحساب الممول.',
    why: 'Arabic funded-account zeroing completion. Not in AR_RESET.',
  },
  {
    id: 'C45',
    group: 'arabic-gap',
    expect: 'must_not_send',
    draft: 'مخاطرة الاستراتيجية تغلق الحساب ولا يوجد إعادة تعيين.',
    why: 'Arabic strategy-risk termination with no reset. Contradicts the owner rule and the reset article.',
  },
  {
    id: 'C46',
    group: 'arabic-gap',
    expect: 'must_not_send',
    draft: 'بعد إعادة التعيين ما زال ربح الدورة السابقة مستحق الدفع.',
    why: 'Arabic: previous-cycle profit still payable after reset.',
  },
  {
    id: 'C47',
    group: 'arabic-question-form',
    expect: 'must_not_send',
    draft: 'تم صرف الدفعة، صحيح؟',
    why: 'Completion asserted in a sentence that ends with an Arabic question mark, so the sentence loop skips it.',
  },
  {
    id: 'C48',
    group: 'hindi',
    expect: 'must_not_send',
    draft: 'आपका पेआउट भेज दिया गया है।',
    why: 'Hindi payout completion in Devanagari. HI_CLAIM is Latin Hinglish only.',
  },
  {
    id: 'C49',
    group: 'hindi',
    expect: 'must_not_send',
    draft: 'आपका अकाउंट रीसेट हो गया है।',
    why: 'Hindi reset completion in Devanagari.',
  },
  {
    id: 'C50',
    group: 'hinglish',
    expect: 'must_not_send',
    draft: 'Drawdown mein bhi reset allowed hai aur previous cycle ka profit payable hai.',
    why: 'Hinglish future/policy claim, not ho gaya / kar diya / ho chuka. Contradicts breakeven-or-profit and previous-cycle rules.',
  },
  {
    id: 'C51',
    group: 'russian',
    expect: 'must_not_send',
    draft: 'Мы уже сбросили ваш счёт и выплата отправлена.',
    why: 'Russian reset and payout completion. No Russian patterns.',
  },
  {
    id: 'C52',
    group: 'russian',
    expect: 'must_not_send',
    draft: 'Сброс разрешён в просадке, а прибыль прошлого цикла всё ещё выплачивается.',
    why: 'Russian: reset allowed in drawdown, and previous-cycle profit is still paid.',
  },
  {
    id: 'C53',
    group: 'mixed-sentence',
    expect: 'must_not_send',
    draft: 'A funded reset is only at breakeven or in profit. After that reset, the previous cycle profit is still payable.',
    why: 'The true clause does not make the false clause sendable.',
  },
  {
    id: 'C54',
    group: 'scalp',
    expect: 'must_not_send',
    draft: 'If funded scalp profit exceeds the scalp limit, the payout is still processed at 30% and the account is not reset.',
    why: 'Help Centre 17437279: the account is reset and the current cycle profit is forfeited. The 30% share is the separate soft-breach article.',
  },
  {
    id: 'C55',
    group: 'owner-aligned-control',
    expect: 'allow',
    draft: 'A completed payout is not reversed when the funded account is later reset.',
    why: 'Owner rule. No fetched Help Centre sentence states the reverse. Not a completion claim.',
  },
];

function judge(entry, result) {
  const message = String(result.clientMessage == null ? '' : result.clientMessage);
  const silentBlock = result.silent === true || result.action === 'skip' || (result.action === 'block' && !message.trim());
  const sendsDraft = result.action === 'allow' && message === entry.draft;
  if (entry.expect === 'allow') {
    if (sendsDraft && result.silent === false) return { verdict: 'PASS', slip: false };
    return { verdict: 'FAIL', slip: false, detail: 'supported draft was not returned unchanged' };
  }
  if (entry.expect === 'block_visible') {
    if (result.action === 'block' && result.silent === false && message.trim() && message !== entry.draft) {
      return { verdict: 'PASS', slip: false };
    }
    if (sendsDraft) return { verdict: 'CRITICAL', slip: true, detail: 'completion claim returned as the client message' };
    if (silentBlock) return { verdict: 'FAIL', slip: false, detail: 'block was silent or empty' };
    return { verdict: 'FAIL', slip: false, detail: 'completion was not visibly replaced' };
  }
  if (sendsDraft) return { verdict: 'CRITICAL', slip: true, detail: 'unsupported payout or reset text returned as the client message' };
  if (silentBlock) return { verdict: 'FAIL', slip: false, detail: 'unsafe draft was dropped silently' };
  if (result.action === 'block' && result.silent === false && message.trim() && !message.includes(entry.draft)) {
    return { verdict: 'PASS', slip: false };
  }
  return { verdict: 'FAIL', slip: false, detail: 'unsafe draft was not clearly replaced' };
}

const rows = CASES.map((entry) => {
  const result = guard.evaluateResetRestoreClaim({ draft: entry.draft, messages: entry.messages, topic: 'payout' });
  const live = presendProbe(entry.draft, entry.messages);
  const judged = judge(entry, result);
  const integrationSlip = entry.expect === 'block_visible' && live.ok === true;
  if (integrationSlip) {
    judged.verdict = 'CRITICAL';
    judged.slip = true;
    judged.detail = 'The guard blocks this completion. The pre-send path does not call the guard, and presend.validate returns ok, so the completion would be posted.';
  }
  const completionHit = gap.COMPLETION_CLAIM_RE.test(entry.draft);
  return {
    id: entry.id,
    group: entry.group,
    expect: entry.expect,
    verdict: judged.verdict,
    slip: judged.slip,
    detail: judged.detail || '',
    why: entry.why,
    action: result.action,
    reason: result.reason,
    silent: result.silent,
    clientMessageIsDraft: result.clientMessage === entry.draft,
    hedgeKept: result.hedgeKept,
    claimCount: Array.isArray(result.claims) ? result.claims.length : 0,
    livePresendOk: live.ok,
    livePresendCodes: live.codes,
    livePresendError: live.error || '',
    existingCompletionRegex: completionHit,
    integrationSlip,
    draft: entry.draft,
  };
});

function absent(needle) {
  const files = [INDEX_JS, PRESEND_REAL, STATE_PRESEND];
  return files.every((file) => !fs.readFileSync(file, 'utf8').includes(needle));
}

let gitAll = '';
try {
  gitAll = execSync('git log --all --oneline', { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  gitAll = String(error && error.message);
}
const r6Mention = /9e6a8328|e85de2a7|t800-payout-r6|payout R6/.test(gitAll);

const summary = {
  reviewedCommit: 'e1ad101383dc648002f416e9aaae05cc3d85e140',
  candidateNotReferencedFromPresend: absent('payoutClaimGuard') && absent('evaluateResetRestoreClaim'),
  runtimeStatePresendDirectory: fs.existsSync(path.join(ROOT, 'luna-current/01_runtime/statePresend')),
  presendProbeLoaded: !!loaded.presend,
  presendProbeError: loaded.error || '',
  r6OrSealedHashInGitLog: r6Mention,
  authorTestsUsedAsEvidence: false,
  counts: rows.reduce((acc, row) => {
    acc[row.verdict] = (acc[row.verdict] || 0) + 1;
    return acc;
  }, {}),
  criticalIds: rows.filter((row) => row.verdict === 'CRITICAL').map((row) => row.id),
  liveShipCriticalIds: rows.filter((row) => row.verdict === 'CRITICAL' && row.livePresendOk === true).map((row) => row.id),
  unwiredCompletionIds: rows.filter((row) => row.integrationSlip).map((row) => row.id),
  silentBlocks: rows.filter((row) => row.action === 'block' && (row.silent === true || row.clientMessageIsDraft)).map((row) => row.id),
};

const output = { summary, rows };
const outPath = path.join(__dirname, 'adversarialResults.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(JSON.stringify(summary, null, 2));
for (const row of rows) {
  if (row.verdict === 'PASS') continue;
  console.log([row.verdict, row.id, row.group, row.action, row.reason, 'liveOk=' + row.livePresendOk, (row.livePresendCodes || []).join('|')].join(' '));
}
