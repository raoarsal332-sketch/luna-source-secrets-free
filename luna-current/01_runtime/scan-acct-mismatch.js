require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const token = process.env.INTERCOM_TOKEN || process.env.INTERCOM_ACCESS_TOKEN;
const ARSAL = "10118526";
const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Intercom-Version": "2.11" };
function strip(h){return String(h||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function accts(t){
  const out=[];
  for (const m of String(t).matchAll(/\b(\d{5,12})\b/g)) {
    if(/^(19|20)\d{2}$/.test(m[1])) continue;
    if(/^(\d)\1+$/.test(m[1])) continue;
    out.push(m[1]);
  }
  for (const m of String(t).matchAll(/\b([A-Za-z]\d{5,})\b/g)) out.push(m[0]);
  return [...new Set(out)];
}
function arsalNums(body) {
  const out = [];
  const re1 = /\b(?:noted|account(?:\s+number)?|login(?:\s+id)?|for account|on (?:this )?account|account is)\b[^0-9A-Za-z]{0,30}([A-Za-z]?\d{5,12})\b/gi;
  const re2 = /\baccount(?:\s+number)?\s*[#:]?\s*([A-Za-z]?\d{5,12})\b/gi;
  for (const re of [re1, re2]) {
    for (const m of body.matchAll(re)) if (m[1]) out.push(m[1]);
  }
  // "I've noted account number X"
  for (const m of body.matchAll(/noted\s+account(?:\s+number)?\s+([A-Za-z]?\d{5,12})/gi)) out.push(m[1]);
  return [...new Set(out)];
}
(async () => {
  const since = Math.floor(Date.now()/1000) - 86400*5;
  let starting_after = null;
  let convos = [];
  for (let page=0; page<4; page++) {
    const body = {
      query: { operator: "AND", value: [{ field: "updated_at", operator: ">", value: since }] },
      pagination: { per_page: 50 },
    };
    if (starting_after) body.pagination.starting_after = starting_after;
    const r = await axios.post("https://api.intercom.io/conversations/search", body, { headers });
    convos = convos.concat(r.data.conversations || []);
    starting_after = r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!starting_after) break;
  }
  console.log("convos", convos.length);
  let mismatches = 0, notedOk = 0, arsalWithNum = 0;
  const samples = [];
  for (const c of convos.slice(0, 80)) {
    const full = await axios.get(`https://api.intercom.io/conversations/${c.id}`, { headers }).then(x=>x.data).catch(()=>null);
    if (!full) continue;
    const parts = (full.conversation_parts && full.conversation_parts.conversation_parts) || [];
    const clientNums = new Set();
    const clientTexts = [];
    const src = full.source || {};
    if (src.body && (src.author?.type==="user"||src.author?.type==="lead")) {
      clientTexts.push(strip(src.body));
      for (const a of accts(strip(src.body))) clientNums.add(a);
    }
    for (const p of parts) {
      const a = p.author || {};
      const body = strip(p.body);
      if (!body || p.part_type === "note") continue;
      if (a.type === "user" || a.type === "lead") {
        clientTexts.push(body);
        for (const n of accts(body)) clientNums.add(n);
      }
      if (String(a.id) !== ARSAL) continue;
      for (const num of arsalNums(body)) {
        arsalWithNum++;
        const digits = num.replace(/^[A-Za-z]/,"");
        const ok = clientNums.has(num) || clientNums.has(digits) || [...clientNums].some(x => x.replace(/^[A-Za-z]+/,"") === digits);
        if (ok) { notedOk++; continue; }
        // allow if number appears in ANY client text as substring of longer? already covered
        mismatches++;
        const name = (full.contacts && full.contacts.contacts && full.contacts.contacts[0] && full.contacts.contacts[0].name) || (full.source && full.source.author && full.source.author.name) || "?";
        if (samples.length < 15) {
          samples.push({ id: c.id, name, num, client: [...clientNums], line: body.slice(0,260), first: accts(clientTexts.join("\n"))[0] || null });
        }
      }
    }
  }
  console.log(JSON.stringify({ arsalWithNum, notedOk, mismatches }, null, 2));
  for (const s of samples) {
    console.log("\nMISMATCH", s.id, s.name);
    console.log("  Luna:", s.num, "| client:", s.client.join(",") || "(none)", "| first-extract:", s.first);
    console.log("  ", s.line);
  }
})().catch(e => console.error(String(e.response && e.response.data ? JSON.stringify(e.response.data) : e.message).slice(0,500)));
