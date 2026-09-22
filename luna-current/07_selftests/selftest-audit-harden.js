#!/usr/bin/env node
"use strict";
/**
 * Audit-harden selftest covering remaining lock gaps 1-8.
 */
const assert = require("assert");
const fs = require("fs");
const se = require("./softEdges");
const p = require("./september-promos");
const ero = require("./escalateRelatedOnly");
const sp = require("./spreadAskGate");
const idg = require("./identityEscalateGates");
const prefer = require("./accountNumberPrefer");

let fails = 0;
function check(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
  } catch (e) {
    fails++;
    console.error("FAIL:", name, e && e.message);
  }
}

const idx = fs.readFileSync("./index.js", "utf8");

check("engine id audit-harden or pre-bump spacing", () => {
  assert.ok(/fresh-2026-09-16-/.test(idx));
  assert.ok(!/LUNA_PRESEND_MODE\s*=\s*['"]enforce['"]/.test(idx));
  assert.ok(idx.includes("AUDIT_HARDEN_V1:applied") || idx.includes("AUDIT_HARDEN_V1:noteEmail"));
});

// ---- 1) Promo SCOPE ----
check("1a Haydar-like bare discount after reset → bypass promo", () => {
  const hist = [
    { role: "user", content: "I got a soft breach, can I reset?" },
    { role: "assistant", content: "A reset fee applies after soft breach." },
  ];
  const r = se.shouldBypassPromoShortCircuit("Can I have a discount?", hist);
  assert.strictEqual(r.bypass, true);
  assert.ok(/reset|bare_discount/i.test(r.classification.reason));
});
check("1b what is SEP35 → promo OK", () => {
  const r = se.shouldBypassPromoShortCircuit("what is SEP35?", [
    { role: "user", content: "I got a soft breach" },
  ]);
  assert.strictEqual(r.bypass, false);
  assert.strictEqual(r.classification.shortCircuit, "promo");
});
check("1c discount on reset fee → bypass", () => {
  assert.strictEqual(se.isResetFeeOrAccountDiscountAsk("any discount on the reset fee?"), true);
  assert.strictEqual(se.shouldBypassPromoShortCircuit("discount on reset").bypass, true);
});
check("1d handleCustomerMessage no SEP35 after reset discount", () => {
  const hist = [
    { role: "user", text: "soft breach reset please" },
    { role: "assistant", text: "Reset fee applies." },
  ];
  const r = p.handleCustomerMessage("Can I have a discount?", hist);
  const str = typeof r === "string" ? r : JSON.stringify(r || "");
  assert.ok(!/SEP35/i.test(str) || /useExistingRulesFlow|reply":null/.test(str), str.slice(0, 200));
});
check("1e SEP35 ask still returns promo", () => {
  const r = p.handleCustomerMessage("what is SEP35?", []);
  assert.ok(typeof r === "string" && /SEP35/i.test(r), String(r).slice(0, 120));
});

// ---- 2) Note email ----
check("2a isUsableClientEmail rejects Jurjen-style intercom-mail", () => {
  assert.strictEqual(idg.isUsableClientEmail("jurjen@fundedelite.intercom-mail.com"), false);
  assert.strictEqual(idg.isUsableClientEmail("x@intercom-mail.com"), false);
  assert.strictEqual(idg.isUsableClientEmail("real@gmail.com"), true);
});
check("2b collectEscalateIds skips intercom-mail only", () => {
  const ids = idg.collectEscalateIds([
    "email is jurjen@fundedelite.intercom-mail.com account 712381",
  ]);
  assert.strictEqual(ids.email, null);
  assert.ok(ids.accountNumber);
});
check("2c index buildEscalate filters email (source marker)", () => {
  assert.ok(idx.includes("AUDIT_HARDEN_V1:noteEmail"));
  assert.ok(idx.includes("!isUsableClientEmail(em)"));
});
check("2d identityEscalationNoteExtras filters", () => {
  assert.ok(fs.readFileSync("./identityEscalateGates.js", "utf8").includes("AUDIT_HARDEN_V1:noteEmailExtras"));
});

// ---- 3) Spread FP ----
check("3a Sparsh personal login → false", () => {
  assert.strictEqual(
    sp.isSpreadCheckAsk(
      "Hi, my personal account 160187 keeps asking me to log in again. Password regenerated, trade history missing."
    ),
    false
  );
});
check("3b naganathan give me spread check account → true", () => {
  assert.strictEqual(sp.isSpreadCheckAsk("give me spread check account"), true);
});
check("3c what are your spreads → true", () => {
  assert.strictEqual(sp.isSpreadCheckAsk("what are your spreads"), true);
});
check("3d password+login without spread → false", () => {
  assert.strictEqual(sp.isSpreadCheckAsk("my password and login are not working on the trading platform"), false);
});

// ---- 4) Canned dashes ----
check("4a SPREAD_TEST_REPLY source has no em/en dash", () => {
  const m = idx.match(/const SPREAD_TEST_REPLY\s*=\s*([\s\S]*?);/);
  assert.ok(m, "SPREAD_TEST_REPLY found");
  assert.ok(!/\u2014|\u2013|—|–/.test(m[1]), "dash remains in SPREAD_TEST_REPLY");
});
check("4b STATUS_ONLY_REPLIES no em dash", () => {
  const src = fs.readFileSync("./escalateRelatedOnly.js", "utf8");
  const m = src.match(/STATUS_ONLY_REPLIES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(m);
  assert.ok(!/\u2014|—/.test(m[1]));
});
check("4c canned paths wrap postProcess", () => {
  assert.ok(idx.includes("postProcessModelReply(SPREAD_TEST_REPLY"));
});

// ---- 5) FAQ escalate fallthrough ----
check("5a what happens if I violate → FALLTHROUGH", () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: "what happens if I violate the rules?",
    lastEscalateProblem: "Client IP mismatch",
    lastEscalateTopic: "ip_risk",
  });
  assert.strictEqual(d.action, "FALLTHROUGH");
  assert.strictEqual(d.clearFaq, true);
});
check("5b what if payout rejected → FALLTHROUGH", () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: "what if a payout is rejected?",
    lastEscalateProblem: "Client IP mismatch",
    lastEscalateTopic: "ip_risk",
  });
  assert.strictEqual(d.action, "FALLTHROUGH");
});
check("5c soft-ack still SKIP", () => {
  assert.strictEqual(
    ero.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText: "ok thanks",
      lastEscalateProblem: "IP",
    }).action,
    "SKIP"
  );
});
check("5d related status still STATUS_ONLY", () => {
  assert.strictEqual(
    ero.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText: "any update on my IP review?",
      lastEscalateProblem: "Client IP mismatch / VPN risk",
      lastEscalateTopic: "ip_risk",
    }).action,
    "STATUS_ONLY"
  );
});

