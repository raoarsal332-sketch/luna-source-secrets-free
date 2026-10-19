/**
 * Luna identity / escalate hard gates (additive).
 * Merge into VPS Luna index.js — do not replace existing locks.
 */

const accountNumberPrefer = require('./accountNumberPrefer');

const EMAIL_FIND_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

function isUsableClientEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  if (/@intercom\.io$/i.test(e)) return false;
  if (/intercom-mail\.com$/i.test(e)) return false;
  if (/@(fundedelite\.com|fundedelitetraders\.com)$/i.test(e)) return false;
  if (/^(support|noreply|no-reply|hello|info)@/i.test(e)) return false;
  return true;
}

function clientSaidNoAccount(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return false;
  return (
    /\b(i\s+)?(don'?t|do\s+not|dont)\s+have\s+(an?\s+)?(trading\s+)?account(\s+number)?\b/.test(t) ||
    /\b(i\s+)?(don'?t|do\s+not|dont)\s+have\s+(my\s+)?account\s*(number|no\.?|#|id)\b/.test(t) ||
    /\bno\s+account(\s+number)?\b/.test(t) ||
    /\b(i\s+)?(never\s+)?(got|received|created)\s+(an?\s+)?account\b/.test(t) ||
    /\b(i\s+)?(can'?t|cannot)\s+(find|remember|provide)\s+(my\s+)?account(\s+number)?\b/.test(t) ||
    /\bwithout\s+(an?\s+)?account(\s+number)?\b/.test(t) ||
    /\bi\s+have\s+no\s+account(\s+number)?\b/.test(t)
  );
}

function clientSaidNoEmail(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return false;
  return (
    /\b(i\s+)?(don'?t|do\s+not|dont)\s+have\s+(an?\s+)?(registered\s+)?e-?mails?\b/.test(t) ||
    /\bno\s+(registered\s+)?e-?mail\b/.test(t) ||
    /\b(i\s+)?(can'?t|cannot)\s+(find|remember|provide|access)\s+(my\s+)?(registered\s+)?e-?mail\b/.test(t) ||
    /\bwithout\s+(an?\s+)?(registered\s+)?e-?mail\b/.test(t) ||
    /\bi\s+have\s+no\s+(registered\s+)?e-?mail\b/.test(t) ||
    /\b(lost|no\s+access\s+to)\s+(my\s+)?(registered\s+)?e-?mail\b/.test(t)
  );
}

// Truthful Account: line when the client is locked out of the dashboard.
// Keeps Account/Email consecutive. It is not a trading-account number and it is
// not the bare placeholder "Not provided".
const AUTH_ACCESS_ACCOUNT_LINE =
  "Unavailable (dashboard access lockout; identify by registered email)";

function isAuthAccessIssue(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  const factor = /\b(?:2[\s-]?fa|two[\s-]?factor|google authenticator|authenticator app|otp|one[\s-]?time (?:password|code|pin))\b/i.test(t);
  const factorProblem = factor && /\b(?:not\s+receiv\w*|not\s+recei\w*|not\s+(?:coming|arriving|working)|didn'?t receive|did not receive|no (?:code|otp)|can(?:not|'?t)|unable|locked)\b/i.test(t);
  const loginFail = /\b(?:can(?:not|'?t)|unable(?:\s+to)?|not able(?:\s+to)?|not even(?:\s+able)?(?:\s+to)?|won'?t let me|does(?:n'?t| not) let me)\b[\s\S]{0,60}\b(?:log\s*in|login|sign\s*in)\b/i.test(t);
  const dashFail = /\b(?:dashboard|portal)\b[\s\S]{0,80}\b(?:not (?:even )?(?:to )?log|can(?:not|'?t)|unable|locked|not logging|isn'?t logging|not accessible)\b/i.test(t)
    || /\b(?:can(?:not|'?t)|unable to|not able to)\s+access\b[\s\S]{0,40}\b(?:my\s+)?(?:dashboard|portal)\b/i.test(t);
  const noAccess = /\b(?:don'?t|do not|dont)\s+have\s+access\b[\s\S]{0,40}\b(?:dashboard|portal)\b/i.test(t)
    || /\bno access\b[\s\S]{0,30}\b(?:dashboard|portal)\b/i.test(t);
  return factorProblem || loginFail || dashFail || noAccess;
}

function clientCannotProvideAccountNumber(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  const accessBlock = /\b(?:2[\s-]?fa|two[\s-]?factor|otp|one[\s-]?time (?:password|code|pin)|authenticator|verification code)\b/i.test(t)
    && /\b(?:not\s+receiv\w*|not\s+recei\w*|not\s+(?:coming|arriving)|didn'?t receive|did not receive|no (?:code|otp)|still not)\b/i.test(t);
  const lockedOut = isAuthAccessIssue(t);
  const mentionsNumber = /\baccount\s*(?:number|no\.?|#|id)?\b/i.test(t);
  const cannotCheck = /\b(?:can(?:not|'?t)|unable to|not able to)\b[\s\S]{0,40}\b(?:check|see|open|login|log\s*in)\b/i.test(t);
  if (/\b(?:can(?:not|'?t)|unable to|not able to|don'?t know how to)\b[\s\S]{0,60}\b(?:share|send|provide|give|see|find|check|get)\b[\s\S]{0,40}\baccount\s*(?:number|#|no\.?|id)?\b/i.test(t)) return true;
  if (/\bhow can i\b[\s\S]{0,40}\b(?:share|send|provide|give|get)\b/i.test(t) && (lockedOut || accessBlock || mentionsNumber)) return true;
  if (/\bhow can i (?:share|get|know)\b/i.test(t) && (lockedOut || accessBlock)) return true;
  if (accessBlock && (lockedOut || mentionsNumber || cannotCheck)) return true;
  if (/\b(?:don'?t|do not|dont)\s+have\s+access\b[\s\S]{0,40}\b(?:dashboard|portal)\b/i.test(t)) return true;
  if (/\b(?:portal|dashboard)\b[\s\S]{0,50}\b(?:not logging in|isn'?t logging in|not log(?:ging)? in|can(?:not|'?t) log)\b/i.test(t) && (mentionsNumber || /\bhow can i\b/i.test(t))) return true;
  if (lockedOut && mentionsNumber && /\b(?:registered|gmail|e-?mail|how can i share)\b/i.test(t)) return true;
  return false;
}

function tradingAccountNumberRequired(text) {
  if (payoutRejectionRequiresAccount(text)) return true;
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/\b(?:i was|i'?ve been|i am|i'?m|got|been)\s+breached\b/i.test(t)) return true;
  if (/\b(?:my|this|the)\s+account\b[\s\S]{0,60}\b(?:breach(?:ed)?|soft[- ]breach)\b/i.test(t)) return true;
  if (/\b(?:breach(?:ed)?|soft[- ]breach)\b[\s\S]{0,40}\b(?:my|this)\s+account\b/i.test(t)) return true;
  if (/\b(?:risk rule|per[- ]symbol|ip sharing|strategy risk)\b/i.test(t) && /\b(?:my|account|trade|position|check|review)\b/i.test(t)) return true;
  if (/\b(?:check|review)\b[\s\S]{0,40}\b(?:my|this)\s+(?:trade|position|risk)\b/i.test(t)) return true;
  if (/\b(?:my|the)\s+(?:payout|withdrawal)\b/i.test(t) && /\b(?:pending|stuck|delayed|missing|not arrived|hasn'?t arrived|not received|on hold)\b/i.test(t)) return true;
  return false;
}

const YEAR_RE = /^(19|20)\d{2}$/;
const MONTH_PREFIX_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|q[1-4]|fy|h[12])$/i;

function looksLikeDateGroups(groups) {
  if (groups.length !== 3) return false;
  const [a, b, c] = groups;
  if (YEAR_RE.test(c) && a.length <= 2 && b.length <= 2) return true;
  if (YEAR_RE.test(a) && b.length <= 2 && c.length <= 2) return true;
  return false;
}

function extractAccountNumbersFromText(text) {
  const original = String(text ?? "");
  const raw = accountNumberPrefer.stripIpv4(original);
  if (!raw.trim()) return [];
  const found = new Set();
  for (const m of raw.matchAll(/\b([A-Za-z]{1,6})[-_]?([0-9]{4,12})\b/g)) {
    const [, letters, digits] = m;
    if (MONTH_PREFIX_RE.test(letters) && YEAR_RE.test(digits)) continue;
    found.add(m[0].replace(/\s+/g, ""));
  }
  for (const m of raw.matchAll(/\b(\d{2,4})([\s\-.])(\d{2,4})(?:\2(\d{2,4}))?\b/g)) {
    const groups = [m[1], m[3], m[4]].filter(Boolean);
    if (looksLikeDateGroups(groups)) continue;
    // Money cents: "546.29" / "599.86" must not become account tokens.
    if (m[2] === "." && String(m[3] || "").length <= 2 && !m[4]) continue;
    // Currency prefix: "$14,546" — leave to money filter; skip comma-glued money wholes.
    const before = raw.slice(Math.max(0, m.index - 3), m.index);
    if (/\$\s*$/.test(before) || /,\s*$/.test(before)) continue;
    const digits = groups.join("");
    if (digits.length >= 5 && digits.length <= 12) found.add(digits);
  }
  for (const m of raw.matchAll(/\b\d(?:[\-.]\d){4,11}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 5 && digits.length <= 12) found.add(digits);
  }
  for (const m of raw.matchAll(/\b(\d{5,12})\b/g)) {
    found.add(m[1]);
  }
  return [...found].filter((tok) => !accountNumberPrefer.isBlockedNoise(tok, original));
}

const ASK_VERB =
  "(?:please\\s+)?(?:share|provide|send|confirm|give|enter|drop|type|tell\\s+me|let\\s+me\\s+know|need|what(?:'s|\\s+is)|which|could\\s+you|can\\s+you|may\\s+i\\s+have)";
const ACCOUNT_NOUN =
  "(?:trading\\s+)?account\\s*(?:number|no\\.?|#|id|login)|login\\s*id|account\\s*login";
const EMAIL_NOUN =
  "(?:registered\\s+|fundedelite\\s+|linked\\s+|your\\s+|the\\s+)e-?mail(?:\\s+address)?";

const ASK_ACCOUNT_RE = new RegExp(
  "\\b" + ASK_VERB + "\\b[^.?!\\n]{0,60}\\b(?:" + ACCOUNT_NOUN + ")\\b" +
    "|\\b(?:" + ACCOUNT_NOUN + ")\\b[^.?!\\n]{0,40}\\?" +
    "|\\b(?:which|what)\\s+account\\b[^.?!\\n]{0,40}\\?",
  "i",
);
const ASK_EMAIL_RE = new RegExp(
  "\\b" + ASK_VERB + "\\b[^.?!\\n]{0,60}\\b" + EMAIL_NOUN + "\\b" +
    "|\\b" + EMAIL_NOUN + "\\b[^.?!\\n]{0,40}\\b(?:registered|linked|associated|on\\s+(?:your|the)\\s+(?:fundedelite\\s+)?account)\\b[^.?!\\n]{0,40}\\?" +
    "|\\b(?:registered|linked|associated)\\s+e-?mail\\b[^.?!\\n]{0,40}\\?" +
    "|\\b" + EMAIL_NOUN + "\\b[^.?!\\n]{0,20}\\bplease\\b",
  "i",
);
const EMAIL_NOT_ASK_RE =
  /\b(?:by|via|through|over|on\s+intercom\s+or|or\s+by)\s+e-?mail\b|\be-?mail\s+you\b|\bsend\s+(?:you\s+)?(?:an?\s+)?e-?mail\b|\b(?:an?|the)\s+e-?mail\s+(?:once|when|after|with|confirm)/i;
const ACCOUNT_MENTION_NOT_ASK_RE = /\be-?mail\b[^.?!\n]{0,40}\baccount\b(?:\s+\d{4,12})?|\baccount\s+\d{4,12}\b/gi;

function detectIdentityAskFieldsInChunk(chunk) {
  const t = String(chunk ?? "");
  const out = { account: false, email: false };
  if (!t.trim()) return out;
  const tAcct = t.replace(ACCOUNT_MENTION_NOT_ASK_RE, " ");
  if (ASK_ACCOUNT_RE.test(tAcct)) out.account = true;
  // Dutch request for the trading-account number. A bare "accountnummer" mention is not an ask.
  if (/\b(?:stuur|geef|deel)\b[^.?!\n]{0,60}\b(?:accountnummer|rekeningnummer|handelsrekening)\b/i.test(t)) {
    out.account = true;
  }
  if (/\b(?:accountnummer|rekeningnummer|handelsrekening)\b[^.?!\n]{0,40}\?/i.test(t)) {
    out.account = true;
  }
  if (ASK_EMAIL_RE.test(t)) {
    const stripped = t.replace(EMAIL_NOT_ASK_RE, " ");
    if (ASK_EMAIL_RE.test(stripped)) out.email = true;
  }
  return out;
}

function detectIdentityAskFields(text) {
  const t = String(text ?? "");
  const out = { account: false, email: false };
  if (!t.trim()) return out;
  const chunks = [t, ...t.split(/(?<=[.!?])\s+|\n+/)].filter((c) => c && c.trim());
  for (const chunk of chunks) {
    const part = detectIdentityAskFieldsInChunk(chunk);
    if (part.account) out.account = true;
    if (part.email) out.email = true;
  }
  return out;
}

function collectEscalateIds(parts) {
  const texts = (parts ?? []).map((p) =>
    typeof p === "string" ? p : String(p?.body ?? p?.text ?? ""),
  );
  const joined = texts.join("\n");
  const accounts = extractAccountNumbersFromText(joined);
  const proven = accountNumberPrefer.provenDirectReplyTokens(
    texts,
    (t) => detectIdentityAskFields(t).account
  );
  for (const tok of proven) {
    if (!accounts.includes(tok)) accounts.push(tok);
  }
  const ranked = accountNumberPrefer.rankAccountCandidates(accounts, joined, {
    messageTexts: texts,
    provenTokens: proven,
  });
  const rankedAll = ranked.all && ranked.all.length ? ranked.all : [];
  const accountNumber = rankedAll.length
    ? accountNumberPrefer.formatAccountField(rankedAll)
    : ranked.primary || null;
  const emailCandidates = [...joined.matchAll(/[^\s@]+@[^\s@]+\.[^\s@]+/gi)].map((m) => m[0]);
  const email = emailCandidates.find(isUsableClientEmail) || null;
  const declinedAccount = texts.some((t) => clientSaidNoAccount(t));
  const declinedEmail = texts.some((t) => clientSaidNoEmail(t));
  return {
    accountNumbers: rankedAll,
    accountNumber: accountNumber || null,
    email,
    declinedAccount,
    declinedEmail,
    hasAccount: rankedAll.length > 0,
    hasEmail: Boolean(email),
  };
}

/**
 * A payout/withdrawal rejection that is THIS client's case needs the trading account
 * number before escalation. A profile email is not that number.
 * General policy ("why do payouts get rejected?", "if a payout is rejected") is not.
 */
function isPayoutRejectionPolicyQuestion(text) {
  const t = String(text || "");
  if (
    /\b(?:reasons?|policies|policy|usually|normally|typically|in general|common reasons)\b/i.test(t) &&
    !/\b(?:my|our)\s+(?:payout|withdrawal)\b[^.?!]{0,40}\b(?:was|were|got|gotten|has been|have been)\b/i.test(t)
  ) {
    return true;
  }
  if (/^\s*(?:what|why|how|when|which)\b/i.test(t) && !/\b(?:my|our|i|we)\b/i.test(t)) return true;
  if (/\bif\b/i.test(t) && !/\b(?:was|were|got|gotten|has been|have been)\s+(?:rejected|denied|declined|refused)\b/i.test(t)) {
    return true;
  }
  if (
    /\b(?:can|could|might|may|do|does|will)\b[^.?!]{0,40}\b(?:a\s+|the\s+)?(?:payouts?|withdrawals?)\b[^.?!]{0,40}\b(?:be\s+|get\s+|gets\s+)?(?:rejected|denied|declined)\b/i.test(t) &&
    !/\b(?:was|were|got|gotten)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function payoutRejectionRequiresAccount(text) {
  const t = String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (!/\b(?:payouts?|withdrawals?)\b/i.test(t)) return false;
  if (!/\b(?:rejected|rejection|denied|declined|refused)\b/i.test(t)) return false;
  if (isPayoutRejectionPolicyQuestion(t)) return false;
  if (/\b(?:was|were)\s+(?:my|our|the|this)\s+(?:payout|withdrawal)\b[^.?!]{0,30}\b(?:rejected|denied|declined|refused)\b/i.test(t)) return true;
  if (/\b(?:rejected|denied|declined|refused)\s+my\s+(?:payout|withdrawal)\b/i.test(t)) return true;
  if (/\b(?:my|our)\s+(?:payout|withdrawal)\b[^.?!]{0,40}\b(?:rejected|denied|declined|refused|rejection)\b/i.test(t)) return true;
  if (/\b(?:i|we)\b[^.?!]{0,80}\b(?:payout|withdrawal)\b[^.?!]{0,50}\b(?:rejected|denied|declined|refused|rejection)\b/i.test(t)) return true;
  if (/\b(?:the|this)\s+(?:payout|withdrawal)(?:\s+\w+){0,4}\s+(?:was|were|got|has been|have been)\s+(?:rejected|denied|declined|refused)\b/i.test(t)) return true;
  if (/\b(?:says|shows|showing|reads)\b[^.?!]{0,40}\b(?:payout|withdrawal)?\b[^.?!]{0,20}\b(?:rejected|denied|declined)\b/i.test(t) &&
      /\b(?:payout|withdrawal)\b/i.test(t)) return true;
  return false;
}

function pickAccountEmailAsk(state = {}) {
  const kind = state.kind ?? "ACCOUNT";
  const emailRequired =
    state.emailRequiredByKind === true || kind === "EMAIL_REQUIRED";
  const hasAccount = Boolean(state.accountNumber);
  const hasEmail = Boolean(state.email);
  const noAccount = Boolean(state.declinedAccount);
  const noEmail = Boolean(state.declinedEmail);

  if (noAccount && (!emailRequired || noEmail || hasEmail || hasAccount)) {
    return {
      ready: true,
      ask: null,
      reason: "client_declined_identity",
      noteFlags: {
        ...(noAccount ? { noAccount: true } : {}),
        ...(noEmail ? { noEmail: true } : {}),
      },
    };
  }

  if (hasAccount && !emailRequired) {
    return {
      ready: true,
      ask: null,
      reason: "account_sufficient",
      noteFlags: noEmail ? { noEmail: true } : {},
    };
  }

  if (hasAccount && emailRequired) {
    if (hasEmail || noEmail) {
      return {
        ready: true,
        ask: null,
        reason: hasEmail ? "account_and_email" : "account_email_declined",
        noteFlags: noEmail ? { noEmail: true } : {},
      };
    }
    if (state.alreadyAskedEmail) {
      return {
        ready: true,
        ask: null,
        reason: "email_ask_exhausted",
        noteFlags: {},
      };
    }
    return {
      ready: false,
      ask: "email",
      reason: "email_required_by_kind",
      noteFlags: {},
    };
  }

  // The client already explained the trading account number cannot be produced
  // (dashboard/2FA/OTP lockout). Never ask for it again. Email is the identifier.
  if (state.accountUnavailable && !hasAccount && !noAccount) {
    if (hasEmail || noEmail || state.alreadyAskedEmail) {
      return {
        ready: true,
        ask: null,
        reason: "account_unavailable",
        noteFlags: { accountUnavailable: true, ...(noEmail ? { noEmail: true } : {}) },
      };
    }
    return {
      ready: false,
      ask: "email",
      reason: "account_unavailable_need_email",
      noteFlags: { accountUnavailable: true },
    };
  }

  // PAYOUT_REJECTION_ACCOUNT_V1: a profile email does not identify which trading
  // account had the payout rejected. Ask for that number, or keep waiting after
  // the ask, instead of treating the email as enough to escalate.
  if (state.requireAccountNumber && !hasAccount && !noAccount) {
    if (state.alreadyAskedAccount) {
      return {
        ready: false,
        ask: null,
        reason: "payout_rejection_awaiting_account",
        noteFlags: {},
      };
    }
    return {
      ready: false,
      ask: "account",
      reason: "payout_rejection_needs_account",
      noteFlags: {},
    };
  }

  // Breach, a payout on a specific account, or a trade/risk check still needs the
  // trading account number. Login/2FA does not use this flag.
  if (state.tradingAccountIssue && !hasAccount && !noAccount) {
    if (state.alreadyAskedAccount) {
      return {
        ready: false,
        ask: null,
        reason: "trading_account_awaiting_account",
        noteFlags: {},
      };
    }
    return {
      ready: false,
      ask: "account",
      reason: "trading_account_needs_account",
      noteFlags: {},
    };
  }

  // AUTH_ACCESS_EMAIL_V1: 2FA / OTP / dashboard login is identified by the
  // registered email. Do not demand a trading account number.
  if (state.authAccessIssue && !hasAccount && !noAccount) {
    if (hasEmail || noEmail) {
      return {
        ready: true,
        ask: null,
        reason: "auth_access_email_sufficient",
        noteFlags: { authAccess: true, ...(noEmail ? { noEmail: true } : {}) },
      };
    }
    if (state.alreadyAskedEmail) {
      return {
        ready: false,
        ask: null,
        reason: "auth_access_awaiting_email",
        noteFlags: { authAccess: true },
      };
    }
    return {
      ready: false,
      ask: "email",
      reason: "auth_access_need_email",
      noteFlags: { authAccess: true },
    };
  }

  if (hasEmail && !emailRequired) {
    return {
      ready: true,
      ask: null,
      reason: noAccount ? "email_present_account_declined" : "email_sufficient",
      noteFlags: noAccount ? { noAccount: true } : {},
    };
  }

  if (!hasAccount && !hasEmail) {
    if (noAccount && noEmail) {
      return {
        ready: true,
        ask: null,
        reason: "both_declined",
        noteFlags: { noAccount: true, noEmail: true },
      };
    }
    if (noAccount) {
      if (emailRequired && !state.alreadyAskedEmail) {
        return {
          ready: false,
          ask: "email",
          reason: "account_declined_need_email",
          noteFlags: { noAccount: true },
        };
      }
      return {
        ready: true,
        ask: null,
        reason: "account_declined_no_email_required",
        noteFlags: { noAccount: true },
      };
    }
    if (noEmail && emailRequired) {
      if (!state.alreadyAskedAccount) {
        return {
          ready: false,
          ask: "account",
          reason: "email_declined_ask_account",
          noteFlags: { noEmail: true },
        };
      }
      return {
        ready: false,
        ask: null,
        reason: "awaiting_account_after_asks",
        noteFlags: { noEmail: true },
      };
    }
    if (!state.alreadyAskedAccount) {
      return {
        ready: false,
        ask: "account",
        reason: "both_missing_ask_account",
        noteFlags: {},
      };
    }
    if (emailRequired && !state.alreadyAskedEmail) {
      return {
        ready: false,
        ask: "email",
        reason: "both_missing_ask_email",
        noteFlags: {},
      };
    }
    // Do NOT escalate with empty identity after asks. Wait for a real account/email
    // (or an explicit client decline). Fake "Not provided (unclear after asks)" escalations
    // were sending "sent to teammate" before the client shared an account number.
    return {
      ready: false,
      ask: null,
      reason: "awaiting_client_identity_after_asks",
      noteFlags: {},
    };
  }

  return {
    ready: true,
    ask: null,
    reason: "fallback_ready",
    noteFlags: {
      ...(noAccount ? { noAccount: true } : {}),
      ...(noEmail ? { noEmail: true } : {}),
    },
  };
}

function preSendIdentityCheck(ids, draft) {
  const text = String(draft ?? "").trim();
  if (!text) {
    return { ok: false, reason: "Empty draft.", message: null };
  }
  const asks = detectIdentityAskFields(text);
  const asksAccount = asks.account;
  const asksEmail = asks.email;
  if (!asksAccount && !asksEmail) {
    return { ok: true, reason: null, message: text, asks };
  }

  if (asksAccount) {
    if (ids?.accountNumber) {
      return {
        ok: false,
        reason: `Draft asks for account number, but it is already known (${ids.accountNumber}).`,
        message: null,
      };
    }
    if (ids?.declinedAccount) {
      return {
        ok: false,
        reason:
          "Draft asks for account number, but client said they do not have an account. Do not force-loop.",
        message: null,
      };
    }
    if (ids?.accountUnavailable || ids?.authAccessWaive) {
      return {
        ok: false,
        reason:
          "Draft asks for account number, but this issue is identified by the registered email (login/2FA/OTP or the client cannot access the number). Do not ask.",
        message: null,
      };
    }
  }

  if (asksEmail) {
    if (ids?.email) {
      return {
        ok: false,
        reason: `Draft asks for email, but it is already known (${ids.email}).`,
        message: null,
      };
    }
    if (ids?.declinedEmail) {
      return {
        ok: false,
        reason:
          "Draft asks for email, but client said they do not have an email. Do not force-loop.",
        message: null,
      };
    }
    if (ids?.accountNumber && ids?.emailRequiredByKind !== true) {
      return {
        ok: false,
        reason: `Draft asks for email, but account ${ids.accountNumber} is already enough for escalate.`,
        message: null,
      };
    }
  }

  return { ok: true, reason: null, message: text, asks };
}

const preSendCheck = preSendIdentityCheck;

function identityEscalationNoteExtras(ids) {
  const lines = [];
  if (ids?.accountNumber) lines.push(`Account Number: ${ids.accountNumber}`);
  /* AUDIT_HARDEN_V1:noteEmailExtras */
  if (ids?.email && isUsableClientEmail(ids.email)) lines.push(`Email: ${ids.email}`);
  else if (ids && (ids.email || ids.noEmail || ids.declinedEmail)) lines.push("Email: Not provided");
  if (ids?.declinedAccount) {
    lines.push("Note: Client stated they do not have an account / account number.");
  }
  if (ids?.authAccessNote) {
    lines.push("Note: Identify this client by the registered email. The trading account number is unavailable because they cannot access the dashboard (login/2FA/OTP).");
  }
  if (ids?.declinedEmail) {
    lines.push("Note: Client stated they do not have a registered email.");
  }
  if (!ids?.accountNumber && !ids?.email) {
    lines.push("Note: No account number or email available in conversation history.");
  }
  return lines;
}

const IDENTITY_ESCALATE_PROMPT_ADDON = `
CREDENTIALS & IDENTITY / ESCALATE (code-gated)

- Re-fetch full conversation before any identity ask.
- Account number alone is enough for normal ACCOUNT escalate — do NOT ask for registered email when an account number is already in history.
- Ask for identity only when BOTH account number and email are missing from full history. Prefer asking for the account number.
- Exception: a payout or withdrawal that was rejected, denied, or declined for this client still needs the account number before escalation, even when a profile email is already known. Do not ask again when that account number is already in the conversation or in trusted account context. A general question about why payouts can be denied is not this exception.
- Never re-ask a field already present in history.
- If the client clearly says they do not have an email, or do not have an account / account number, TRUST that. Do not force, loop, or repeatedly ask. Escalate/note with whatever identifiers exist (or without identity, noting the decline).
- Login, 2FA, OTP, and dashboard-access problems are identified by the registered email already on the ticket. Do not ask for a trading account number for those, and do not ask again after the client says they cannot share or see the number because they cannot log in. A breach, a payout on a specific account, or a trade/risk check still needs the account number when the client has not said it is unreachable.
- Max one clear ask per missing field unless the reply was genuinely unclear.
- Platform names from the official FAQ are allowed (MetaTrader 5 / MT5, TradeLocker, MatchTrader). Never replace MetaTrader 5 with "the trading platform" when answering which platforms a challenge uses.
`.trim();

module.exports = {
  isUsableClientEmail,
  clientSaidNoAccount,
  clientSaidNoEmail,
  isAuthAccessIssue,
  clientCannotProvideAccountNumber,
  tradingAccountNumberRequired,
  AUTH_ACCESS_ACCOUNT_LINE,
  detectIdentityAskFields,
  extractAccountNumbersFromText,
  isPayoutRejectionPolicyQuestion,
  payoutRejectionRequiresAccount,
  collectEscalateIds,
  pickAccountEmailAsk,
  preSendIdentityCheck,
  preSendCheck,
  identityEscalationNoteExtras,
  IDENTITY_ESCALATE_PROMPT_ADDON,
};
