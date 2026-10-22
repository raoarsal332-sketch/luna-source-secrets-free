'use strict';

const FIXED = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
  it: 'Un collega ha ora questa conversazione.',
});
const ACCOUNT = Object.freeze({
  en: 'For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed.',
  ur: 'MT5 پر اکاؤنٹ نمبر اس ای میل میں ہے جو ٹریڈنگ لاگ اِن کے ساتھ بھیجی گئی تھی۔ یہ تفصیلات تبدیل نہیں ہوتیں۔',
  ar: 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغيَّر.',
  hi: 'MT5 पर खाता नंबर उस ईमेल में है जो ट्रेडिंग लॉगिन के साथ भेजी गई थी। ये विवरण बदले नहीं जाते।',
  it: "Su MT5 il numero di conto è nell'email inviata con i dati di accesso. Questi dati non si cambiano.",
  hinglish: 'MT5 par account number us email mein hai jo trading login ke sath bheji gayi thi. Yeh details change nahi hoti.',
});
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const STATUS = "I don't have an open update on this conversation. What would you like me to check?";
const STATUS_HTML = 'Hello,<br><br>' + STATUS;
const CLARIFIER = 'Please tell me which challenge you mean.';

function fixedHits(bodies) {
  const lines = Object.values(FIXED);
  return (bodies || []).filter((b) => lines.includes(String(b || '').replace(/\s+/g, ' ').trim()));
}

function replyTypes(writes) {
  const out = [];
  for (const w of writes || []) {
    if (w.method !== 'post' || String(w.url || '').indexOf('/reply') === -1) continue;
    try {
      const parsed = JSON.parse(w.body);
      if (parsed && parsed.message_type) out.push(parsed.message_type);
    } catch (_) { /* not json */ }
  }
  return out;
}

function includesSeq(have, want) {
  let i = 0;
  for (const item of have) {
    if (item === want[i]) i += 1;
    if (i === want.length) return true;
  }
  return false;
}

function arabicShaddaOk(text) {
  const s = String(text || '');
  const good = s.indexOf('ي\u064E\u0651') !== -1;
  const bad = s.indexOf('ي\u0651\u064E') !== -1;
  return good && !bad;
}

