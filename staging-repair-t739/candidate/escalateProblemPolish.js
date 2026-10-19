"use strict";

/**
 * Escalate note Problem polish helpers (ticket 215476045948325).
 * Problem must be an own-words summary of what the client actually needs —
 * never substitute "missing account number/email" as the Problem when the
 * client already stated a concrete issue (paid/no credentials, breach, payout…).
 * Missing identifiers belong in Extra/context only.
 */

const MISSING_ID_AS_PROBLEM_RE =
  /\b(?:the\s+)?(?:customer'?s?\s+|client'?s?\s+)?(?:account\s*(?:number|#|id)?|email|registered\s+e-?mail)(?:\s+is|\s+was)?\s+missing\b|\bmissing\s+(?:the\s+)?(?:customer'?s?\s+|client'?s?\s+)?(?:account\s*(?:number|#|id)?|email|registered\s+e-?mail)\b|\bfurther\s+details\s+(?:are|is)\s+needed\s+to\s+identify\s+(?:the\s+)?account\b|\bneed(?:s)?\s+(?:the\s+)?(?:account\s*(?:number|#|id)|email)\s+to\s+(?:identify|locate|find)\b/i;

const CONCRETE_ISSUE_RE =
  /\b(?:paid|payment|custom\s+link)\b|\b(?:i\s+)?pay\b|\b(?:didn'?t|dont|don'?t|haven'?t|hasn'?t|never|not)\s+rec(?:ei|ie)?v\w*\b|\bno\s+(?:account|credentials?)\b|\bdon'?t\s+rec(?:ei|ie)?v\w*\b|\b(?:breach(?:ed)?|payout|withdraw\w*|refund|kyc|login|password|credentials?|chargeback|bought|purchased|payment\s+confirm)\b/i;

function looksLikeMissingIdAsProblem(text) {
  return MISSING_ID_AS_PROBLEM_RE.test(String(text || ""));
}

function hasUsableAccount(account) {
  const a = String(account || "").trim();
  if (!a) return false;
  if (/^not\s+provided$/i.test(a)) return false;
  return true;
}

function pickConcreteClientIssue(clientTexts) {
  const list = Array.isArray(clientTexts) ? clientTexts : [];
  const scored = [];
  for (const raw of list) {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (!t || t.length < 8) continue;
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)) continue;
    if (/^\d{4,10}$/.test(t)) continue;
    if (!CONCRETE_ISSUE_RE.test(t)) continue;
    let score = 1;
    if (/\b(?:paid|payment|custom\s+link)\b/i.test(t)) score += 3;
    if (/\b(?:receiv|account|credentials?)\b/i.test(t)) score += 2;
    if (/\b(?:breach|payout|withdraw|refund|kyc)\b/i.test(t)) score += 2;
    if (t.length > 40) score += 1;
    scored.push({ t, score });
  }
  if (!scored.length) return "";
  scored.sort((a, b) => b.score - a.score || b.t.length - a.t.length);
  return scored[0].t.slice(0, 400);
}

function summarizeConcreteIssueFallback(clientIssue) {
  const t = String(clientIssue || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (
    (/\b(?:paid|payment|custom\s+link)|\b(?:i\s+)?pay\b/i.test(t)) &&
    (/\brec(?:ei|ie)?v|\baccount|\bcredentials?/i.test(t))
  ) {
    const viaLink = /\bcustom\s+link\b/i.test(t);
    const onFriday = /\bfriday\b/i.test(t);
    if (viaLink && onFriday) {
      return "Client says they paid via a custom payment link on Friday but have not received their trading account credentials.";
    }
    if (viaLink) {
      return "Client says they paid via a custom payment link but have not received their trading account credentials.";
    }
    if (onFriday) {
      return "Client says they paid on Friday but have not received their trading account credentials.";
    }
    return "Client says they paid but have not received their trading account credentials.";
  }
  if (/\bbreach/i.test(t)) {
    return "Client reports an account breach / rule violation and needs a teammate review.";
  }
  if (/\bpayout|withdraw/i.test(t)) {
    return "Client needs help with a payout / withdrawal on their account.";
  }
  if (/\bkyc|verif/i.test(t)) {
    return "Client needs help with KYC / verification on their account.";
  }
  if (/\blogin|password|credentials?/i.test(t)) {
    return "Client needs help accessing their account (login / credentials).";
  }
  return "Client needs teammate help with: " + t.slice(0, 280);
}

/**
 * Repair a draft Problem that wrongly centers missing identifiers.
 * @returns {{ problem: string, repaired: boolean, reason?: string }}
 */
function repairEscalateProblemSummary(problemText, opts = {}) {
  const raw = String(problemText || "").trim();
  const account = opts.account;
  const clientTexts = Array.isArray(opts.clientTexts) ? opts.clientTexts : [];
  const missingId = looksLikeMissingIdAsProblem(raw);
  const concreteClient = pickConcreteClientIssue(clientTexts);
  const concreteInProblem = CONCRETE_ISSUE_RE.test(raw) && !missingId;
  const accountKnown = hasUsableAccount(account);

  if (!missingId && (concreteInProblem || (!concreteClient && raw))) {
    return { problem: raw, repaired: false };
  }

  if (missingId && (concreteClient || accountKnown)) {
    let problem = concreteClient
      ? summarizeConcreteIssueFallback(concreteClient)
      : "Client needs teammate review of their account issue.";
    if (looksLikeMissingIdAsProblem(problem)) {
      problem = "Client needs teammate review of their account issue.";
    }
    if (!accountKnown && !/\bExtra:/i.test(problem)) {
      problem = problem.replace(/\s+$/, "") + " Extra: account number was not provided in chat.";
    }
    return { problem, repaired: true, reason: "missing_id_substituted" };
  }

  if (missingId && !concreteClient && !accountKnown) {
    return {
      problem:
        "Client needs teammate help identifying their case. Extra: account number was not provided in chat.",
      repaired: true,
      reason: "missing_id_only_softened",
    };
  }

  if (concreteClient && (!raw || /^client needs backend/i.test(raw))) {
    return {
      problem: summarizeConcreteIssueFallback(concreteClient),
      repaired: true,
      reason: "filled_from_client",
    };
  }

  return { problem: raw, repaired: false };
}

function polishPromptAddon() {
  return (
    "CRITICAL:\n" +
    '- Problem must summarize what the CLIENT actually needs (e.g. paid via custom link but no account/credentials received; breach; payout stuck).\n' +
    '- NEVER make "account number/email is missing" (or needing more details to identify the account) the Problem when the client already stated a concrete issue.\n' +
    "- If an identifier is missing, mention it only as trailing Extra/context — never as the Problem itself.\n" +
    "- If an account number is already known for this note, do NOT claim it is missing.\n"
  );
}

module.exports = {
  MISSING_ID_AS_PROBLEM_RE,
  CONCRETE_ISSUE_RE,
  looksLikeMissingIdAsProblem,
  hasUsableAccount,
  pickConcreteClientIssue,
  summarizeConcreteIssueFallback,
  repairEscalateProblemSummary,
  polishPromptAddon,
};
