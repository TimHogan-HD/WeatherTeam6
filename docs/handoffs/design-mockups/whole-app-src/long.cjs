// node long.cjs file.html key1,key2 outprefix : shoots each screen at successive scroll offsets, montage per key
const {chromium}=require('playwright');const fs=require('fs');(async()=>{const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});const p=await b.newPage({viewport:{width:1100,height:1000}});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text())});
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(800);
for(const k of process.argv[3].split(',')){const [key,tab]=k.split(':');await p.evaluate(k=>WT.jump(k),key);
 if(tab)await p.evaluate(t=>{const b=[...document.querySelectorAll('[data-hv],[data-v],button')].find(x=>x.textContent.trim()===t);b&&b.click()},tab);
 await p.waitForTimeout(1500);
 const n=await p.evaluate(()=>{const c=[...document.querySelectorAll('#scr,.pg:not([hidden])')].filter(e=>e.offsetParent!==null&&e.scrollHeight>e.clientHeight+5);window.__sc=c[0];return c[0]?Math.ceil((c[0].scrollHeight-c[0].clientHeight)/700)+1:1});
 const files=[];for(let i=0;i<Math.min(n,6);i++){await p.evaluate(i=>{if(window.__sc){window.__sc.scrollTop=i*700}},i);await p.waitForTimeout(500);const f=`${process.argv[4]}_${key}${tab||''}_${i}.png`;await p.locator('#phone').screenshot({path:f});files.push(f)}
 fs.writeFileSync('m.html',`<body style="margin:0;background:#000;display:flex;gap:8px">${files.map(f=>`<img src="file://${process.cwd()}/${f}" style="width:390px">`).join('')}</body>`);
 const q=await b.newPage({viewport:{width:files.length*398,height:844}});await q.goto('file://'+process.cwd()+'/m.html');await q.waitForTimeout(300);await q.screenshot({path:`${process.argv[4]}_${key}${tab||''}.png`});await q.close()}
console.log('errors',errs.length,errs.slice(0,5).join('\n'));await b.close()})();