// ---- 6) Bot stop ----
check("6a parseAuthorizedNoteCommand bot please stop", () => {
  // Extract function via vm-ish: require not exported — smoke via source + Function
  const start = idx.indexOf("function parseAuthorizedNoteCommand(plain, opts)");
  const end = idx.indexOf("\nfunction parseOwnerCommandAction", start);
  assert.ok(start > 0 && end > start);
  const fnSrc = idx.slice(start, end);
  // deps used inside
  const box = {
    stripOwnerMentionPrefix: (p) =>
      String(p || "")
        .replace(/^(?:\s*(?:@\S+|arsal|jerry(?:\s*-?\s*manager)?))+\s*/i, "")
        .trim(),
    isBotAuthConfirmNote: () => false,
    isEscalateOrSystemNote: () => false,
    extractOwnerSendToClientBody: () => null,
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "stripOwnerMentionPrefix",
    "isBotAuthConfirmNote",
    "isEscalateOrSystemNote",
    "extractOwnerSendToClientBody",
    fnSrc + "\nreturn parseAuthorizedNoteCommand;"
  )(box.stripOwnerMentionPrefix, box.isBotAuthConfirmNote, box.isEscalateOrSystemNote, box.extractOwnerSendToClientBody);
  assert.strictEqual(fn("@Arsal bot please stop", { mentionsAuthorized: true }).cmd, "STOP");
  assert.strictEqual(fn("@Arsal stop the bot", { mentionsAuthorized: true }).cmd, "STOP");
  assert.strictEqual(fn("@Arsal stop replying", { mentionsAuthorized: true }).cmd, "STOP");
  assert.strictEqual(fn("@Arsal Arsal stop", { mentionsAuthorized: true }).cmd, "STOP");
});
check("6b bot-stop is owner-only (AUGUST/other teammates cannot STOP)", () => {
  // The old AUDIT_HARDEN_V1:augustBotStop path was removed on purpose when bot-stop
  // became owner-only (engine fresh-2026-09-16-botstop-owner-only-v1).
  assert.ok(!idx.includes("AUDIT_HARDEN_V1:augustBotStop"), "legacy AUGUST path must stay removed");
  assert.ok(idx.includes("isOwnerAuthor") && idx.includes("teammate cannot command bot"), "owner-only gate present");
  assert.ok(/Other teammates \(AUGUST, etc\.\) cannot STOP\/RESUME\/CLOSE/.test(idx), "owner-only rule documented in code");
});

// ---- 7) Account re-ask ----
check("7a preSend blocks re-ask when account known", () => {
  const r = idg.preSendIdentityCheck(
    { accountNumber: "712381", email: null },
    "Please share your account number so I can forward this."
  );
  assert.strictEqual(r.ok, false);
});
check("7b stripKnownAccountAsk marker in index", () => {
  assert.ok(idx.includes("AUDIT_HARDEN_V1:stripKnownAccountAsk"));
});

// ---- 8) Wrong account / formatAccountField ----
check("8a formatAccountField used in collectEscalateIds paths", () => {
  assert.ok(idx.includes("accountNumberPrefer.formatAccountField"));
  assert.ok(fs.readFileSync("./identityEscalateGates.js", "utf8").includes("formatAccountField"));
});
check("8b formatAccountField joins ranked", () => {
  assert.strictEqual(prefer.formatAccountField(["11111", "22222"]), "11111, 22222");
  assert.strictEqual(prefer.formatAccountField(["99999"]), "99999");
});

if (fails) {
  console.error("\n" + fails + " failure(s)");
  process.exit(1);
}
console.log("\nALL PASS selftest-audit-harden");
