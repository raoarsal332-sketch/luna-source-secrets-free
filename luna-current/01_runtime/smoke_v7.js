require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const OpenAI = require("openai");
// load toHtml from index by eval of function only
const indexSrc = fs.readFileSync("/home/ubuntu/index.js", "utf8");
const m = indexSrc.match(/function toHtml\(text\) \{[\s\S]*?\n\}/);
if (!m) throw new Error("toHtml missing");
eval(m[0]);
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
  const mm = s.match(/^ACTION:\s*REPLY\s*\nBODY:\s*([\s\S]*)$/i);
  return mm ? mm[1].trim() : s;
}
(async () => {
  const q = "What are prohibited strategies?";
  const ai = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: wrap(q) },
    ],
  });
  const out = (((ai.choices[0] || {}).message || {}).content || "").trim();
  const body = bodyOf(out);
  console.log("==== prohibited ====\n" + body.slice(0, 1400) + "\n");
  const html = toHtml(body);
  console.log("==== html preview ====\n" + html.slice(0, 900) + "\n");
  const checks = [
    ["action_ok", /^ACTION:\s*REPLY\s*\nBODY:/i.test(out)],
    ["literal_stars", /\*\*[^*\n]+\*\*/.test(body)],
    ["heading_own_line", /^\*\*[^*\n]+\*\*\s*$/m.test(body)],
    ["bullet_char", /(^|\n)• /.test(body) || body.includes("• ")],
    ["html_strong", /<strong>[^<]+<\/strong>/.test(html)],
    ["html_no_raw_stars_around_heading", !/\*\*[^*\n]+\*\*/.test(html.replace(/<br>/g, "\n").split("\n").filter((l) => l.includes("<strong>")).join("\n") ) || /<strong>/.test(html)],
    ["html_keeps_bullet", html.includes("•")],
  ];
  // clearer: after toHtml, no unconverted ** pairs for headings
  checks.push(["html_converted_bold", /<strong>/.test(html) && !/\*\*[^*\n]+\*\*/.test(html)]);
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
