/**
 * Self-test: review notification process ask lock
 */
const fs = require("fs");
const src = fs.readFileSync("/home/ubuntu/index.js", "utf8");

const start = src.indexOf("/** True when client wants THEIR specific case status checked");
const end = src.indexOf("\nfunction clientSaidNoAccount");
if (start < 0 || end < 0) {
  console.error("FAIL: could not locate detector block", start, end);
  process.exit(1);
}
const block = src.slice(start, end);
const sandbox = {};
Function(
  "exports",
  block +
    "\nexports.isClearlyPersonalReviewStatusCheck = isClearlyPersonalReviewStatusCheck;" +
    "\nexports.isReviewNotificationProcessAsk = isReviewNotificationProcessAsk;" +
    "\nexports.pickReviewStatusDirectReply = pickReviewStatusDirectReply;" +
    "\nexports.REVIEW_STATUS_DIRECT_REPLIES = REVIEW_STATUS_DIRECT_REPLIES;"
)(sandbox);

const {
  isClearlyPersonalReviewStatusCheck,
  isReviewNotificationProcessAsk,
  pickReviewStatusDirectReply,
  REVIEW_STATUS_DIRECT_REPLIES,
} = sandbox;

const screenshot =
  "how will I know if the review is done? will they send me an email?";
const personal = "check status of my KYC review on account 123456";
const personal2 = "what's the status of my KYC review";
const personal3 = "can you check my verification status";
const process2 = "will I get an email when verification is complete?";
const process3 = "how will I know when the review is finished?";

let fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("PASS:", msg);
  }
}

assert(isReviewNotificationProcessAsk(screenshot) === true, "screenshot phrase → process ask");
assert(isClearlyPersonalReviewStatusCheck(screenshot) === false, "screenshot phrase NOT personal status");
assert(isReviewNotificationProcessAsk(personal) === false, "personal KYC+account → NOT forced process");
assert(isClearlyPersonalReviewStatusCheck(personal) === true, "personal KYC+account → personal check");
assert(isReviewNotificationProcessAsk(personal2) === false, "status of my KYC → not process-only");
assert(isReviewNotificationProcessAsk(personal3) === false, "check my verification status → not process-only");
assert(isReviewNotificationProcessAsk(process2) === true, "will I get email when verification complete");
assert(isReviewNotificationProcessAsk(process3) === true, "how will I know when review finished");

const reply = pickReviewStatusDirectReply();
assert(/intercom/i.test(reply) && /email/i.test(reply), "direct reply contains Intercom and email: " + reply);
assert(
  REVIEW_STATUS_DIRECT_REPLIES.length >= 2 && REVIEW_STATUS_DIRECT_REPLIES.length <= 3,
  "2–3 variants (" + REVIEW_STATUS_DIRECT_REPLIES.length + ")"
);
for (const r of REVIEW_STATUS_DIRECT_REPLIES) {
  assert(/intercom/i.test(r) && /email/i.test(r), "variant has Intercom+email");
}

assert(/engine:\s*['"]fresh-2026-09-16-[^'"]+['"]/.test(src) || /engine:\s*['"]fresh-2026-09-15-(review-status-direct|soft-edges-v1)['"]/.test(src), "health engine string");
assert(src.includes("console.log('REVIEW_STATUS_DIRECT'"), "short-circuit log present");
assert(src.includes("ESCALATE->REPLY review-status-direct"), "escalate rewrite present");

const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
assert(
  prompt.includes("REVIEW STATUS QUESTIONS — ANSWER DIRECTLY, DO NOT FORWARD"),
  "prompt HARD RULE present"
);

if (fails) {
  console.error("\n" + fails + " failure(s)");
  process.exit(1);
}
console.log("\nALL PASS");
