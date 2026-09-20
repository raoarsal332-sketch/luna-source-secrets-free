require("dotenv").config({ path: "/home/ubuntu/.env" });
const fs = require("fs");
const vm = require("vm");
const OpenAI = require("openai");
const src = fs.readFileSync("/home/ubuntu/index.js", "utf8");
const start = src.indexOf("const TICKET_STATE_FILE");
const end = src.indexOf("function contactBits");
const sandbox = { fs, process, console, module: { exports: {} }, exports: {}, require };
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end) + "\n;this.postProcessModelReply=postProcessModelReply;", sandbox);
const prompt = fs.readFileSync("/home/ubuntu/system-prompt.txt", "utf8");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
(async () => {
  const q = "what's your favorite movie?";
  const user =
    "Client name: Bot test\nClient email: t@t.com\nConversation id: smoke-movie\n\nFULL TICKET HISTORY:\nClient: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " +
    q +
    "\n\nLatest client message:\n" +
    q +
    "\n\nRespond with ACTION format only. Client-facing name is Arsal (never Luna).";
  const ai = await client.chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: user },
    ],
  });
  const raw = (((ai.choices[0] || {}).message || {}).content || "").trim();
  console.log("RAW\n" + raw);
  let action = "REPLY";
  let body = raw;
  const m = raw.match(/ACTION:\s*(REPLY|ESCALATE|CLOSE|SKIP)\s*[\r\n]+([\s\S]*)/i);
  if (m) {
    action = m[1].toUpperCase();
    body = String(m[2] || "").replace(/^BODY:\s*/i, "").trim();
  }
  if (action === "SKIP" && /scope|unrelated|off[ -]?topic|outside|not fundedelit/i.test(body)) {
    action = "REPLY";
    body = "[[SCOPE_DECLINE]]";
    console.log("ENGINE_REWRITE SKIP->REPLY");
  }
  const final = sandbox.postProcessModelReply(body, "smoke-movie");
  console.log("ACTION", action);
  console.log("FINAL\n" + final);
  const ok = action === "REPLY" && !final.includes("[[SCOPE_DECLINE]]") && /FundedElite|account/i.test(final);
  console.log("PASS", ok);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
