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
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
// crude template detection: same structure with only firm name swapped
function firmAgnostic(s) {
  return norm(s)
    .replace(/\bftmo\b/g, "FIRM")
    .replace(/\bfundingpips\b/g, "FIRM")
    .replace(/\bthe5ers\b/g, "FIRM")
    .replace(/\bthe 5ers\b/g, "FIRM");
}
(async () => {
  const q1 = "what is FTMO";
  const a1 = bodyOf(
    (
      await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: wrap(
              q1,
              "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " + q1
            ),
          },
        ],
      })
    ).choices[0].message.content.trim()
  );
  console.log("==== ftmo ====\n" + a1 + "\n");

  const q2 = "what is FundingPips";
  const a2 = bodyOf(
    (
      await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: wrap(
              q2,
              "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " +
                q1 +
                "\nArsal: " +
                a1 +
                "\nClient: " +
                q2
            ),
          },
        ],
      })
    ).choices[0].message.content.trim()
  );
  console.log("==== fundingpips ====\n" + a2 + "\n");

  const q3 = "ok and what about The5ers";
  const a3 = bodyOf(
    (
      await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: wrap(
              q3,
              "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: " +
                q1 +
                "\nArsal: " +
                a1 +
                "\nClient: " +
                q2 +
                "\nArsal: " +
                a2 +
                "\nClient: " +
                q3
            ),
          },
        ],
      })
    ).choices[0].message.content.trim()
  );
  console.log("==== the5ers ====\n" + a3 + "\n");

  // also same FAQ asked twice should rephrase
  const news1 = bodyOf(
    (
      await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: wrap(
              "Is news trading allowed?",
              "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: Is news trading allowed?"
            ),
          },
        ],
      })
    ).choices[0].message.content.trim()
  );
  const news2 = bodyOf(
    (
      await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: wrap(
              "can you tell me again is news trading allowed?",
              "Client: Hi\nArsal: Hey, this is Arsal. What can I help you with?\nClient: Is news trading allowed?\nArsal: " +
                news1 +
                "\nClient: can you tell me again is news trading allowed?"
            ),
          },
        ],
      })
    ).choices[0].message.content.trim()
  );
  console.log("==== news1 ====\n" + news1 + "\n");
  console.log("==== news2 ====\n" + news2 + "\n");

  const fa1 = firmAgnostic(a1);
  const fa2 = firmAgnostic(a2);
  const fa3 = firmAgnostic(a3);
  const checks = [
    ["ftmo_scope", /prop|firm|fundedelite|can.?t|cannot|only/i.test(a1)],
    ["no_deep_comp", !/profit split|drawdown|challenge fee|evaluation phase/i.test(a1 + a2 + a3)],
    ["not_verbatim_1_2", norm(a1) !== norm(a2)],
    ["not_verbatim_2_3", norm(a2) !== norm(a3)],
    ["not_same_template_swap", fa1 !== fa2 && fa2 !== fa3],
    ["news_both_allow", /allow|yes|permitted/i.test(news1) && /allow|yes|permitted/i.test(news2)],
    ["news_not_identical", norm(news1) !== norm(news2)],
    ["no_luna", !/\bluna\b/i.test(a1 + a2 + a3 + news1 + news2)],
  ];
  console.log("CHECKS", JSON.stringify(checks));
  console.log("PASS", checks.filter((c) => c[1]).length, "/", checks.length);
  console.log("FIRM_AGNOSTIC", JSON.stringify({ fa1, fa2, fa3 }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
