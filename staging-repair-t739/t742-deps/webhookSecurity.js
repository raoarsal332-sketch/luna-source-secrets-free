'use strict';

const crypto = require('crypto');

function captureRawBody(req, _res, buf) {
  if (req.originalUrl && req.originalUrl.split('?')[0] === '/webhook') {
    req.rawBody = Buffer.from(buf || Buffer.alloc(0));
  }
}

function verifySignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || !/^sha1=[a-f0-9]{40}$/i.test(String(signature || ''))) return false;
  const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let warnedMissing = false;

function middleware() {
  return function verifyIntercomWebhook(req, res, next) {
    const mode = String(process.env.LUNA_WEBHOOK_SIGNATURE_MODE || 'when_configured').toLowerCase();
    if (mode === 'off') return next();
    // 'observe': verify and LOG the outcome, but never reject. This exists so promotion
    // readiness can be evidenced on real traffic without risking live deliveries: run in
    // observe, confirm WEBHOOK_SIGNATURE_OBSERVE reports present+valid, then switch to
    // enforce. It logs only presence and the verdict, never the header or the body.
    if (mode === 'observe') {
      const s2 = process.env.INTERCOM_WEBHOOK_SECRET || process.env.INTERCOM_CLIENT_SECRET || '';
      const header = req.get('X-Hub-Signature');
      const present = !!header;
      const shape = /^sha1=[a-f0-9]{40}$/i.test(String(header || ''));
      const valid = present && shape && verifySignature(req.rawBody, header, s2);
      console.log('WEBHOOK_SIGNATURE_OBSERVE', JSON.stringify({
        secretConfigured: !!s2,
        headerPresent: present,
        shapeOk: shape,
        rawBodyCaptured: Buffer.isBuffer(req.rawBody),
        verified: valid,
      }));
      return next();
    }
    const secret = process.env.INTERCOM_WEBHOOK_SECRET || process.env.INTERCOM_CLIENT_SECRET || '';
    if (!secret) {
      if (mode === 'enforce') return res.status(503).json({ ok: false, error: 'webhook verification is not configured' });
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn('WEBHOOK_SIGNATURE not configured; set INTERCOM_WEBHOOK_SECRET and LUNA_WEBHOOK_SIGNATURE_MODE=enforce');
      }
      return next();
    }
    if (!verifySignature(req.rawBody, req.get('X-Hub-Signature'), secret)) {
      console.warn('WEBHOOK_SIGNATURE rejected');
      return res.status(401).json({ ok: false, error: 'invalid webhook signature' });
    }
    return next();
  };
}

module.exports = { captureRawBody, verifySignature, middleware };
