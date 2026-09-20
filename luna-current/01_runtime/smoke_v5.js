require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const OpenAI = require("openai");
const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const cfg = JSON.parse(fs.readFileSync("/home/ubuntu/bot-control.json", "utf8"));
const model = (cfg.config && cfg.config.model) || "gpt-5.6-luna";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
function wrap(q, hist) {
  return (
    "Client name: Bot test\nClient email: test@example.com\nConversation id: 215475912143086\n\nFULL TICKET HISTORY:\n" +
    (hist || "[user] " + q) +
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
  const cases = [
    ["fresh_intro", "Hi, I need help with my account.", null],
    ["no_reintro", "Is news trading allowed?", "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: Is news trading allowed?"],
    ["whats_your_name", "What's your name?", null],
    ["ai_ask", "Are you an AI or a human?", "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: Are you an AI or a human?"],
  ];
  const results = [];
  for (const [tag, q, hist] of cases) {
    const ai = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q, hist) },
      ],
    });
    const out = (((ai.choices[0] || {}).message || {}).content || "").trim();
    results.push([tag, out]);
    console.log("====", tag, "====");
    console.log(out.slice(0, 700));
    console.log();
  }
  const intro = bodyOf(results[0][1]);
  const news = bodyOf(results[1][1]);
  const name = bodyOf(results[2][1]);
  const aiq = bodyOf(results[3][1]);
  const checks = [
    ["fresh_arsal", /arsal/i.test(intro)],
    ["fresh_not_luna", !/\bluna\b/i.test(intro)],
    ["no_reintro", !/this is arsal|i'?m arsal|hey,? this is/i.test(news) && /allow|yes/i.test(news)],
    ["name_arsal", /arsal/i.test(name) && !/\bluna\b/i.test(name)],
    ["ai_honest", /\bai\b/i.test(aiq) && !/\bi'?m (a )?human\b/i.test(aiq)],
    ["ai_no_luna", !/\bluna\b/i.test(aiq)],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
