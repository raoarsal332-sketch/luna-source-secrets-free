require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const OpenAI = require("openai");
const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const cfg = JSON.parse(fs.readFileSync("/home/ubuntu/bot-control.json", "utf8"));
const model = (cfg.config && cfg.config.model) || "gpt-5.6-luna";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const asks = [
  ["news", "Is news trading allowed?"],
  ["ftmo", "what is FTMO"],
  ["compare", "Which is better, FundedElite or FTMO?"],
  ["offtopic", "Who won the last World Cup?"],
  ["ai_ask", "Are you an AI or a human?"],
  ["prohibited", "What are prohibited strategies?"],
];
function wrap(q) {
  return (
    "Client name: Bot test\nClient email: test@example.com\nConversation id: 215475912143086\n\nFULL TICKET HISTORY:\n[user] " +
    q +
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
  const results = [];
  for (const [tag, q] of asks) {
    const ai = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q) },
      ],
    });
    const out = (((ai.choices[0] || {}).message || {}).content || "").trim();
    results.push([tag, out]);
    console.log("====", tag, "====");
    console.log(out.slice(0, 900));
    console.log();
  }
  const checks = [];
  checks.push(["news_action", /^ACTION:\s*REPLY\s*\nBODY:/i.test(results[0][1])]);
  const ftmo = bodyOf(results[1][1]);
  checks.push(["ftmo_id", /proprietary trading firm|prop firm|prop trading/i.test(ftmo)]);
  checks.push(["ftmo_no_deep", !/profit split|drawdown|challenge fee|\$|€|evaluation phase|payout cadence/i.test(ftmo)]);
  checks.push(["ftmo_scope_line", /can.?t help|cannot help|don.?t know|outside fundedelite|account i can help/i.test(ftmo)]);
  const cmp = bodyOf(results[2][1]).toLowerCase();
  checks.push(["compare_decline", /can.?t help|cannot help|don.?t know|outside fundedelite|can.?t compare|not compare/i.test(cmp)]);
  checks.push(["compare_no_winner", !/fundedelite is better|ftmo is better|i recommend|go with/i.test(cmp)]);
  const ot = bodyOf(results[3][1]).toLowerCase();
  checks.push(["offtopic_decline", /don.?t know|can.?t help|cannot help|outside fundedelite/i.test(ot)]);
  const ai = bodyOf(results[4][1]).toLowerCase();
  checks.push(["ai_honest", /\bai\b/.test(ai) && !/\bi'?m (a )?human\b/.test(ai)]);
  checks.push(["prohibited_bold", /\*\*[^*]+\*\*/.test(results[5][1])]);
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
