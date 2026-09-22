"use strict";
const assert = require("assert");
const fs = require("fs");
const src = fs.readFileSync("./index.js", "utf8");

assert.ok(src.includes("function ensureCustomerReplySpacing"), "fn present");
assert.ok(src.includes("CUSTOMER REPLY SPACING"), "hard rule marker");
assert.ok(/fresh-2026-09-16-(audit-harden|reply-spacing|botstop-owner-only)-v1/.test(src), "engine bump");
// blank lines must set pendingBlank for all replies (not review-only)
assert.ok(!/Review only: one visible blank line/.test(src), "old review-only gone");
assert.ok(/pendingBlank = true;\n\s*continue;/.test(src), "pendingBlank always");

// Unit-test ensureCustomerReplySpacing by eval extract
const start = src.indexOf("function ensureCustomerReplySpacing");
const end = src.indexOf("\nfunction ensureSectionGaps", start);
assert.ok(start >= 0 && end > start, "extract bounds");
const fnSrc = src.slice(start, end);
const ensureCustomerReplySpacing = eval("(" + fnSrc.replace(/^function ensureCustomerReplySpacing/, "function") + ")");

assert.strictEqual(
  ensureCustomerReplySpacing("Hello.\nSecond point here."),
  "Hello.\n\nSecond point here.",
  "jammed"
);
assert.strictEqual(
  ensureCustomerReplySpacing("Hello.\n\n\n\nSecond."),
  "Hello.\n\nSecond.",
  "collapse"
);
const bullets = ensureCustomerReplySpacing("Intro\n• a\n• b\nOutro");
assert.ok(bullets.includes("• a\n• b"), "bullets tight: " + bullets);
assert.ok(bullets.startsWith("Intro\n\n•"), "blank before list: " + bullets);
assert.ok(bullets.endsWith("• b\n\nOutro") || /\n\nOutro$/.test(bullets), "blank after list: " + bullets);

console.log("ALL PASS 6");
