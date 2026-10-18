const {run,check}=require('./harness.js');
const V=require('./cases/varied.js');
(async()=>{
 let tot=0,ok=0,fr=0,leaks=0;const bad=[];const reasons={};
 for(const [id,qs] of Object.entries(V.SUPPORTED))for(const q of qs){tot++;const r=await run(q);
   const pass=id==='atom.handoff.unverified.en'?false:(!r.abstain&&r.answerId===id);
   if(pass)ok++;else{bad.push([id,q,r.abstain?r.action+':'+r.reason:'answered:'+r.answerId]);if(r.abstain){fr++;reasons[r.reason]=(reasons[r.reason]||0)+1}}}
 let nl=0;for(const [c,q,k] of V.MUST_NOT_ANSWER){const r=await run(q);if(!r.abstain){nl++;console.log('LEAK',c,q,r.answerId)}else if(k==='handoff'&&r.action!=='handoff'&&process.env.STRICTK)console.log('kind',c,r.action,r.reason)}
 console.log({tot,ok,falseRefusals:fr,wrongId:tot-ok-fr,leaks:nl,reasons});
 if(!process.env.QUIET)for(const b of bad)console.log(b.join(' | '));
})();
