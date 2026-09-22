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
function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
(async () => {
  const q1 = "what is FTMO";
  const a1raw = (
    await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q1, "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " + q1) },
      ],
    })
  ).choices[0].message.content.trim();
  const a1 = bodyOf(a1raw);
  console.log("==== ftmo ====\n" + a1 + "\n");

  const q2 = "what is FundingPips";
  const hist2 =
    "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " +
    q1 +
    "\nArsal: " +
    a1 +
    "\nClient: " +
    q2;
  const a2raw = (
    await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q2, hist2) },
      ],
    })
  ).choices[0].message.content.trim();
  const a2 = bodyOf(a2raw);
  console.log("==== fundingpips ====\n" + a2 + "\n");

  const q3 = "ok and what about The5ers";
  const hist3 = hist2 + "\nArsal: " + a2 + "\nClient: " + q3;
  const a3raw = (
    await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: wrap(q3, hist3) },
      ],
    })
  ).choices[0].message.content.trim();
  const a3 = bodyOf(a3raw);
  console.log("==== the5ers ====\n" + a3 + "\n");

  const n1 = norm(a1);
  const n2 = norm(a2);
  const n3 = norm(a3);
  const checks = [
    ["ftmo_id", /proprietary trading firm|prop firm|prop trading/i.test(a1)],
    ["ftmo_no_deep", !/profit split|drawdown|challenge fee|evaluation phase/i.test(a1)],
    ["fp_id_or_decline", /prop|firm|can.?t help|cannot help|don.?t know|only help|fundedelite/i.test(a2)],
    ["fp_no_deep", !/profit split|drawdown|challenge fee|evaluation phase/i.test(a2)],
    ["not_verbatim_1_2", n1 !== n2],
    ["not_verbatim_2_3", n2 !== n3],
    ["not_verbatim_1_3", n1 !== n3],
    ["no_luna", !/\bluna\b/i.test(a1 + a2 + a3)],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
