require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// Import postProcess by evaluating the helper block from index.js
const src = fs.readFileSync("/home/ubuntu/index.js", "utf8");
const start = src.indexOf("const TICKET_STATE_FILE");
const end = src.indexOf("function contactBits");
if (start < 0 || end < 0) throw new Error("helpers missing");
const helperSrc = src.slice(start, end);
const sandbox = { fs, process, console, module: { exports: {} }, exports: {}, require };
const vm = require("vm");
vm.createContext(sandbox);
vm.runInContext(helperSrc + "\n;this.postProcessModelReply=postProcessModelReply;this.toHtml=toHtml;this.SCOPE_DECLINE_VARIANTS=SCOPE_DECLINE_VARIANTS;", sandbox);

const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const convId = "smoke-v10-" + Date.now();

function wrap(q, hist) {
  return (
    "Client name: Bot test\nClient email: test@example.com\nConversation id: " +
    convId +
    "\n\nFULL TICKET HISTORY:\n" +
    hist +
    "\n\nLatest client message:\n" +
    q +
    "\n\nRespond with ACTION format only. Client-facing name is Arsal (never Luna)."
  );
}
function bodyOf(s) {
  const m = s.match(/^ACTION:\s*REPLY\s*\nBODY:\s*([\s\S]*)$/i);
  return m ? m[1].trim() : s;
}

(async () => {
  // unit: postProcess
  const u1 = sandbox.postProcessModelReply("FTMO is another proprietary trading firm.\n[[SCOPE_DECLINE]]", convId);
  const u2 = sandbox.postProcessModelReply("[[SCOPE_DECLINE]]", convId);
  const u3 = sandbox.postProcessModelReply("[[Weekend Trading]]\nOpening trades is banned without add-on.", convId);
  console.log("UNIT1", u1);
  console.log("UNIT2", u2);
  console.log("UNIT3", u3);
  console.log("HTML3", sandbox.toHtml(u3));

  const unitChecks = [
    ["scope_replaced_1", !u1.includes("[[SCOPE_DECLINE]]") && /FundedElite/i.test(u1)],
    ["scope_replaced_2", !u2.includes("[[SCOPE_DECLINE]]")],
    ["scope_different", u1 !== u2],
    ["heading_b", u3.includes("<b>Weekend Trading</b>") && !u3.includes("[[Weekend Trading]]")],
    ["html_ok", sandbox.toHtml(u3).includes("<b>Weekend Trading</b>") && !sandbox.toHtml(u3).includes("&lt;b&gt;")],
  ];
  console.log("UNIT_CHECKS", JSON.stringify(unitChecks));

  // live model
  const asks = [
    ["ftmo", "what is FTMO", "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: what is FTMO"],
    ["movie", "what's your favorite movie?", "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: what's your favorite movie?"],
    ["prohibited", "What are prohibited strategies?", "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: What are prohibited strategies?"],
  ];
  const results = [];
  for (const [tag, q, hist] of asks) {
    const ai = await client.chat.completions.create({
      model: "gpt-5.6-luna",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q, hist) },
      ],
    });
    const raw = (((ai.choices[0] || {}).message || {}).content || "").trim();
    const body = bodyOf(raw);
    const final = sandbox.postProcessModelReply(body, convId + "-" + tag);
    results.push([tag, body, final]);
    console.log("====", tag, " RAW ====");
    console.log(body.slice(0, 700));
    console.log("====", tag, " FINAL ====");
    console.log(final.slice(0, 700));
    console.log();
  }
  const [ftmoRaw, ftmoFinal] = [results[0][1], results[0][2]];
  const [movRaw, movFinal] = [results[1][1], results[1][2]];
  const [prRaw, prFinal] = [results[2][1], results[2][2]];
  const checks = [
    ["ftmo_has_tag_or_processed", ftmoRaw.includes("[[SCOPE_DECLINE]]") || /outside|only (handle|set up|here for)|FundedElite support/i.test(ftmoFinal)],
    ["ftmo_final_no_tag", !ftmoFinal.includes("[[SCOPE_DECLINE]]")],
    ["ftmo_no_deep", !/profit split|drawdown|challenge fee/i.test(ftmoFinal)],
    ["movie_tag_or_only_decline", movRaw.includes("[[SCOPE_DECLINE]]") || /outside|only|FundedElite/i.test(movFinal)],
    ["movie_final_no_tag", !movFinal.includes("[[SCOPE_DECLINE]]")],
    ["prohibited_brackets_or_b", /\[\[.+\]\]/.test(prRaw) || /<b>.+<\/b>/.test(prFinal)],
    ["prohibited_final_b", /<b>.+<\/b>/.test(prFinal) && !/\[\[/.test(prFinal)],
    ["unit_all", unitChecks.every((c) => c[1])],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
