'use strict';
/** A bounded public answer when a general product-rules ask is wrongly escalated. */
const fs = require('fs');
const path = require('path');

const LITE_2_STEP_ID = '12683646-lite-2-step-challenge';
const LITE_2_STEP_HASH = 'ae10cdf2375d45163c66fe909893ae44e9b75f48c3ea62579915fa1f9a0441a7';

function isLite2StepRulesAsk(text) {
  const t = String(text || '').toLowerCase();
  return /\b(?:2[\s-]*step\s+lite|lite\s*2[\s-]*step)\b/.test(t) &&
    /\b(?:rules?|details?|conditions?|requirements?|explain|how\s+does|what\s+is|tell\s+me\s+about)\b/.test(t) &&
    !/\b(?:my\s+account|account\s*(?:#|number|id)|breach(?:ed)?|payout\s+(?:pending|missing|rejected)|check\s+my|review\s+my)\b/.test(t);
}

function lite2StepOverview(root) {
  try {
    const file = path.join(root || '/home/ubuntu', 'luna-knowledge/canonical/entries', LITE_2_STEP_ID + '.json');
    const e = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Do not continue quoting a snapshot after the active official article changes.
    if (!e.active || e.sourceHash !== LITE_2_STEP_HASH) return '';
    // REPLY_DESIGN_V1 (2026-09-28): same approved facts, restyled to the reply design system (official name
    // Lite 2-Step, major-topic headings, one labelled idea per bullet, documented default first (standard 14 days
    // between payouts, FX 1:30 standard), ranges instead of full option lists on an overview).
    return [
      'Lite 2-Step is a two-phase evaluation followed by the live phase, with no Second Chance.',
      '',
      '[[Structure and Evaluation]]',
      '• **Phases:** Phase 1, Phase 2, then the live phase.',
      '• **Phase 1 target:** Default **10%**, with other targets selectable at checkout.',
      '• **Phase 2 target:** Fixed at 5%.',
      '• **Profitable days:** At least 3 profitable days in each evaluation phase, each with positive P&L of at least 0.5% of the account size.',
      '',
      '[[Drawdowns]]',
      '• **Daily loss:** Fixed at **4%**, calculated at end of day from equity or balance.',
      '• **Max loss:** Static drawdown, with the limit chosen at checkout (see the option selected for your account).',
      '',
      '[[Live Phase and Payouts]]',
      '• **Live phase:** Trade at least 3 days, with no additional profit target.',
      '• **Profit split:** Default **80%**, with other splits selectable at checkout.',
      '• **Payout cycle:** Standard **14 days** between payouts, and you can choose a different cycle. The first payout is requestable after 21 days.',
      '',
      '[[Add-ons and Retry]]',
      '• **Leverage:** FX leverage is 1:30 as standard, with 1:50 or 1:100 selectable.',
      '• **Scalping add-on:** Optional, lowers the minimum holding time from 3 minutes to 30 seconds.',
      '• **Weekend add-on:** Optional, allows orders during the weekend.',
      '• **Second Chance:** Not included, so a breach during either evaluation phase loses that challenge account.',
    ].join('\n');
  } catch (_) { return ''; }
}

module.exports = { isLite2StepRulesAsk, lite2StepOverview };
