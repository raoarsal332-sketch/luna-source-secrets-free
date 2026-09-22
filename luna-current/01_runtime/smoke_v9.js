require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const OpenAI = require("openai");
const indexSrc = fs.readFileSync("/home/ubuntu/index.js", "utf8");
eval(indexSrc.match(/function toHtml\(text\) \{[\s\S]*?\n\}/)[0]);
const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const cfg = JSON.parse(fs.readFileSync("/home/ubuntu/bot-control.json", "utf8"));
const model = (cfg.config && cfg.config.model) || "gpt-5.6-luna";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
function wrap(q) {
  return (
    "Client name: Bot test\nClient email: test@example.com\nConversation id: 215475912143086\n\nFULL TICKET HISTORY:\nClient: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " +
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
  const asks = [
    ["prohibited", "What are prohibited strategies?"],
    ["bullets", "Under other prohibited practices, list multiple profiles, third-party payment cards, gambling-style trading, and geo bypass attempts."],
    ["simple", "Is news trading allowed?"],
  ];
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
    const body = bodyOf(out);
    results.push([tag, body]);
    console.log("====", tag, "====");
    console.log(body.slice(0, 900));
    console.log("--- html ---");
    console.log(toHtml(body).slice(0, 500));
    console.log();
  }
  const pr = results[0][1];
  const bu = results[1][1];
  const sm = results[2][1];
  const checks = [
    ["prohibited_html_b", /<b>[^<]+<\/b>/.test(pr)],
    ["prohibited_not_md_stars", !/\*\*[^*\n]+\*\*/.test(pr)],
    ["heading_own_line", /^<b>[^<]+<\/b>\s*$/m.test(pr)],
    ["bullets_b", /<b>[^<]+<\/b>/.test(bu)],
    ["bullets_dot", bu.includes("• ")],
    ["html_preserves_b", /<b>[^<]+<\/b>/.test(toHtml(pr))],
    ["html_no_escaped_b", !/&lt;b&gt;/.test(toHtml(pr))],
    ["simple_plain", !/<b>/.test(sm) && /allow|yes/i.test(sm)],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