function evaluate(cse, result) {
  const expect = cse.expect || {};
  const failures = [];
  const bodies = result.publicBodies || [];
  const notes = result.noteBodies || [];
  const hits = fixedHits(bodies);
  const add = (cls, detail) => failures.push({ class: cls, detail });

  if (result.threw) add('defect', 'webhook threw: ' + result.threw);
  if (result.webhookErr && expect.webhookErr !== true) add('defect', 'webhook or presend error in log');
  if ((result.leaks || []).length) add('product-critical', 'credential leak: ' + result.leaks.join(','));
  if ((result.tripwires || []).length) add('product-critical', 'network tripwire: ' + result.tripwires.map((t) => t.name).join(','));
  if (hits.length > 1) add('product-critical', 'duplicate fixed public line (' + hits.length + ')');

  if (hits.length && expect.allowUnverifiedFixed !== true) {
    const types = replyTypes(result.writes);
    const assignAt = types.indexOf('assignment');
    const commentAt = types.indexOf('comment');
    const held = !!expect.seatAlreadyHeld;
    if (!held && (assignAt === -1 || (commentAt !== -1 && assignAt > commentAt))) {
      add('product-critical', 'fixed line without a verified assignment write before it');
    }
  }

  if (expect.publicCount != null && bodies.length !== expect.publicCount) {
    add(expect.failClass || 'defect', 'public count ' + bodies.length + ' != ' + expect.publicCount);
  }
  if (expect.publicCountMax != null && bodies.length > expect.publicCountMax) {
    add(expect.failClass || 'defect', 'public count ' + bodies.length + ' > ' + expect.publicCountMax);
  }
  if (expect.publicCountMin != null && bodies.length < expect.publicCountMin) {
    add(expect.failClass || 'defect', 'public count ' + bodies.length + ' < ' + expect.publicCountMin);
  }
  if (expect.fixedCount != null && hits.length !== expect.fixedCount) {
    const cls = hits.length > expect.fixedCount && expect.ifFixed ? expect.ifFixed : (expect.failClass || 'defect');
    add(cls, 'fixed-line count ' + hits.length + ' != ' + expect.fixedCount);
  }
  if (expect.fixedLang) {
    const want = expect.fixedLang === 'hinglish' ? FIXED.ur : FIXED[expect.fixedLang];
    if (hits.length !== 1 || hits[0] !== want) {
      add(expect.failClass || 'product-critical', 'fixed line is not byte-exact ' + expect.fixedLang);
    }
  }
  if (expect.bodyEquals != null) {
    if (bodies.length !== 1 || bodies[0] !== expect.bodyEquals) {
      add(expect.failClass || 'defect', 'public body is not the expected bytes');
    }
  }
  for (const needle of expect.bodyIncludes || []) {
    if (!bodies.some((b) => String(b).includes(needle))) add(expect.failClass || 'defect', 'public body missing ' + JSON.stringify(needle).slice(0, 80));
  }
  for (const needle of expect.bodyExcludes || []) {
    if (bodies.some((b) => String(b).includes(needle)) || notes.some((b) => String(b).includes(needle))) {
      add(expect.failClass || 'product-critical', 'forbidden text present: ' + JSON.stringify(needle).slice(0, 80));
    }
  }
  if (expect.noteCountMax != null && notes.length > expect.noteCountMax) {
    add(expect.failClass || 'defect', 'note count ' + notes.length + ' > ' + expect.noteCountMax);
  }
  if (expect.noteCountMin != null && notes.length < expect.noteCountMin) {
    add(expect.failClass || 'defect', 'note count ' + notes.length + ' < ' + expect.noteCountMin);
  }
  if (expect.replyTypes) {
    const got = replyTypes(result.writes);
    if (got.join(',') !== expect.replyTypes.join(',')) {
      add(expect.failClass || 'defect', 'reply sequence ' + got.join(',') + ' != ' + expect.replyTypes.join(','));
    }
  }
  if (expect.replyIncludes) {
    if (!includesSeq(replyTypes(result.writes), expect.replyIncludes)) {
      add(expect.failClass || 'defect', 'reply sequence missing ' + expect.replyIncludes.join(','));
    }
  }
  if (expect.aiOff != null && result.aiOff !== expect.aiOff) {
    add(expect.failClass || 'product-critical', 'aiOff ' + result.aiOff + ' != ' + expect.aiOff);
  }
  if (expect.arabicShadda) {
    const blob = bodies.join('\n');
    if (!arabicShaddaOk(blob)) add(expect.failClass || 'defect', 'Arabic account line is not fatha-then-shadda on yeh');
  }
  if (expect.accountLine) {
    const line = ACCOUNT[expect.accountLine];
    if (!bodies.some((b) => String(b).includes(line))) {
      add(expect.failClass || 'defect', 'account line ' + expect.accountLine + ' missing from public body');
    }
  }
  if (expect.hedgeExact) {
    if (bodies.length !== 1 || bodies[0] !== HEDGE) add(expect.failClass || 'defect', 'number hedge is not byte-exact');
  }
  if (expect.statusExact) {
    if (bodies.length !== 1 || bodies[0] !== STATUS_HTML) add(expect.failClass || 'defect', 'status clarifier is not byte-exact');
  }

  const classes = [...new Set(failures.map((f) => f.class))];
  return {
    id: cse.id,
    pass: failures.length === 0,
    failures,
    classes,
    fixedCount: hits.length,
    publicCount: bodies.length,
    noteCount: notes.length,
    aiOff: result.aiOff,
    leaks: result.leaks || [],
    tripwires: (result.tripwires || []).map((t) => t.name),
  };
}

function signature(result) {
  const bodies = (result.publicBodies || []).map((b) => String(b).replace(/\s+/g, ' ').trim());
  const types = replyTypes(result.writes);
  return JSON.stringify({
    public: bodies,
    notes: (result.noteBodies || []).length,
    types,
    aiOff: result.aiOff,
    threw: result.threw || null,
    fixed: fixedHits(result.publicBodies || []).length,
  });
}

module.exports = {
  FIXED, ACCOUNT, HEDGE, STATUS, STATUS_HTML, CLARIFIER, evaluate, signature, fixedHits, replyTypes,
};
