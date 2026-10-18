'use strict';
/* node tests/run-paraphrases.js [--verbose] [--json out.json] [--no-force] */
const path = require('path');
process.env.LUNA_PACKS_APPROVED_ANSWERS = path.join(__dirname, '..', 'faq-approved-answers-packs-v1.json');
const sel = require('../packsAnswerSelect');
const { GENERAL, STATE } = require('./paraphrases');

const verbose = process.argv.includes('--verbose');
const jsonIdx = process.argv.indexOf('--json');
const jsonOut = jsonIdx > 0 ? process.argv[jsonIdx + 1] : null;
const force = !process.argv.includes('--no-force');
const gate = { language: 'en', confident: true, allowsAnswer: true };
const short = (id) => (id || '').replace(/^packs\./, '').replace(/\.en$/, '');
const PRODUCT_BLOCK = new Set(['account-status.refuse', 'handoff.unverified']);

(async () => {
  const out = { general: { n: 0, correct: 0, falseRefusal: 0, wrong: 0, noAnswer: 0 }, state: { n: 0, safe: 0, leaks: 0 }, fails: [], leaks: [] };
  for (const c of GENERAL) {
    const r = await sel.selectPacksAnswer(c.q, { packsEnabled: true, forcePacks: force, languageGate: gate });
    out.general.n += 1;
    const got = r.abstain ? null : short(r.answerId);
    const ok = got && (got === c.id || c.also.includes(got));
    if (ok) out.general.correct += 1;
    else if (!got) {
      out.general.noAnswer += 1;
      out.general.falseRefusal += 1;
      out.fails.push({ kind: 'abstain', q: c.q, want: c.id, got: 'ABSTAIN:' + r.reason, gate: r.pregateKind });
    } else if (PRODUCT_BLOCK.has(got)) {
      out.general.falseRefusal += 1;
      out.fails.push({ kind: 'refusal', q: c.q, want: c.id, got, gate: r.pregateKind, why: r.pregateReason });
    } else {
      out.general.wrong += 1;
      out.fails.push({ kind: 'wrong', q: c.q, want: c.id, got });
    }
  }
  for (const q of STATE) {
    const r = await sel.selectPacksAnswer(q, { packsEnabled: true, forcePacks: force, languageGate: gate });
    out.state.n += 1;
    const got = r.abstain ? null : short(r.answerId);
    const safe = !got || PRODUCT_BLOCK.has(got) || got === 'refunds-legal' || got === 'missing-reward';
    // refund/missing routing for a STATE question is a dedicated approved answer, not a product assertion
    const strictSafe = !got || PRODUCT_BLOCK.has(got);
    if (safe) out.state.safe += 1;
    if (!safe) {
      out.state.leaks += 1;
      out.leaks.push({ q, got });
    } else if (verbose && !strictSafe) {
      out.leaks.push({ q, got, note: 'dedicated-intent-answer' });
    }
  }
  const g = out.general;
  const pct = (a, b) => ((100 * a) / b).toFixed(1) + '%';
  console.log(`GENERAL n=${g.n} correct=${g.correct} (${pct(g.correct, g.n)}) falseRefusal=${g.falseRefusal} (${pct(g.falseRefusal, g.n)}) wrong=${g.wrong} (${pct(g.wrong, g.n)})`);
  console.log(`STATE   n=${out.state.n} safe=${out.state.safe} productLeaks=${out.state.leaks}`);
  for (const f of out.fails) console.log(`  [${f.kind}] ${f.q}\n      want=${f.want} got=${f.got}${f.gate ? ' gate=' + f.gate : ''}${f.why ? ' why=' + f.why : ''}`);
  for (const l of out.leaks) console.log(`  [LEAK/note] ${l.q} -> ${l.got}${l.note ? ' (' + l.note + ')' : ''}`);
  if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify(out, null, 2));
})();
