require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const OpenAI = require("openai");
const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const cfg = JSON.parse(fs.readFileSync("/home/ubuntu/bot-control.json", "utf8"));
const model = (cfg.config && cfg.config.model) || "gpt-5.6-luna";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const asks = [
  ["prohibited", "What are prohibited strategies?"],
  ["simple", "Is news trading allowed?"],
  ["ftmo", "what is FTMO"],
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
    console.log(out.slice(0, 1200));
    console.log();
  }
  const pr = bodyOf(results[0][1]);
  // heading alone on line: **Term** then newline then explanation (not **Term:** inline same line with long text preferred; allow **Term** or **Term:** on own line)
  const headingOwnLine = /^\*\*[^*\n]+\*\*:?\s*$/m.test(pr);
  const multiHeadings = (pr.match(/^\*\*[^*\n]+\*\*:?\s*$/gm) || []).length >= 2;
  const inlineColonStyle = /\*\*[^*]+:\*\*\s+\S/.test(pr); // old "**Term:** explanation" inline
  const simple = bodyOf(results[1][1]);
  const simpleNoForcedList = !/^\*\*/m.test(simple);
  const ftmo = bodyOf(results[2][1]);
  const checks = [
    ["action_ok", /^ACTION:\s*REPLY\s*\nBODY:/i.test(results[0][1])],
    ["heading_own_line", headingOwnLine],
    ["multi_headings", multiHeadings],
    ["not_old_inline_colon", !inlineColonStyle],
    ["simple_plain", simpleNoForcedList && /allow|yes/i.test(simple)],
    ["ftmo_short", /proprietary trading firm|prop firm/i.test(ftmo) && !/profit split|drawdown|challenge fee/i.test(ftmo)],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
