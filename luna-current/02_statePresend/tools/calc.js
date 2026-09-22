'use strict';

/**
 * tools/calc.js - deterministic, read-only calculator. No eval.
 *
 * calc({ op: 'expr', expression: '10% of 100000' })
 * calc({ op: 'percent_of', percent: 10, base: 100000 })
 * calc({ op: 'percent_change', from: 100000, to: 108000 })
 * calc({ op: 'challenge_target', balance: 100000, target_percent: 8 })
 * calc({ op: 'days_between', from: '2026-09-01', to: '2026-09-16' })
 * calc({ op: 'add_days', date: '2026-09-16', days: 14 })
 * calc({ op: 'now', timezone: 'Europe/London' })
 * calc({ op: 'business_days_between', from, to })
 */

function tokenize(expr) {
  // thousands separators (100,000) are dropped; other commas separate function args
  const src = String(expr).toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/\bof\b/g, '*').replace(/\bx\b/g, '*').replace(/×/g, '*').replace(/÷/g, '/');
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      // parseFloat silently stops at a second '.' (e.g. "1.2.3" -> 1.2); reject that outright
      // instead of returning a truncated, wrong value for a tool meant to be exact.
      if ((raw.match(/\./g) || []).length > 1) throw new Error(`bad number "${raw}"`);
      let num = parseFloat(raw);
      if (Number.isNaN(num)) throw new Error('bad number');
      i = j;
      if (src[i] === '%') { num = num / 100; i++; out.push({ t: 'num', v: num, pct: true }); continue; }
      if (src[i] === 'k' && !/[a-z]/.test(src[i + 1] || '')) { num *= 1000; i++; }
      out.push({ t: 'num', v: num });
      continue;
    }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (/[a-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-z_]/.test(src[j])) j++;
      const name = src.slice(i, j);
      if (!['round', 'floor', 'ceil', 'abs', 'min', 'max', 'sqrt'].includes(name)) throw new Error(`unknown token "${name}"`);
      out.push({ t: 'fn', v: name });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return out;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function expr() {
    let left = term();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      const right = term();
      // "100 + 10%" => 100 * 1.10
      if (right.pct && !left.pct) {
        left = { v: op === '+' ? left.v * (1 + right.v) : left.v * (1 - right.v) };
      } else if (left.pct && !right.pct) {
        // Keep '+' commutative: "10% + 500" must equal "500 + 10%" (both = 550), not 500.1.
        if (op === '+') left = { v: right.v * (1 + left.v) };
        else throw new Error('ambiguous expression: write "<amount> - <percent>%", not "<percent>% - <amount>"');
      } else {
        left = { v: op === '+' ? left.v + right.v : left.v - right.v };
      }
    }
    return left;
  }
  function term() {
    let left = factor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      const right = factor();
      if (op === '/' && right.v === 0) throw new Error('division by zero');
      left = { v: op === '*' ? left.v * right.v : left.v / right.v };
    }
    return left;
  }
  function factor() {
    let base = unary();
    if (peek() && peek().t === 'op' && peek().v === '^') { next(); const e = unary(); base = { v: Math.pow(base.v, e.v) }; }
    return base;
  }
  function unary() {
    const tk = peek();
    if (tk && tk.t === 'op' && tk.v === '-') { next(); const u = unary(); return { v: -u.v, pct: u.pct }; }
    if (tk && tk.t === 'op' && tk.v === '+') { next(); return unary(); }
    return primary();
  }
  function primary() {
    const tk = next();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') return { v: tk.v, pct: tk.pct };
    if (tk.t === 'fn') {
      const open = next();
      if (!open || open.v !== '(') throw new Error('expected (');
      const args = [expr()];
      while (peek() && peek().t === 'op' && peek().v === ',') { next(); args.push(expr()); }
      const close = next();
      if (!close || close.v !== ')') throw new Error('expected )');
      const vals = args.map((a) => a.v);
      const fns = { round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt };
      return { v: fns[tk.v](...vals) };
    }
    if (tk.t === 'op' && tk.v === '(') { const e = expr(); const close = next(); if (!close || close.v !== ')') throw new Error('expected )'); return e; }
    throw new Error(`unexpected token "${tk.v}"`);
  }
  const r = expr();
  if (pos !== tokens.length) throw new Error('trailing tokens');
  return r.v;
}

function evaluate(expression) {
  if (typeof expression !== 'string' || expression.length > 200) throw new Error('expression must be a string up to 200 chars');
  return parse(tokenize(expression));
}

function parseDate(d, tz) {
  if (d === 'now' || d === 'today') return new Date();
  if (d === undefined || d === null || d === '') throw new Error('date required');
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d > 1e12 ? d : d * 1000);
  const s = String(d).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error(`unparseable date "${s}"`);
  return new Date(t);
}

function dayStartUTC(d) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

