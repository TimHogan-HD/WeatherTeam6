const {chromium}=require('playwright');(async()=>{const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});const p=await b.newPage({viewport:{width:1100,height:1000}});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text())});
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(800);
const keys=await p.evaluate(()=>Object.keys(WT.JUMPS));
for(const k of keys){await p.evaluate(k=>WT.jump(k),k);await p.waitForTimeout(900);
 const ov=await p.evaluate(()=>{const ph=document.getElementById('phone');const r=ph.getBoundingClientRect();const bad=[];document.querySelectorAll('#app *, .pg:not([hidden]) *').forEach(e=>{const q=e.getBoundingClientRect();if(q.width&&q.right>r.right+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('svg,.map,.dsel,.wk,.tune'))bad.push(e.className||e.tagName)});const s=document.getElementById('scr');return {bad:[...new Set(bad)].slice(0,5),sw:s?s.scrollWidth-s.clientWidth:0}});
 if(ov.bad.length||ov.sw>0)console.log(k,'overflow',JSON.stringify(ov));
 await p.locator('#phone').screenshot({path:require('os').tmpdir()+`/${k}.png`})}
console.log('errors',errs.length,errs.slice(0,10).join('\n'));await b.close()})();