function daysBetween(a, b) { return Math.round((dayStartUTC(b) - dayStartUTC(a)) / 86400000); }

function businessDaysBetween(a, b) {
  let from = new Date(dayStartUTC(a));
  const to = dayStartUTC(b);
  let n = 0;
  const step = from.getTime() <= to ? 1 : -1;
  while (from.getTime() !== to) {
    from = new Date(from.getTime() + step * 86400000);
    const wd = from.getUTCDay();
    if (wd !== 0 && wd !== 6) n += step;
  }
  return n;
}

function fmtDate(d, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', timeZoneName: 'short' }).format(d);
  } catch (e) {
    throw new Error(`invalid timezone "${tz}"`);
  }
}

function round2(x) { return Math.round(x * 100) / 100; }

function requiredFinite(v, name) {
  if (v === undefined || v === null || v === '') throw new Error(`${name} required`);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  return n;
}

function assertFiniteOutput(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k} is not a finite result`);
  }
  return obj;
}

function requiredDate(v, name) {
  if (v === undefined || v === null || v === '') throw new Error(`${name} required`);
  return parseDate(v);
}

function calc(input) {
  const p = input || {};
  const op = p.op || (p.expression ? 'expr' : null);
  try {
    switch (op) {
      case 'expr': {
        const result = round2(evaluate(p.expression));
        return assertFiniteOutput({ ok: true, op, result, expression: p.expression });
      }
      case 'percent_of': {
        const percent = requiredFinite(p.percent, 'percent');
        const base = requiredFinite(p.base, 'base');
        return assertFiniteOutput({ ok: true, op, result: round2(percent / 100 * base) });
      }
      case 'percent_change': {
        const from = requiredFinite(p.from, 'from');
        const to = requiredFinite(p.to, 'to');
        if (from === 0) throw new Error('from must be non-zero');
        return assertFiniteOutput({ ok: true, op, result: round2((to - from) / Math.abs(from) * 100), unit: '%' });
      }
      case 'challenge_target': {
        const bal = requiredFinite(p.balance, 'balance');
        const pct = requiredFinite(p.target_percent, 'target_percent');
        if (!(bal > 0) || !(pct >= 0)) throw new Error('balance and target_percent required');
        const target = round2(bal * pct / 100);
        const extra = p.current_balance !== undefined
          ? { remaining: round2(bal + target - requiredFinite(p.current_balance, 'current_balance')), progress_percent: round2((requiredFinite(p.current_balance, 'current_balance') - bal) / target * 100) }
          : {};
        return assertFiniteOutput({ ok: true, op, profit_target: target, target_balance: round2(bal + target), balance: bal, target_percent: pct, ...extra });
      }
      case 'days_between': {
        const a = requiredDate(p.from, 'from');
        const b = requiredDate(p.to, 'to');
        return assertFiniteOutput({ ok: true, op, days: daysBetween(a, b), from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) });
      }
      case 'business_days_between': {
        const a = requiredDate(p.from, 'from');
        const b = requiredDate(p.to, 'to');
        return assertFiniteOutput({ ok: true, op, business_days: businessDaysBetween(a, b) });
      }
      case 'add_days': {
        const a = requiredDate(p.date, 'date');
        const days = requiredFinite(p.days, 'days');
        const r = new Date(a.getTime() + days * 86400000);
        if (Number.isNaN(r.getTime())) throw new Error('invalid result date');
        return { ok: true, op, date: r.toISOString().slice(0, 10), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.getUTCDay()], formatted: fmtDate(r, p.timezone) };
      }
      case 'now': {
        const d = (p.date === undefined || p.date === null || p.date === '') ? new Date() : parseDate(p.date);
        return { ok: true, op, iso: d.toISOString(), formatted: fmtDate(d, p.timezone || 'UTC'), timezone: p.timezone || 'UTC' };
      }
      default: throw new Error(`unknown op "${op}"`);
    }
  } catch (e) {
    return { ok: false, op, error: e.message };
  }
}

const spec = {
  name: 'calc',
  description: 'Deterministic calculator for arithmetic, percentages, challenge profit targets and date/day-count questions. Use only when a number must be exact.',
  parameters: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['expr', 'percent_of', 'percent_change', 'challenge_target', 'days_between', 'business_days_between', 'add_days', 'now'] },
      expression: { type: 'string', description: 'For op=expr, e.g. "8% of 100000" or "(100000*0.08)/2"' },
      percent: { type: 'number' }, base: { type: 'number' }, from: { type: ['number', 'string'] }, to: { type: ['number', 'string'] },
      balance: { type: 'number' }, target_percent: { type: 'number' }, current_balance: { type: 'number' },
      date: { type: 'string' }, days: { type: 'number' }, timezone: { type: 'string' },
    },
    required: ['op'],
  },
};

module.exports = { calc, evaluate, tokenize, parseDate, daysBetween, businessDaysBetween, spec };
