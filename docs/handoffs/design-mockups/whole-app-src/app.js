/* ================= WHOLE APP v4: every screen in the crag pages' own components ================= */
(()=>{
const D=window.DATA,qa=(s,r=document)=>[...r.querySelectorAll(s)];
const col=s=>s==null?'#5b5d63':BAND(s)[0],hic=s=>s==null?'#8a8c93':BAND(s)[1];
const cls=s=>s==null?'':s>=60?'g':s>=40?'fa':'po';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
/*SHARED*/
const LOCS=[
 {id:'ss',name:'Sandstone',rock:'Sandstone (hard quartz)',crag:true,ll:[46.1316,-92.8589]},
 {id:'tf',name:'Taylors Falls',rock:'Basalt (dense)',crag:true,ll:[45.3955,-92.6616]},
 {id:'dl',name:"Devil's Lake",rock:'Quartzite',crag:true,ll:[43.418,-89.715]},
 {id:'rw',name:'Red Wing',rock:'Dolomite or limestone (with chert)',crag:true,ll:[44.5625,-92.5338]},
 {id:'mp',name:'Minneapolis',crag:false,ll:[44.9778,-93.265]}];
const TABS=['Overview','Daily','Hourly','Precip','Rock','Crag'];
const toast=m=>{const t=$('toast');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),1600)};
const hr12=v=>{v=((v%24)+24)%24;return v===0?'12 am':v<12?v+' am':v===12?'12 pm':(v-12)+' pm'};
const HL=h=>h===0?'12 AM':h<12?h+' AM':h===12?'12 PM':(h-12)+' PM';
const dirName=d=>['N','NE','E','SE','S','SW','W','NW'][Math.round(((d%360)+360)%360/45)%8];

/* ---------- pieces ---------- */
const lights=a=>`<div class="gw">${a.map(([l,t,w,h,c,o,b,an])=>`<div class="light" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px;background:${c};opacity:${o};filter:blur(${b}px);animation:${an} ease-in-out infinite alternate"></div>`).join('')}</div>`;
const backBtn=lab=>`<button class="back" data-back aria-label="${lab}">${I.back}</button>`;
const bk=(lab,fb=true)=>`<div class="bk">${backBtn(lab==='Back'?'Back':'Back to '+lab)}<span class="bl">${lab}</span>${fb?'<button class="fbt" data-go="feedback">Feedback</button>':''}</div>`;
const srcs=city=>`<details><summary>Sources</summary><dl><dt>Forecast</dt><dd>Open-Meteo · GFS, ECMWF, ICON, GEM</dd><dt>Precip</dt><dd>Open-Meteo past hours</dd>${city?'':'<dt>Crag</dt><dd>OpenBeta community data (CC0), Nov 16, 2026</dd><dt>Sunshine</dt><dd>GFS via Open-Meteo</dd><dt>Sun</dt><dd>USGS 3DEP lidar and AWS Terrarium terrain, Nov 16, 2026</dd>'}</dl></details>`;
const foot=(city,{rearr=false,edit=false}={})=>`<div class="cfoot">${rearr?'<button class="re" data-rearr>Rearrange cards</button>':''}${srcs(city)}${city?'':'<button class="ln" data-go="check"><span>Check this forecast</span><span>›</span></button>'}${edit?'<button class="ln" data-go="edit"><span>Edit crag</span><span>›</span></button>':''}<button class="ln dg" data-remove><span>Remove location</span><span></span></button></div>`;
const stat=(v,u,l)=>`<div class="stat"><b>${v}${u?`<small>${u}</small>`:''}</b><span class="lbl f">${l}</span></div>`;
const chips=(a,sel,extra='')=>`<div class="chips ${extra}" data-single>${a.map(x=>`<button aria-pressed="${x===sel}">${x}</button>`).join('')}</div>`;
const seg=(a,sel,attr='')=>`<div class="seg" ${attr}>${a.map(([k,n])=>`<button aria-pressed="${k===sel}" data-v="${k}">${n}</button>`).join('')}</div>`;
/* bars, the Days page's own: [label, score|null, value text, under] */
const vbars=(rows,sel,{h=170,attr='',max=100,valFmt=null}={})=>`<div class="vb" style="height:${h}px" ${attr}>${rows.map(([d,s,v,w,amt],i)=>{const un=s==null&&amt==null;const k=amt!=null?amt:s;
 return `<div class="col${i===sel?' on':''}${un?' un':''}" style="--c:${amt!=null?'#a5b4fc':col(s)};--hi:${amt!=null?'#dfe4ff':hic(s)}"><span class="v" style="color:${amt!=null?'#fff':un?'':col(s)}">${v??(s??'—')}</span><div class="bar" data-h="${un?Math.round((h-60)*.55):Math.max(6,Math.round((h-60)*(k/max)))}" style="height:0"></div><span class="d">${d}</span>${w!=null?`<span class="w">${w}</span>`:''}<button data-bar="${i}" aria-label="${d}"></button></div>`}).join('')}</div>`;
function grow(root){const bs=qa('.bar[data-h],.hb i[data-h],.tube i[data-h]',root);requestAnimationFrame(()=>requestAnimationFrame(()=>bs.forEach((b,k)=>{b.style.transitionDelay=(RM?0:k*45)+'ms';b.style.height=b.dataset.h+(b.closest('.tube')?'%':'px')})))}
function rollIn(root){qa('[data-roll]',root).forEach((n,k)=>{const v=n.dataset.roll,suf=n.dataset.suf||'';if(RM){roll(n,v,suf);return}n.dataset.v='';roll(n,v.replace(/\d/g,'0').replace(/^0+(?=\d)/,m=>' '.repeat(m.length)),suf);setTimeout(()=>roll(n,v,suf),160+k*70)})}

/* ================= screens ================= */
const S={};
S.login=()=>`<div class="sin">${lights([[-80,60,340,260,'#a5b4fc',.22,60,'drift1 8s'],[180,320,260,220,'#ffd36b',.12,56,'drift2 7s']])}
 <div class="pad20" style="padding-top:96px;position:relative"><div class="fr" style="font-size:46px;letter-spacing:-.04em">WeatherTeam6</div>
 <p class="und">Sign in to see your locations.</p>
 <label class="fld" style="margin-top:34px"><span>Username</span><input autocomplete="username" autocapitalize="none" spellcheck="false"></label>
 <label class="fld"><span>Passphrase</span><input type="password" autocomplete="current-password"></label>
 <button class="pill wide" style="margin-top:30px" data-go="list" data-reset>Sign in</button></div></div>`;
S.join=()=>`<div class="sin">${lights([[-60,40,320,240,'#b8f542',.12,60,'drift1 8s'],[200,360,220,200,'#a5b4fc',.14,56,'drift2 7s']])}
 <div class="pad20" style="padding-top:96px;position:relative"><div class="fr" style="font-size:46px;letter-spacing:-.04em">WeatherTeam6</div>
 <p class="und">You’ve been invited. Pick a username and passphrase.</p>
 <label class="fld" style="margin-top:30px"><span>Username</span><input autocomplete="username" autocapitalize="none" spellcheck="false"></label>
 <label class="fld"><span>Passphrase</span><input type="password" autocomplete="new-password"><span class="hint">At least 12 characters. A few unrelated words works well.</span></label>
 <label class="fld"><span>Repeat passphrase</span><input type="password" autocomplete="new-password"></label>
 <button class="pill wide" style="margin-top:30px" data-go="welcome" data-reset>Create account</button>
 <p class="note" style="margin-top:26px">Without a code in the link, this screen reads “This link is missing its invite code. Ask for a new one.”</p></div></div>`;

let wkSel=2;
const WK=()=>{const hi=RNG.wT?RNG.wT[1]:60;return [['Thu',47],['Fri',100],['Sat',hi>=78?100:75],['Sun',41],['Mon',71]]};
const RNG={};
S.welcome=()=>`<div class="sin">${lights([[-90,10,360,260,'#b8f542',.13,60,'drift1 8s'],[160,900,280,240,'#a5b4fc',.1,60,'drift2 9s']])}
 <div class="bk"><span class="bl" style="color:#fff;font-weight:600">Welcome</span><button class="fbt" data-go="list" data-reset>Skip</button></div>
 <div class="ttl"><h1>Welcome to WeatherTeam6</h1><p class="body" style="font-size:15.5px">A few settings before you start. The score depends on them, so they’re worth a minute. You can change any of this later on Profile.</p></div>
 <div class="os"><h2>Reading the score</h2>
  <div class="legend"><div style="border-color:#b8f542"><b style="color:#b8f542">60</b><small>and up</small></div><div style="border-color:#f6ad55"><b style="color:#f6ad55">40</b><small>to 59</small></div><div style="border-color:#fc8181"><b style="color:#fc8181">0</b><small>to 39</small></div><div style="border-color:rgba(255,255,255,.25)"><b style="color:var(--t3)">—</b><small>no data</small></div></div>
  <ul class="dots"><li>0 to 100: how dry the rock is and how good the grip is likely to be.</li><li>A day’s score is its best 3 hours in a row inside your climbing hours.</li><li>— means forecast data is missing. The app leaves a gap rather than guess.</li><li>Weather warnings show beside the score and never change it.</li></ul></div>
 <div class="os"><h2>Climbing preferences</h2><p class="tx">Your climbing hours and temperature range set every score. Change them and watch the example week.</p>
  <div class="fld" style="margin-top:22px"><span style="display:flex;justify-content:space-between">Climbing hours<b data-out="wH" style="color:#fff">8 am to 6 pm</b></span><div class="rng" data-rng="wH" data-min="0" data-max="23" data-lo="8" data-hi="18" data-gap="3" data-unit="h"></div><div class="rngv"><span>12 am</span><span>11 pm</span></div></div>
  <div class="fld"><span style="display:flex;justify-content:space-between">Temperature range<b data-out="wT" style="color:#fff">30°F to 60°F</b></span><div class="rng" data-rng="wT" data-min="0" data-max="85" data-lo="30" data-hi="60" data-gap="10" data-unit="°F"></div><div class="rngv"><span>0°</span><span>85°</span></div></div>
  <button class="link" data-rdef style="padding:14px 0 0;color:var(--t2)"><span>Back to the defaults (30°F to 60°F, 8 am to 6 pm)</span><span></span></button>
  <div class="card" style="margin:22px -10px 0;--rim:#b8f542"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font:600 17px/1 var(--font)">Red Wing</b><span class="lbl f">Example · sample week</span></div>
   <div id="wkW">${vbars(WK().map(([d,s])=>[d,s]),wkSel,{h:150,attr:'data-wk'})}</div>
   <p class="und s" id="wkL" style="margin-top:16px"></p><p class="lbl f" id="wkL2" style="margin-top:6px"></p>
   <div class="cg-wg" style="margin:16px 0 0"><div class="hb" id="wkS" style="grid-template-columns:repeat(24,1fr);height:34px"></div><div class="ax" style="padding:6px 0 0;grid-template-columns:1fr"><div style="grid-template-columns:repeat(4,1fr)"><span style="text-align:left">12a</span><span style="text-align:left">6a</span><span style="text-align:left">12p</span><span style="text-align:left">6p</span></div></div></div></div></div>
 <div class="os"><h2>Open a crag on</h2><p class="tx">The tab you see first when you tap a crag.</p><div style="margin-top:6px">${chips(TABS,'Overview')}</div></div>
 <div class="os"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Feedback</h2><span class="lbl">Feedback</span></div><p class="tx">It’s in the top-right of every screen and comes straight to the person who runs the app. Use it for bugs, ideas, or a score that didn’t match the rock. From a crag, it opens with that crag chosen.</p></div>
 <div class="os"><h2>Add to home screen</h2><p class="tx">Opens like an app and keeps you signed in.</p><ul class="dots"><li>iPhone: Safari › Share › Add to Home Screen</li><li>Android: Chrome › ⋮ › Add to Home screen</li></ul></div>
 <div class="os" style="display:grid;gap:4px"><button class="pill wide" data-go="list" data-reset>Keep the defaults and start</button><button class="link" style="justify-content:center;color:var(--t2)" data-go="list" data-reset><span>Skip for now</span></button></div></div>`;
function drawWeek(){const w=WK(),box=$('wkW');if(!box)return;box.innerHTML=vbars(w.map(([d,s])=>[d,s]),wkSel,{h:150,attr:'data-wk'});grow(box);
 const [d,s]=w[wkSel],hi=RNG.wT?RNG.wT[1]:60,lo=RNG.wT?RNG.wT[0]:30,[a,b]=RNG.wH||[8,18];
 $('wkL').innerHTML=`${d} scores <b style="color:${col(s)}">${s}</b>${hi===60&&lo===30&&a===8&&b===18?' on the defaults':''}. Move the sliders to see it change.`;
 $('wkL2').textContent=d==='Sat'?(hi>=78?`It stays under your ${hi}°F all day.`:`It reaches 78°F in your hours, above your ${hi}°F.`):`${d} in your hours, ${hr12(a)} to ${hr12(b)}.`;
 $('wkS').innerHTML=Array.from({length:24},(_,h)=>{const inH=h>=a&&h<b;const sc=d==='Sat'?(h>=13&&h<18&&hi<78?48:84):s;return `<i data-h="${inH?30:14}" style="--c:${col(sc)};opacity:${inH?1:.3}"></i>`}).join('');grow($('wkS'))}

/* ---------- Conditions ---------- */
let sortBy='score';
S.list=()=>{const L2=LOCS.slice();if(sortBy==='name')L2.sort((a,b)=>a.name.localeCompare(b.name));
 return `<div class="sin">${lights([[-60,40,420,260,'#b8f542',.16,60,'drift1 8s'],[-40,250,120,140,'#e6ff9e',.2,30,'drift2 6s'],[120,520,300,260,'#a5b4fc',.08,60,'drift2 9s']])}
 <div class="w-hd" style="padding-top:8px"><div class="tt"><h1>Conditions</h1><p>5 saved · updated just now</p></div><button class="pill ghost" data-go="add" style="margin-top:4px"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>Add</button></div>
 <div class="words" role="group" aria-label="Sort by"><span class="lab">Sort by</span>${[['score','Score'],['name','Name'],['added','Added']].map(([k,n])=>`<button aria-pressed="${k===sortBy}" data-sort="${k}">${n}</button>`).join('')}</div>
 <div class="lst">${L2.map(l=>l.crag?`<div class="cr" role="button" tabindex="0" data-crag="${l.id}" style="--c:#b8f542">
  <div class="cr-t"><span class="ic">${I.sun(24)}</span><span class="nm">${l.name}</span><span class="sc2"><span data-roll="100"></span><small>now</small></span><span class="ch">›</span></div>
  <div class="cr-r">${l.rock}</div>
  <div class="cr-m">
   <div class="cr-s"><div><b>Dry</b><span>Dryness</span></div><div><b>10a–11p</b><span>Good</span></div><div><b>100</b><span>Today</span></div></div></div>
  <div class="dt" aria-hidden="true"><div class="tk2"><i class="lit" style="left:${10/24*100}%;right:${1/24*100}%"></i><i class="nw" style="left:${9.7/24*100}%"></i></div><div class="tl"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span></span></div></div></div>`
  :`<div class="cr city" role="button" tabindex="0" data-crag="${l.id}"><div class="cr-t"><span class="ic">${I.sun(24)}</span><span class="nm">${l.name}</span><span class="ch">›</span></div>
  <div class="cr-m"><div class="cr-s"><div><b>25–37°F</b><span>Today</span></div><div><b>0%</b><span>Rain</span></div><div><b>Not a crag</b><span>No score</span></div></div></div></div>`).join('')}</div></div>`};

/* ---------- a city: weather only, four tabs ---------- */
let cityTab=0;
function cityChart(){const H=D.mp.slice(11,28),W=378,X0=6,X1=346,Y0=34,Y1=176,n=H.length,xs=i=>X0+(X1-X0)*i/(n-1);
 const lo=10,hi=45,ys=t=>Y1-(t-lo)/(hi-lo)*(Y1-Y0);const air=smooth(H.map((r,i)=>[xs(i),ys(r[2])])),dew=smooth(H.map((r,i)=>[xs(i),ys(r[3])]));
 const lab={0:'now',1:'12p',4:'3p',7:'6p',10:'9p',13:'Thu',16:'3a'};
 return `<svg viewBox="0 0 ${W} 236" role="img" aria-label="Today, hour by hour: air, dew point and chance of rain"><defs><linearGradient id="cfd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
 ${[10,20,40].map(t=>`<line x1="${X0}" x2="${X1}" y1="${ys(t)}" y2="${ys(t)}" stroke="rgba(255,255,255,.07)"/><text x="${X1+8}" y="${ys(t)+4}" fill="#9c9da3" font-size="12" font-family="Space Grotesk">${t}°</text>`).join('')}
 <path d="${dew}" fill="none" stroke="#9c9da3" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>
 <path class="wash" d="${air} L${xs(n-1)} ${Y1+4} L${xs(0)} ${Y1+4}Z" fill="url(#cfd)"/>
 <path class="draw" pathLength="1" d="${air}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
 <line x1="${xs(0)}" x2="${xs(0)}" y1="${Y0-10}" y2="${Y1+6}" stroke="rgba(255,255,255,.3)" stroke-dasharray="1 4" stroke-linecap="round"/>
 ${H.map((r,i)=>{const rr=r[6]>0?Math.max(2.5,Math.sqrt(r[6]/100)*18):1.4;return `<circle cx="${xs(i)}" cy="198" r="${rr}" fill="${r[6]>0?'#fff':'rgba(255,255,255,.28)'}"/>`}).join('')}
 ${Object.entries(lab).map(([i,t])=>`<text x="${xs(+i)}" y="226" text-anchor="middle" fill="#9c9da3" font-size="12" font-family="Space Grotesk">${t}</text>`).join('')}
 <circle class="halo" cx="${xs(0)}" cy="${ys(H[0][2])}" r="9" fill="#fff"/><circle cx="${xs(0)}" cy="${ys(H[0][2])}" r="5.5" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="2"/></svg>`}
const CDAYS=[['Today','Nov 25',25,37,0],['Thu','Nov 26',24,38,0],['Fri','Nov 27',24,40,14],['Sat','Nov 28',31,43,17],['Sun','Nov 29',30,36,17],['Mon','Nov 30',28,36,14]];
const dayRows=(rows,{score=false}={})=>{const LO=Math.min(...rows.map(d=>d[2])),HI=Math.max(...rows.map(d=>d[3]));return rows.map(([d,dt,lo,hi,r])=>{const a=(lo-LO)/(HI-LO)*100,b=(hi-LO)/(HI-LO)*100;
 return `<div class="row" role="button" tabindex="0" data-ctab="2"><div class="dn"><b>${d}</b><span class="lbl f">${dt}</span></div><div class="range hatch"><i style="left:${a}%;right:${100-b}%"></i><em style="left:calc(${a}% - 6px)">${lo}°</em><em style="left:calc(${b}% - 12px)">${hi}°</em></div><div class="rc">${r}<small style="font-size:12px;color:var(--t2)">%</small></div></div>`}).join('')};
const CP=[];
CP[0]=()=>`${lights([[-60,60,420,260,'#a5b4fc',.2,60,'drift1 8s'],[-40,120,120,140,'#dfe4ff',.18,30,'drift2 6s']])}
 <div class="pad20" style="margin-top:18px;position:relative"><div class="fr w"><span data-roll="34"></span><small>°F</small></div><p class="und">Air now</p></div>
 <div class="stats pad20" style="position:relative">${stat('37','°F','High')}${stat('25','°F','Low')}${stat('63','%','Humidity')}${stat('5','mph','Wind')}</div>
 <p class="lbl f pad20" style="margin-top:14px">44.9778, −93.2650</p><p class="lbl pad20" style="margin-top:4px">Last rain: 3d 9h ago · Humidity 63% · wind 5 mph · gusts 8 mph</p>
 <div class="sec"><h2>Today</h2><div style="margin-top:12px"><span class="cchip">Now<span><i style="background:#fff"></i>air <b>34°</b></span><span><i style="background:#9c9da3"></i>dew <b>23°</b></span><span><i style="background:#a5b4fc"></i>rain <b>0%</b></span></span></div></div>
 <div class="tc">${cityChart()}</div>
 <div class="key"><span class="lbl f"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>air</span><span class="lbl f"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#9c9da3" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/></svg>dew point</span><span class="lbl f"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>chance of rain</span></div>
 <div class="sec"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Next days</h2><span class="lbl f">high/low · chance of rain</span></div><div style="margin-top:22px">${dayRows(CDAYS)}</div></div>
 <div class="sec"><h2>Right now</h2><div style="margin-top:6px">
  <button class="hl2" data-ctab="3"><span class="k"><b>Last rain</b>Sun</span><span class="v">0.09 in<small>3d 9h ago</small></span><span class="c">›</span></button>
  <button class="hl2" data-ctab="3"><span class="k"><b>Next rain</b>through Tue 12/1</span><span class="v">None likely</span><span class="c">›</span></button>
  <button class="hl2" data-ctab="2"><span class="k"><b>Wind</b>gusts 8</span><span class="v">5 mph</span><span class="c">›</span></button></div>
  <p class="lbl f" style="margin-top:10px">Air: HRRR</p></div>${foot(true,{rearr:true})}`;
CP[1]=()=>`${lights([[-30,120,450,250,'#a5b4fc',.16,60,'drift1 8s']])}
 <div class="sec" style="margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Seven days</h2><span class="lbl f">low–high · chance of rain</span></div><div style="margin-top:24px">${dayRows(CDAYS)}</div>
 <p class="note">The bar spans each day from low to high, on one scale for the week. Chance of rain is the highest hourly share of wet ensemble members. Tap a day for its hours.</p></div>${foot(true)}`;
let hOpen=10,hChip='All';
const hDet=(r,city)=>`<div class="hdt"><div><span class="lbl f">Temperature</span><b>${r[2]}°</b><small>likely ${r[16]}–${r[17]}°</small></div><div><span class="lbl f">Humidity</span><b>${r[4]}%</b></div><div><span class="lbl f">Dew point</span><b>${r[3]}°</b></div>${city?'<div></div>':`<div><span class="lbl f">Score</span><b style="color:${col(r[9])}">${r[9]??'—'}</b></div>`}
 <div><span class="lbl f">Chance of rain</span><b>${r[6]}%</b></div><div><span class="lbl f">Rain</span><b>${r[5]?r[5].toFixed(2):0} in</b></div><div><span class="lbl f">Sun</span><b>${r[11]??'—'} min</b></div><div><span class="lbl f">Wind</span><b>${r[7]} mph</b><small>from ${dirName(r[15])}, gusts ${r[8]}</small></div></div>`;
CP[2]=()=>{const R=D.mp.slice(10,24),mid=r=>hChip==='Temp'?`${r[16]}–${r[17]}°`:hChip==='Wind'?`${r[8]}`:hChip==='Sun'?`${r[11]??'—'} min`:`${r[6]}%`;
 return `${lights([[-30,140,450,230,'#a5b4fc',.14,60,'drift1 8s']])}
 <div class="dsel" style="margin-top:12px">${['Today','Thu','Fri','Sat','Sun','Mon','Tue'].map((d,i)=>`<button aria-pressed="${!i}" data-dsel>${d}</button>`).join('')}</div>
 <div style="display:flex;justify-content:space-between;gap:8px;margin:18px 14px 0">${seg(['All','Temp','Rain','Wind','Sun'].map(c=>[c,c]),hChip,'data-hc')}</div>
 <div class="card lcard" style="margin-top:14px"><button class="link" style="padding:6px 8px 10px;font-size:14px;color:var(--t2)"><span>Show earlier hours, 12 AM – 9 AM</span><span></span></button>
 <div class="hr2 h"><span>Hour</span><span></span><span>°F</span><span style="text-align:center">${hChip==='Temp'?'Likely range':hChip==='Wind'?'Gusts':hChip==='Sun'?'Sun':'Chance of rain'}</span><span style="text-align:right">mph</span></div>
 ${R.map(r=>`<button class="hr2" aria-expanded="${r[1]===hOpen}" data-hr="${r[1]}"><span class="t">${HL(r[1])}${r[1]===10?'<small>Now</small>':''}</span><span>${skyIcon(r,D.mp[r[1]+1])}</span><span class="tp">${r[2]}°</span><span class="pc">${mid(r)}</span><span class="w">${I.arrow(r[15])}${r[7]}</span></button>${r[1]===hOpen?hDet(r,true):''}`).join('')}</div>
 <p class="note pad20">A row is the hour that starts at its time. Temperature, rain and wind are the ensemble: the middle of its members, the likely range in an opened hour, rain as their mean. Chance of rain is the share of members wet in the hour. Humidity, dew point, gusts and wind direction are HRRR’s. Sun is HRRR’s minutes of bright sun, on flat ground.</p>${foot(true)}`};
CP[3]=()=>`${lights([[-80,60,560,420,'rgba(60,80,255,.5)',.55,70,'breathe 6s'],[40,280,310,60,'rgba(200,210,255,.6)',.6,24,'breathe 5s']])}
 <div class="lw" id="lwC" data-l=".18" style="margin-top:16px"><div class="hd2"><b>Last rain</b><div class="lbl" style="margin-top:4px">Sun</div></div>
  <div class="tk"><i style="top:12%;width:18px"></i><span style="top:12%">.5 in</span><i style="top:34%;width:10px"></i><i style="top:56%;width:14px"></i><span style="top:56%">.25</span><i style="top:78%;width:10px"></i></div>
  <div class="wt"><svg viewBox="0 0 400 14" preserveAspectRatio="none"><path d="M0 7 Q50 2 100 7 T200 7 T300 7 T400 7 V14 H0Z"/></svg></div>
  <div class="num">0.09<small>in</small></div><div class="ft"><b>3d 9h ago</b><span class="lbl">0 to .5 in</span></div></div>
 <div class="card" style="--rim:rgba(200,210,255,.85);margin-top:14px"><div class="stats" style="margin-top:0">${stat('0','in','Today')}${stat('None likely','','Next rain')}</div><p class="lbl f" style="margin-top:10px">through Tue 12/1</p></div>
 <div class="sec"><h2>Next 48 hours</h2><div class="lbl f">in per 6 hours · ensemble mean</div><p class="und">Dry for 48 hours</p><p class="lbl f" style="margin-top:6px">0% in every hour: no ensemble member has measurable rain.</p></div>
 <div class="sec"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>By day</h2><span class="lbl f">chance of rain</span></div>
  ${vbars(CDAYS.map(([d,,,,r])=>[d,null,r+'%',null,r]),-1,{h:130,max:40})}</div>
 <p class="note pad20">From GFS, ECMWF, ICON and GEM forecasts. Rain here means 0.02 in or more in an hour; lighter showers set drying back by less.</p>${foot(true,{rearr:true})}`;
S.city=()=>`<div class="sin" style="padding-top:50px">
 <div class="city-hd">${backBtn('Back to Conditions')}<button class="who" data-cwho aria-haspopup="dialog" aria-label="Minneapolis. Switch place"><h1>Minneapolis<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5l3-3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></h1><p>Not a crag · weather only</p></button><button class="fbt" data-go="feedback">Feedback</button></div>
 <div class="cpn" id="cpn">${CP[cityTab]()}</div></div>`;
const cityDock=()=>`<nav class="nav" role="tablist" aria-label="Minneapolis pages">${[['ov','Overview'],['daily','Daily'],['hourly','Hourly'],['precip','Precip']].map(([k,n],i)=>`<button role="tab" aria-selected="${i===cityTab}" data-ctab="${i}">${I[k]}<span>${n}</span></button>`).join('')}</nav>`;

/* ---------- task screens ---------- */
S.edit=()=>`<div class="sin">${bk('Back')}<div class="ttl"><h1>Edit crag</h1></div>
 <div class="os" style="margin-top:22px"><h2>Rock type</h2><p class="sub">Affects drying time and the score.</p>
 <div class="lock"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#9c9da3" stroke-width="1.7"><rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg><div><b>Dolomite or limestone (with chert)</b><small>Set for this crag. Can’t be changed.</small></div></div></div></div>`;
let addState='main';
const locRow=`<button class="act" data-toast="Location shown"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#fff" stroke-width="1.7"><circle cx="11" cy="11" r="6"/><circle cx="11" cy="11" r="2" fill="#fff"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3" stroke-linecap="round"/></svg>Use my current location</button>`;
const res=(n,s,attr='')=>`<button class="res" ${attr}><b>${n}</b><small>${s}</small></button>`;
S.add=()=>{const a=addState;let b='';
 if(a==='main'||a==='search')b=`<div style="margin-top:8px">${locRow}</div><label class="asrch" style="margin-top:4px"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="9.5" cy="9.5" r="6.2" stroke="#9c9da3" stroke-width="1.8"/><path d="M14.2 14.2 19 19" stroke="#9c9da3" stroke-width="1.8" stroke-linecap="round"/></svg><input id="addQ" placeholder="Search for a place" autocomplete="off" aria-label="Search for a place" value="${a==='search'?'red rock':''}"></label>
  ${a==='search'?`<div style="margin-top:8px">${RES.map(([n,s],i)=>res(n,s,`data-addres="${i}"`)).join('')}</div>`:''}
  <div class="pad20"><button class="link" data-adds="coords" style="color:var(--t2)"><span>Enter coordinates instead</span><span>›</span></button></div>
  ${a==='main'?`<div class="os" style="margin-top:18px"><h2>Browse climbing areas</h2></div><div style="margin-top:6px">${[['Minnesota','1,850 climbs · 32 areas'],['Colorado','30,056 climbs · 70 areas'],['Utah','1,502 climbs · 1 area']].map(([n,s])=>res(n,s,'data-adds="browse"')).join('')}</div>`:''}`;
 else if(a==='save')b=`<div class="pad20"><label class="fld"><span>Name</span><input value="Red Rock Canyon Open Space"></label>
  <div class="tog"><div><b>Climbing area</b><small>It gets a score, Dryness and a Rock page.</small></div><button class="sw" role="switch" aria-checked="true" data-sw aria-label="Climbing area"></button></div>
  <label class="fld"><span>Rock type</span><select>${ROCKS.map(r=>`<option ${r==='Not sure'?'selected':''}>${r}</option>`).join('')}</select></label>
  <button class="pill wide" style="margin-top:28px" data-go="list" data-reset data-toast="Saved Red Rock Canyon Open Space">Save</button></div>`;
 else if(a==='coords')b=`<div style="margin-top:8px">${locRow}</div><div class="pad20"><label class="fld"><span>Name</span><input></label><label class="fld"><span>Latitude</span><input inputmode="decimal"></label><label class="fld"><span>Longitude</span><input inputmode="decimal"></label>
  <button class="pill wide" style="margin-top:26px" data-coordnext>Next</button><p class="err" id="coordErr" role="alert"></p><button class="link" data-adds="main" style="color:var(--t2)"><span>Search by name instead</span><span>›</span></button></div>`;
 else if(a==='browse')b=`<div class="crumb2"><b>Minnesota</b></div><div style="margin-top:6px">${MN.map(([n,s])=>res(n,s,'data-adds="browse2"')).join('')}</div>`;
 else if(a==='browse2')b=`<div class="crumb2"><button data-adds="browse">Minnesota</button>›<b>Blue Mounds State Park (Luverne)</b></div><div class="pad20" style="margin-top:12px"><button class="pill wide" data-adds="save">Add Blue Mounds State Park (Luverne)</button></div><div style="margin-top:10px">${BM.map(([n,s])=>res(n,s)).join('')}</div>`;
 const title=a==='save'?`<h1>Red Rock Canyon Open Space</h1><p>Climbing area · 92 climbs · Colorado Springs · Colorado, United States · OpenBeta</p>`:'<h1>Add a location</h1>';
 return `<div class="sin">${lights([[-60,40,400,240,'#a5b4fc',.1,60,'drift1 8s']])}${bk('Back')}<div class="ttl">${title}</div>${b}</div>`};
let fbKind='app';
S.feedback=()=>{const check=fbKind==='check';
 return `<div class="sin">${lights([[-60,40,400,240,'#ffd36b',.08,60,'drift1 8s']])}${bk('Back',false)}<div class="ttl"><h1>Feedback</h1></div>
 <div class="pad20" style="margin-top:18px">${seg([['app','App feedback'],['check','Forecast check']],fbKind,'data-fk')}</div>
 ${check?`<div class="pad20"><div class="two"><label class="fld"><span>Crag</span><select>${LOCS.filter(l=>l.crag).map(l=>`<option ${l.id==='rw'?'selected':''}>${l.name}</option>`).join('')}</select></label><label class="fld"><span>Day</span><input type="date" value="2026-11-25"></label></div>
  <div class="os" style="margin:34px 0 0"><h2>Where you climbed</h2>
  <div class="wb"><div class="wh"><b>Wall 1</b><span class="lbl f">⌄</span></div>
   <label class="fld"><span>Area</span><select><option>Pick an area</option>${WALLS.map(w=>`<option>${w[0]}</option>`).join('')}<option>Somewhere else</option></select></label>
   <label class="fld"><span>Wall</span><input placeholder="e.g. the left side"></label><label class="fld"><span>Routes</span><input placeholder="e.g. Pine Tree, Cyclops"></label>
   <div class="two"><label class="fld"><span>From</span><input type="time" value="16:42"></label><label class="fld"><span>Until</span><input type="time"></label></div>
   <p class="qk w">The rock was</p>${chips(['Dry','Damp','Wet','Mixed'])}
   <p class="qk">Sun on the rock</p>${chips(['All sun','Mostly sun','Sun and shade','Mostly shade','All shade'])}
   <p class="qk">Wall faces</p>${chips(['N','NE','E','SE','S','SW','W','NW'])}
   <p class="qk">Wall angle</p>${chips(['Slab','Vertical','Overhang','Roof'])}</div>
  <button class="dash" style="margin-top:18px">Add another wall</button></div>
  <div class="os" style="margin:34px 0 0"><h2>The app said</h2><div class="fl"><div class="t"><b>Dry</b><span>Dryness</span></div><div><b style="color:#b8f542">100</b><span>Score</span></div><div><b>10 am</b><span>At</span></div></div>
  <p class="qk w" style="margin-top:24px">Did the app match?</p>${chips(['Matched','Partly','Missed'])}
  <details style="margin-top:18px"><summary class="link" style="list-style:none;color:var(--t2)"><span>Add a note</span><span>⌄</span></summary><label class="fld" style="margin-top:0"><textarea placeholder="Say what the rock was like."></textarea></label></details>
  <button class="pill wide" style="margin-top:20px" data-back data-toast="Check saved">Save check</button></div></div>`
 :`<div class="pad20"><label class="fld"><span>What’s working, what isn’t</span><textarea placeholder="What’s working, what isn’t"></textarea></label><button class="pill wide" style="margin-top:20px" data-toast="Sent, thanks">Send feedback</button></div>`}
 <div class="os"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Open feedback</h2><span class="lbl f">2 open</span></div>
  <div class="fb"><div class="m">Forecast check · Red Wing · Nov 22, 4:28 PM</div><p>Rock: Dry · Forecast: Matched</p><div class="m" style="margin-bottom:10px">No app reading attached</div><button data-done>Done</button></div>
  <div class="fb"><div class="m">App feedback · Nov 25, 4:28 PM</div><p>Trip list should show which trip looks best without opening each one.</p><button data-done>Done</button></div></div></div>`};

/* ---------- Map ---------- */
S.map=()=>`<div class="map" id="map"><svg class="terrain" id="terrain" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true"></svg><canvas class="radar" id="radar" width="390" height="844"></canvas><div id="pins"></div></div>
 <div class="mtag glass">Map <span>5 saved</span></div>
 <button class="lay glass" id="lay" aria-haspopup="menu" aria-expanded="false" style="left:auto;right:68px;transform:none"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="m10 3 7.5 4L10 11 2.5 7z"/><path d="m2.5 10.5 7.5 4 7.5-4M2.5 14l7.5 4 7.5-4" stroke-opacity=".6"/></svg><span id="layN">Radar</span></button>
 <div class="laym glass" id="laym" role="menu" aria-label="Map layer" style="left:auto;right:16px;transform:scale(.96);transform-origin:top right"></div>
 <button class="loc glass" id="locb" aria-label="Show my location"><svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="#fff" stroke-width="1.7"><circle cx="11" cy="11" r="6"/><circle cx="11" cy="11" r="2" fill="#fff"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3" stroke-linecap="round"/></svg></button>
 <button class="leg glass" id="leg" aria-expanded="false"><div class="strip" id="legS" style="display:block"></div><div class="ends"><span id="legA">Faint</span><span id="legB">Heavy</span></div><div class="more">Faint can be drizzle, light snow or echo that isn’t rain.</div></button>
 <div class="rctl glass" id="rctl"><div class="r1"><button class="play" id="play" aria-label="Play radar loop"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg></button><div class="tl" style="--now:100%"><div class="hl"></div><input type="range" id="rt" min="0" max="11" value="11" aria-label="Radar time"></div><div class="tt" id="rtt">Radar 4:30 PM</div></div></div>
 <p class="attr">Radar: Iowa Environmental Mesonet | Terrain: Mapzen / AWS Open Data | OpenFreeMap © OpenMapTiles © OpenStreetMap contributors</p>`;

/* ---------- Trips ---------- */
let pastOpen=false;
const trow=(go,n,s,extra='')=>`<div class="trow" role="button" tabindex="0" data-go="${go}" style="grid-template-columns:minmax(0,1fr) 12px"><span><span class="nm">${n}</span><small>${s}</small>${extra}</span><span style="color:var(--t3);font-size:20px;align-self:center">›</span></div>`;
S.trips=()=>`<div class="sin">${lights([[-60,30,420,260,'#ffd36b',.1,60,'drift1 8s'],[140,300,260,220,'#b8f542',.07,60,'drift2 9s']])}
 <div class="w-hd" style="padding-top:8px"><div class="tt"><h1>Trips</h1><p>Soonest first</p></div><button class="pill" data-go="newtrip" style="margin-top:4px"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>New trip</button></div>
 <div class="lst" style="margin-top:20px">${trow('trip2','Sandstone and Taylors Falls','Fri 27 – Sat 28 Nov · in 2 days · 2 crags')}${trow('trip1','Red Wing after Thanksgiving','Sun 29 Nov – Wed 2 Dec · in 4 days · 1 crag')}${trow('trip3',"Devil's Lake, winter break",'Sat 12 – Mon 14 Dec · in 17 days · 1 crag','<small class="fo">Forecast opens 27 Nov</small>')}</div>
 <details class="past" ${pastOpen?'open':''} data-pastd><summary><span>Past trips (1)</span><span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--t3)">Latest first ${I.chev}</span></summary>${trow('past','Barn Bluff Sunday','Sun 15 Nov · ended · 1 crag')}</details></div>`;
S.newtrip=()=>`<div class="sin">${bk('Trips')}<div class="ttl"><h1>New trip</h1></div><div class="pad20">
 <label class="fld"><span>Name</span><input placeholder="Red Wing weekend"></label>
 <div class="two"><label class="fld"><span>First day</span><input type="date" value="2026-11-25"></label><label class="fld"><span>Last day</span><input type="date" value="2026-11-25"></label></div>
 <div class="fld"><span>Crags</span>${['Sandstone','Taylors Falls',"Devil's Lake",'Red Wing'].map(n=>`<button class="ckr" aria-pressed="false" data-ck><i></i>${n}</button>`).join('')}<button class="dash" data-go="add">+ Add a crag</button></div>
 <div class="fld"><span>Climbing hours</span><div style="margin-top:8px">${seg([['p','Same as Profile'],['o','Own hours']],'p')}</div><span class="hint">Your Profile hours, 8 am – 6 pm.</span></div>
 <button class="pill wide" style="margin-top:30px" data-go="trip1" data-replace>Create trip</button></div></div>`;
const tripFoot=(weather=true,past=false)=>`<div class="os"><h2>Trip</h2><p class="note">Weather on every day is the trip outlook’s; scores and words are each crag’s hourly readings.</p><p class="note" style="margin-top:6px">Agreement is the share of forecast runs that agree on rain or no rain that day.</p>${weather?'<p class="note" style="margin-top:6px">Weather: Open-Meteo · GFS, ECMWF, ICON, GEM.</p>':''}</div>
 <div class="cfoot">${past?'<button class="ln" data-go="newtrip"><span>Plan again</span><span>›</span></button>':''}<button class="ln" data-go="newtrip"><span>Edit trip</span><span>›</span></button><button class="ln dg" data-deltrip><span>Delete trip</span><span></span></button></div>`;
/* trip days: [label, score, word, high, chance, amount, full, good, low, agreement] */
const T1=[['Sun 29',100,'Dry','37°','47%','0.04 in','Sun 29 Nov','All day','30°','53%'],['Mon 30',100,'Dry','37°','20%','0.01 in','Mon 30 Nov'],['Tue 1',100,'Dry','40°','40%','0.03 in','Tue 1 Dec'],['Wed 2',null,'Scored from 26 Nov','45°','44%','0.02 in','Wed 2 Dec']];
const T2C=[['Fri 27',100,'Dry','38°','48%','0.01 in','Fri 27 Nov','12am–9pm','20°','52%'],['Sat 28',100,'Dry','41°','33%','trace','Sat 28 Nov']];
let tDay=0;
const dayCard=(t,i)=>{const d=t[i];return `<div class="card" id="tdc" style="--rim:${col(d[1])};margin-top:10px"><div class="fr"><span data-roll="${d[1]??'—'}"></span></div><p class="und">${d[6]}${d[7]?` · Good hours ${d[7]}`:''}</p><p class="lbl f" style="margin-top:6px">${d[1]==null?d[2]:'Dryness: '+d[2]}</p>
 <div class="stats">${stat(d[3]+(d[8]?' · '+d[8]:''),'','High · low')}${stat(d[4],'','Chance')}${stat(d[5],'','Amount')}</div>
 <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px"><span class="agr">Agreement ${d[9]??'—'}</span><button class="cg-now" style="margin:0"><span class="go" data-gocrag="2" style="display:inline-flex;align-items:center">Hourly ›</span></button></div></div>`};
const tripDays=t=>`<div class="sec" style="margin-top:26px"><h2>Trip days</h2><div class="lbl f">Day score · tap a day</div><div id="tdb">${vbars(t.map(d=>[d[0],d[1],null,d[1]==null?'':d[2]]),tDay,{h:180,attr:'data-tdays'})}</div></div>`;
const rainTrip=(n,tot,lo,hi,days,scale)=>`<div class="sec"><h2>Rain over the trip</h2><div class="lbl f">All ${n} days</div></div>
 <div class="lw" data-l="${tot/scale}" style="margin-top:14px;height:260px"><div class="hd2"><b>Likely</b><div class="lbl" style="margin-top:4px">Range ${lo.toFixed(2)}–${hi.toFixed(2)} in</div></div>
  <div class="rg" style="bottom:${lo/scale*88}%;height:${(hi-lo)/scale*88}%"></div>
  <div class="tk">${[1,.5].map(f=>`<i style="top:${100-f*88}%;width:18px"></i><span style="top:${100-f*88}%">${(scale*f).toFixed(2).replace(/^0/,'')}${f===1?' in':''}</span>`).join('')}</div>
  <div class="wt"><svg viewBox="0 0 400 14" preserveAspectRatio="none"><path d="M0 7 Q50 2 100 7 T200 7 T300 7 T400 7 V14 H0Z"/></svg></div>
  <div class="num" style="font-size:96px">${tot.toFixed(2)}<small>in</small></div><div class="ft"><b>likely</b><span class="lbl">Range ${lo.toFixed(2)}–${hi.toFixed(2)} in</span></div></div>
 <div class="sec" style="margin-top:22px"><div class="wk" style="grid-template-columns:repeat(${days.length},1fr)">${days.map(([d,t,v])=>`<button aria-pressed="false" aria-label="${d}, ${t}"><span class="amt${v?'':' z'}">${t}</span><span class="tube"><i data-h="${Math.max(3,Math.min(100,v/.05*100))}"></i></span><span class="d">${d}</span></button>`).join('')}</div><p class="note">Amounts add up; a range never does.</p></div>`;
let trendMode='day';
function trendChart(){const td=D.trend[0],inch=v=>v/25.4,f=c=>Math.round(c*9/5+32),fx=v=>v.toFixed(2).replace(/^0/,'0');
 const sg=v=>v>0.004?'up ':v<-0.004?'down ':'';
 if(trendMode==='whole'){const [a,b]=td.points,MX=.75,pc=v=>Math.min(100,inch(v)/MX*100);
  const row=(p,lab,now)=>`<div class="wr${now?' now':''}"><span class="d">${lab}</span><div class="tk3"><i class="rg" style="left:${pc(p.p10_mm)}%;right:${100-pc(p.p90_mm)}%"></i><i class="mn" style="left:${pc(p.mean_mm)}%"></i></div><b>${fx(inch(p.mean_mm))}<small> in</small></b></div>`;
  const dr=inch(b.mean_mm)-inch(a.mean_mm),dt=f(b.high_c_max)-f(a.high_c_max);
  return `<div class="tw2"><div class="fg"><span class="lbl f">Rain, trip total</span><b class="bf"><span data-roll="${fx(inch(b.mean_mm))}"></span><small>in</small></b><i class="rl"></i><span class="lbl">${dr?sg(dr)+fx(Math.abs(dr))+' in':'no change'} since 19 Nov</span></div>
   <div class="fg"><span class="lbl f">High, warmest day</span><b class="bf"><span data-roll="${f(b.high_c_max)}"></span><small>°F</small></b><i class="rl"></i><span class="lbl">${dt?(dt>0?'up ':'down ')+Math.abs(dt)+'°':'no change'} since 19 Nov</span></div></div>
   <p class="lbl f" style="margin:22px 0 4px">Each forecast update, likely total and range</p>
   ${row(a,'19 Nov')}${row(b,'25 Nov',1)}<div class="tsc"><span>0</span><span>0.25</span><span>0.50</span><span>0.75 in</span></div>`}
 const ds=td.days,MX=Math.max(...ds.flatMap(d=>[d.first.precip_mm_mean,d.last.precip_mm_mean])),hh=v=>Math.max(3,v/MX*110);
 return `<div class="tg4">${ds.map((d,i)=>{const fi=inch(d.first.precip_mm_mean),la=inch(d.last.precip_mm_mean),dr=la-fi,tf=f(d.first.temp_c_max),tl=f(d.last.temp_c_max);
  return `<div class="tdc"><b class="tv">${fx(la)}<small> in</small></b><span class="tw">was ${fx(fi)}</span>
   <div class="caps"><i class="was" style="height:${hh(d.first.precip_mm_mean)}px"></i><i class="now" style="height:${hh(d.last.precip_mm_mean)}px;animation-delay:${i*70}ms"></i></div>
   <span class="dd">${['Sun 29','Mon 30','Tue 1','Wed 2'][i]}</span><b class="th">${tl}°F</b><span class="tw">${tl===tf?'high, same':'was '+tf+'°'}</span></div>`}).join('')}</div>
 <div class="key" style="margin:14px 0 0"><span class="lbl f"><i style="border:1.5px dashed rgba(255,255,255,.45);width:8px;height:12px;display:inline-block;border-radius:5px"></i>First forecast, 19 Nov</span><span class="lbl f"><i style="background:#a5b4fc;width:8px;height:12px;display:inline-block;border-radius:5px;box-shadow:0 0 8px #a5b4fc"></i>Latest, 25 Nov</span></div>`}
const trendSec=()=>`<div class="sec trend"><h2>How the forecast has moved</h2><div class="lbl f">2 recordings since 19 Nov</div><div style="margin:14px 0 14px">${seg([['day','By day'],['whole','Whole trip']],trendMode,'data-tm')}</div><div id="trendBox">${trendChart()}</div></div>`;
let curTrip=T1;
S.trip1=()=>{curTrip=T1;return `<div class="sin">${lights([[-40,200,440,240,'#b8f542',.14,60,'drift1 8s'],[-50,240,110,140,'#e6ff9e',.2,30,'drift2 6s']])}${bk('Trips')}
 <div class="ttl"><p class="ey">Red Wing</p><h1>Red Wing after Thanksgiving</h1><p>Sun 29 Nov – Wed 2 Dec · in 4 days · Red Wing · Dolomite or limestone (with chert)</p></div>
 ${tripDays(T1)}<div id="tdcW">${dayCard(T1,tDay)}</div>${rainTrip(4,.08,0,.24,[['Sun 29','0.04 in',.04],['Mon 30','0.01 in',.01],['Tue 1','0.03 in',.03],['Wed 2','0.02 in',.02]],.3)}${trendSec()}${tripFoot()}</div>`};
S.trip2=()=>`<div class="sin">${lights([[-40,160,440,240,'#b8f542',.12,60,'drift1 8s']])}${bk('Trips')}
 <div class="ttl"><p class="ey">2 crags</p><h1>Sandstone and Taylors Falls</h1><p>Fri 27 – Sat 28 Nov · in 2 days · 2 crags</p></div>
 <div class="sec" style="margin-top:26px"><h2>By day</h2><div class="lbl f">Tap a crag</div></div>
 <div class="tg2"><span></span><span class="h">Fri 27</span><span class="h">Sat 28</span>
  <button class="n" data-go="trip2crag">Sandstone ›<small>Sandstone (hard quartz)</small></button><div class="c" style="--c:#b8f542"><b style="color:#b8f542">100</b><span>Dry</span><span>0.01 in</span></div><div class="c" style="--c:#b8f542"><b style="color:#b8f542">100</b><span>Dry</span><span>trace</span></div>
  <button class="n" data-go="trip2crag">Taylors Falls ›<small>Basalt (dense)</small></button><div class="c" style="--c:#b8f542"><b style="color:#b8f542">100</b><span>Dry</span><span>trace</span></div><div class="c" style="--c:#b8f542"><b style="color:#b8f542">100</b><span>Dry</span><span>0.02 in</span></div></div>
 <div class="sec"><h2>Rain over the trip</h2><div class="lbl f">likely · range</div><div class="fl" style="margin-top:18px"><div class="t"><b>0.02 in</b><span>Sandstone<br>0.00–0.04 in</span></div><div class="t"><b>0.03 in</b><span>Taylors Falls<br>0.00–0.07 in</span></div></div></div>
 ${tripFoot()}</div>`;
S.trip2crag=()=>{curTrip=T2C;return `<div class="sin">${lights([[-40,200,440,240,'#b8f542',.14,60,'drift1 8s']])}${bk('Sandstone and Taylors Falls')}
 <div class="ttl"><p class="ey">Sandstone and Taylors Falls</p><h1>Sandstone</h1><p>Fri 27 – Sat 28 Nov · in 2 days · Sandstone (hard quartz)</p></div>
 ${tripDays(T2C)}<div id="tdcW">${dayCard(T2C,tDay)}</div>${rainTrip(2,.02,0,.04,[['Fri 27','0.01 in',.01],['Sat 28','trace',.004]],.05)}
 <div class="sec"><h2>How the forecast has moved</h2><p class="und s">Trend starts after the next forecast update.</p></div>${tripFoot()}</div>`};
S.trip3=()=>`<div class="sin">${lights([[-40,160,440,240,'#ffd36b',.1,60,'drift1 8s']])}${bk('Trips')}
 <div class="ttl"><p class="ey">Devil's Lake</p><h1>Devil's Lake, winter break</h1><p>Sat 12 – Mon 14 Dec · in 17 days · Devil's Lake · Quartzite</p></div>
 <div class="sec" style="margin-top:30px"><div class="fr s" style="color:#f6ad55;border-bottom:2px dashed rgba(246,173,85,.7)">27 Nov</div><p class="und">Forecast opens 27 Nov.</p></div>
 ${vbars([['Sat 12',null],['Sun 13',null],['Mon 14',null]].map(([d])=>[d,null,'—','']),-1,{h:150}).replace('class="vb"','class="vb" style="margin:18px 20px 0;height:150px"')}
 <div class="sec"><h2>How the forecast has moved</h2><p class="und s">Trend starts after the next forecast update.</p></div>${tripFoot(false)}</div>`;
S.past=()=>`<div class="sin">${lights([[-40,160,440,240,'#f6ad55',.14,60,'drift1 8s']])}${bk('Trips')}
 <div class="ttl"><p class="ey">Red Wing</p><h1>Barn Bluff Sunday</h1><p>Sun 15 Nov · ended · Red Wing · Dolomite or limestone (with chert)</p></div>
 <div class="card" style="--rim:#f6ad55;margin-top:22px"><div class="lbl f">How it turned out · Sun 15 Nov</div><div class="fr" style="margin-top:10px"><span data-roll="48"></span></div><p class="und">Drying, as it turned out</p><p class="lbl f" style="margin-top:6px">score 48 · 0.02 in · high 46° · low 29°</p>
  <div class="fl"><div><b>Dry · 78</b><span>Said first<br>11 days out</span></div><div><b>Drying · 57</b><span>Said last<br>1 day out</span></div></div>
  <button class="pill ghost" style="margin-top:20px" data-go="check">How was it?</button></div>
 <p class="note pad20">How a day turned out is the forecast model’s own look back at it once it was over, not a weather station’s record.</p>
 <div class="sec trend"><h2>How the forecast has moved</h2><div style="margin:14px 0">${seg([['day','By day'],['whole','Whole trip']],'day')}</div><p class="lbl f" style="margin-bottom:6px">Each trip day: the first forecast (4 Nov) against the latest (14 Nov).</p>
 <svg viewBox="-30 0 380 150" style="display:block;width:100%;height:auto">${[[0,'0.00'],[.05,'0.05'],[.1,'0.10'],[.15,'0.15 in']].map(([v,t])=>`<text x="-4" y="${110-v/.15*100+4}" text-anchor="end" font-size="12" fill="#9c9da3">${t}</text><line x1="0" x2="320" y1="${110-v/.15*100}" y2="${110-v/.15*100}" stroke="rgba(255,255,255,.07)"/>`).join('')}
 <rect x="144" y="104" width="12" height="6" rx="3" fill="none" stroke="#c2c3c8" stroke-dasharray="3 2"/><rect x="162" y="${110-.05/.15*100}" width="12" height="${.05/.15*100}" rx="6" fill="#a5b4fc" style="filter:drop-shadow(0 0 6px rgba(165,180,252,.7))"/><text x="160" y="128" text-anchor="middle" font-size="12" fill="#fff">Sun 15</text><text x="160" y="146" text-anchor="middle" font-size="12" fill="#c2c3c8">+0.04 in</text></svg>
 <div class="key" style="margin:10px 0 0"><span class="lbl f"><i style="border:1px dashed #c2c3c8;width:9px;height:9px;display:inline-block;border-radius:3px"></i>Rain, 4 Nov</span><span class="lbl f"><i style="background:#a5b4fc;width:10px;height:10px;display:inline-block;border-radius:3px"></i>Rain, 14 Nov</span><span class="lbl f"><i style="border:1.5px solid #f6ad55;width:8px;height:8px;border-radius:50%;display:inline-block"></i>High, 4 Nov → <i style="background:#f6ad55;width:8px;height:8px;border-radius:50%;display:inline-block"></i>14 Nov</span></div></div>
 ${tripFoot(false,true)}</div>`;

/* ---------- Profile ---------- */
let invited=false;const PF={lo:30,hi:60,from:8,to:18};
const step=(k,l,v)=>`<div class="stp"><span class="k">${l}</span><span class="c"><button aria-label="Less" data-st="${k}" data-d="-1">−</button><b id="st-${k}">${v}</b><button aria-label="More" data-st="${k}" data-d="1">+</button></span></div>`;
const rbar=(id,lo,hi,mn,mx,ticks)=>`<div class="rbar"><div class="range hatch"><i id="${id}" style="left:${(lo-mn)/(mx-mn)*100}%;right:${100-(hi-mn)/(mx-mn)*100}%;box-shadow:0 0 14px rgb(255 255 255 / calc(.5*var(--lg)/.7))"></i></div><div class="ax">${ticks.map(([v,t])=>`<span style="left:${(v-mn)/(mx-mn)*100}%">${t}</span>`).join('')}</div></div>`;
S.profile=()=>{const fbs=[['tim · Forecast check · Red Wing · Nov 22, 4:28 PM','Rock: Dry · Forecast: Matched','No app reading attached'],['sam · Forecast check · Red Wing · Nov 16, 4:28 PM','Rock: Damp · Forecast: Partly','No app reading attached'],['sam · App feedback · Nov 25, 4:28 PM','The map pins are hard to tap when two crags are close together.'],['tim · App feedback · Nov 25, 4:28 PM','Trip list should show which trip looks best without opening each one.']];
 const dryR=[['Granite',1,6,'1–6 h'],['Limestone (dense)',4,18,'4–18 h'],['Sandstone (hard quartz)',24,48,'1–2 days'],['Limestone (soft, porous)',24,72,'1–3 days'],['Sandstone (soft)',48,120,'2–5 days']];
 const X=h=>(h<=24?h/24*25:h<=48?25+(h-24)/24*25:50+(h-48)/72*50)*.74;
 const ex=[[40,'8a'],[55],[70,'10a'],[85],[92,'12p'],[88],[82,'2p'],[95],[90,'4p'],[62],[45,'6p']];
 return `<div class="sin">${lights([[-60,20,420,260,'#a5b4fc',.14,60,'drift1 8s'],[160,1500,300,260,'#b8f542',.08,60,'drift2 9s']])}
 <div class="w-hd" style="padding-top:8px"><div class="tt"><h1>Profile</h1><p>Signed in as tim</p></div><button class="fbt" data-go="feedback" style="margin-top:6px">Feedback</button></div>
 <div class="os"><h2>Temperature range</h2><p class="tx">The score drops when it’s colder or warmer than this. Default 30–60°F.</p>${rbar('rbT',PF.lo,PF.hi,0,85,[[0,'0°'],[30,'30°'],[60,'60°'],[85,'85°F']])}${step('lo','Low',PF.lo+'°F')}${step('hi','High',PF.hi+'°F')}</div>
 <div class="os"><h2>Climbing hours</h2><p class="tx">A day’s score comes from these hours only. Default 8 am – 6 pm.</p>${rbar('rbH',PF.from,PF.to,0,24,[[0,'12a'],[6,'6a'],[12,'12p'],[18,'6p'],[24,'12a']])}${step('from','From',hr12(PF.from))}${step('to','Until',hr12(PF.to))}</div>
 <div class="os"><h2>Open a crag on</h2><p class="tx">The tab a crag shows first.</p><div style="margin-top:4px">${chips(TABS,'Overview')}</div><p class="note">Places that aren’t crags always open on Overview.</p>
  <div style="display:flex;align-items:center;gap:16px;margin-top:20px"><button class="pill" style="flex:1;justify-content:center" data-toast="Saved">Save</button><button class="pill ghost" data-preset>Reset</button></div></div>
 <div class="os"><h2>Everyone’s feedback</h2><p class="sub">4 open, newest first.</p>${fbs.map(([h,p,n])=>`<div class="fb"><div class="m">${h}</div><p>${p}</p>${n?`<div class="m" style="margin-bottom:10px">${n}</div>`:''}<button data-done>Done</button></div>`).join('')}</div>
 <div class="os"><h2>Thermometer</h2><p class="tx">Stored every 30 minutes while it is online. Not used in any score.</p><p class="und s" style="color:var(--t3)">No readings yet.</p></div>
 <div class="os"><h2>Invite someone</h2><p class="tx">A link that creates one account. It works once and expires in 2 days. Send it to one person, privately.</p>
  ${invited?`<div class="ilink"><p>https://weatherteam6.vercel.app/join#EXAMPLE-invite-token</p><p class="lbl f" style="margin-top:6px">Expires Fri, Nov 27.</p><div style="display:flex;gap:10px;margin-top:14px"><button class="pill" data-toast="Copied">Copy link</button><button class="pill ghost" data-invite>Create another link</button></div></div>`:`<button class="pill wide" style="margin-top:16px" data-invite>Create invite link</button>`}
  <p class="lbl f" style="margin-top:22px">Your links</p>${(invited?['Expires Fri, Nov 27, 4:42 PM','Expires Fri, Nov 27, 4:28 PM']:['Expires Fri, Nov 27, 4:28 PM']).map(e=>`<div class="inv"><div><b>Not used yet</b><small>${e}</small></div><div class="acts"><button style="color:#fc8181">Cancel</button></div></div>`).join('')}</div>
 <div class="os"><h2>How the score works</h2><p class="tx">The score rates one hour at the crag from 0 to 100. It multiplies two things, so if either one is zero, so is the score.</p>
  <div class="eq2"><b>Dry rock</b><i>×</i><b>Good grip</b><i>=</i><b style="border-bottom:2px solid #fff;padding-bottom:2px">Score</b></div>
  <h3>Dry rock</h3><p class="tx">Rain starts a drying clock. A light shower needs a short wait and only dents the score; 0.4" or more needs the rock’s full drying time below and drops it to zero. While rain you’d see on the rock is falling (0.02" an hour or more), the score is zero. The clock counts rain due in the next 2 hours, so rock can read wet just before rain arrives; the crag’s overview says when it’s due. Sun, dry air and wind speed drying up. The forecast’s sunshine warms eight imagined walls, one facing each direction, by the hour; the crag takes the middle one, so one sunny face can’t make it read dry. Cold, damp or still weather never holds rock wet past its full drying time. Rock that is weak when wet dries by the clock on the wall, whatever the weather.</p>
  <div class="dry2"><span></span><div class="ax">${[[0,'0'],[24,'1 day'],[48,'2 days'],[120,'5 days']].map(([h,t])=>`<span style="left:${X(h)}%;transform:translateX(${h?-50:0}%)">${t}</span>`).join('')}</div>${dryR.map(([n,a,b,t])=>`<span class="n">${n}</span><span class="b"><i style="left:${X(a)}%;width:${Math.max(2,X(b)-X(a))}%"></i><em style="left:calc(${X(b)}% + 8px)">${t}</em></span>`).join('')}</div>
  <p class="note">Hours after a soaking, from climbers’ rules of thumb. Nobody has measured them.</p>
  <h3>Good grip</h3><p class="tx">Grip is an estimate. It’s full inside your temperature range and fades the further outside it the air gets. Muggy air (a dew point over 54°F) lowers it, and so does rock within about 4°F of its dew point, where moisture settles on it. The rock’s temperature there is modelled for each imagined wall, sun included, so it can take at most 50% off the score.</p>
  <div style="display:flex;justify-content:space-between;margin-top:18px" class="lbl f"><span>← colder</span><span style="color:#b8f542;font-weight:600">Full grip</span><span>warmer →</span></div>
  <div class="gripb"><s style="left:30%"></s><s style="left:60%"></s></div><div class="gax">${[[0,'0°'],[20,'20°'],[30,'<b>30°F</b>'],[40,'40°'],[60,'<b>60°F</b>'],[80,'80°'],[100,'100°']].map(([v,t])=>`<span style="left:${v}%">${t}</span>`).join('')}</div>
  <h3>A day’s score</h3><p class="tx">It’s the lowest hour of the day’s best 3 hours in a row inside your climbing hours, 8am to 6pm unless you change them on Profile. Good hours are the longest run scoring 60 or more. After your last climbing hour, today has no score.</p>
  <p class="und s" style="margin-top:18px">Day score <b style="color:#b8f542;font-weight:600">85</b></p>
  <div class="vb best" style="height:170px;gap:4px;margin-top:8px">${ex.map(([v,l],i)=>`<div class="col${i>=3&&i<=5?' on in3':''}" style="--c:${col(v)};--hi:${hic(v)}"><span class="v" style="color:${col(v)};font-size:12.5px">${v}</span><div class="bar" data-h="${v}" style="height:0;max-width:22px"></div><span class="d">${l||''}</span></div>`).join('')}</div>
  <p class="note">An example day, not a forecast.</p>
  <h3>When it’s missing or wrong</h3><p class="tx">A weather warning shows beside the score and never hides it, and a missing forecast hour is a gap, never a guess. Score breakdown on a crag lists what’s lowering its score.</p><p class="tx">The rain is from forecast models, not a gauge, so a local shower can be missed. The score can’t see terrain shade, seepage, wind on one wall, or your skin and rubber, and it hasn’t been checked against real days yet. Use Check this forecast on a crag to report a miss.</p></div>
 <div class="os"><button class="link" data-go="welcome"><span>Run setup again</span><span>›</span></button><button class="link" data-go="login" data-reset><span>Sign out</span><span></span></button></div></div>`};

/* ================= the Crag tab (pg5), Red Wing's guidebook ================= */
const CH=[8,9,10,11,12,13,14,15,16,17,18],CS=[46,52,60,68,76,82,84,83,78,66,55],SUNW={'Winter Wall':[10,14],'Cyclops Area':[13,16]};
const wallDay=w=>CH.map((h,i)=>{const s=SUNW[w.n],sun=s&&h>=s[0]&&h<s[1];return [Math.max(0,Math.min(100,CS[i]+(sun?7:w.t?-4:0))),sun]});
let cgSub=null;
const cgRoute=(g,n,t,attr)=>`<button class="cg-rt" ${attr}><span class="g" style="color:${gcol(g)}">${g}</span><span><b>${n}</b><small>${t}</small></span><span class="c">›</span></button>`;
function cragPage(){
 if(cgSub==='wall')return `<button class="cg-back" data-cg="">‹ He Mni Can - Barn Bluff (Red Wing) guidebook</button>
  <div class="cg-t"><h1 style="font-size:30px">Winter Wall</h1><div class="cg-now"><span class="lbl f">Now</span><span class="v" style="color:${col(52)}">52</span><span class="lbl">Dryness: Drying</span><button class="go" data-cgo="0">Overview ›</button></div></div>
  <div class="sec"><h2>This week</h2><div class="lbl f">the crag's reading, not this wall's</div>${vbars(DAYS.map(d=>[d.d,d.s,null,d.rock]),0,{h:170})}</div>
  <div class="sec"><h2>Location</h2><div class="lbl f">recorded at the wall</div><p class="und s">Not recorded</p><button class="cg-pill g" style="margin-top:14px">Record here</button></div>
  <div class="sec"><h2>Grades</h2><div class="lbl f">42 routes</div>${vbars([['5.9−',2],['5.10',5],['5.11',8],['5.12',15],['5.13+',12]].map(([g,n],i)=>[g,null,n,null,n]),3,{h:150,max:15}).replace(/--c:#a5b4fc;--hi:#dfe4ff/g,'').replace(/class="col/g,'class="col gcol')}</div>
  <div class="sec" style="margin-bottom:0"><h2>Routes</h2></div><div class="cg-ctl">${seg(['All','Sport','Trad','TR'].map(c=>[c,c]),'All')}${seg([['lr','Left → right'],['g','Grade ↑']],'lr')}</div>
  <div>${ROUTES.map(([g,n,t])=>cgRoute(g,n,t,`data-cgr="${esc(n)}"`)).join('')}</div><button class="cg-more">Show all 42 routes</button>
  <div class="cfoot">${srcs(false)}</div>`;
 if(cgSub==='route')return `<button class="cg-back" data-cg="wall">‹ Winter Wall</button>
  <div class="cg-t"><p class="ey">Sport</p><h1 style="font-size:30px">Orange Marmalade</h1></div>
  <div class="pad20" style="margin-top:16px"><div class="fr m" style="color:#fc8181">5.13b</div><p class="und">French 8a</p><p class="lbl f" style="margin-top:6px">Route 1 of 42, left to right</p></div>
  <div class="sec"><h2>Route</h2><div class="stats">${stat('Sport','','Type')}${stat('Not rated','','Protection')}</div><div class="stats" style="margin-top:16px">${stat('Josh Helke, 1998','','First ascent')}</div></div>
  <div class="sec"><h2>Logbook</h2><div style="display:grid;gap:10px;margin-top:14px"><button class="cg-pill g" style="justify-content:center">+ Add to to-do list</button><button class="cg-pill w" style="justify-content:center">Tick it</button></div></div>
  <div class="sec"><h2>On the wall</h2><div class="lbl f">Left → right</div><div style="margin-top:10px">${ROUTES.slice(0,5).map(([g,n],i)=>`<div class="hl2 nc"><span class="k"><b style="${i?'':'color:#fff'}">${i+1}. ${n}</b>${i?'':'this route'}</span><span class="v" style="color:${gcol(g)}">${g}</span></div>`).join('')}</div></div>
  <div class="sec"><h2>Beta</h2><p class="und s">Nothing recorded on OpenBeta yet.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="cg-pill g">Mountain Project ↗</button><button class="cg-pill g">Add beta on OpenBeta ↗</button></div></div>
  <div class="cfoot">${srcs(false)}</div>`;
 const ws=D.walls.slice().sort((a,b)=>a.n.localeCompare(b.n));
 return `<div class="cg-t"><div class="ey">OpenBeta area</div><h1>He Mni Can - Barn Bluff (Red Wing)</h1><p>USA › Minnesota · Also within reach: Memorial Park (Red Wing)</p></div>
  <div class="card" style="--rim:#eceef2"><div class="fr"><span data-roll="163"></span></div><p class="und">Routes</p>
   <div class="stats">${stat('8','','Walls')}${stat('142','','Sport')}${stat('18','','Trad')}</div><div class="stats" style="margin-top:16px">${stat('22','','Top rope')}${stat('2','','Boulder')}<div></div></div>
   <p class="lbl f" style="margin-top:14px">Some routes have more than one type.</p></div>
  <div class="sec"><h2>Now</h2><div class="lbl f">the crag's reading</div><div class="cg-now"><span class="v" style="color:${col(52)}">52</span><span class="lbl">Dryness: Drying</span><button class="go" data-cgo="0">Overview ›</button></div></div>
  <div class="sec" style="margin-bottom:0"><h2>Walls today</h2><div class="lbl f">score by hour · sun lit</div></div>
  <div class="cg-wg">${ws.map(w=>`<button class="r" data-cg="wall"><span class="nm">${w.n}${w.t?'<small>Under trees</small>':SUNW[w.n]?`<small>Sun ${SUNW[w.n][0]>12?SUNW[w.n][0]-12:SUNW[w.n][0]}–${SUNW[w.n][1]-12} PM</small>`:''}</span><span class="hb">${wallDay(w).map(([s,sun],i)=>`<i class="${sun?'sn':''}${CH[i]===9?' nw':''}" data-h="${Math.round(8+s/100*36)}" style="--c:${col(s)}" title="${HL(CH[i])}: ${s}"></i>`).join('')}</span></button>`).join('')}
   <div class="ax"><span></span><div>${CH.map(h=>`<span class="${h===9?'n':''}">${{8:'8a',10:'10a',12:'12p',14:'2p',16:'4p',18:'6p'}[h]||(h===9?'now':'')}</span>`).join('')}</div></div></div>
  <p class="lbl f pad20" style="margin-top:12px">Lit bars are hours with sun on the wall. Tap a wall to pin it on the Overview.</p>
  <div class="sec"><h2>Grades</h2><div class="lbl f">163 routes · tap a grade</div>${vbars(GR.map(([g,n])=>[g,null,n,null,n]),-1,{h:160,max:42}).replace(/--c:#a5b4fc;--hi:#dfe4ff/g,'').replace(/class="col/g,'class="col gcol')}</div>
  <div class="sec" style="margin-bottom:0"><h2>Walls</h2><div class="lbl f">A–Z · conditions are for the whole crag, not each wall</div></div>
  <div style="margin-top:10px">${WALLS.map(([n,c,r,mix])=>`<button class="wrow" data-cg="wall"><span class="h" style="display:flex;justify-content:space-between;align-items:baseline"><b style="font:600 15px/1.2 var(--font)">${n}</b><span class="lbl f">${c} routes</span></span><span class="lbl f" style="display:block;margin-top:3px">${r}</span><span class="gmix">${mix.map((m,i)=>m?`<i style="flex:${m};background:${GR[i][2]}"></i>`:'').join('')}</span></button>`).join('')}</div>
  <div class="cg-key">${GR.map(([g,,c],i)=>`<span><i style="background:${c}"></i>${i===0?'5.9 & under':g}</span>`).join('')}</div>
  ${foot(false,{edit:true})}`}
function renderCrag(){const b=$('cgBody');if(!b)return;b.innerHTML=`<div class="cgp">${cragPage()}</div>`;
 qa('.gcol',b).forEach((c,i)=>{const g=(cgSub==='wall'?['#8ec5ff','#7ee0c3','#b8f542','#f6ad55','#fc8181']:GR.map(x=>x[2]))[i];c.style.setProperty('--c',g);c.style.setProperty('--hi','#fff');c.querySelector('.v').style.color=g});
 grow(b);rollIn(b)}

/* ================= router ================= */
const app=$('app'),cragNav=$('nav'),TOP=['list','trips','map','profile'];
let stack=['list'];
const host=()=>$('ah');
const tbar=cur=>`<nav class="tb" aria-label="Sections">${[['list','Conditions',I.cond],['trips','Trips',I.trips],['map','Map',I.map],['profile','Profile',I.prof]].map(([id,n,ic])=>`<button data-top="${id}"${id===cur?' aria-current="page"':''}>${ic}<span>${n}</span></button>`).join('')}</nav>`;
const TRIPSUB=['trip1','trip2','trip2crag','trip3','past'];
function render(dir){const id=stack[stack.length-1];
 if(id==='crag'){app.classList.add('away');app.setAttribute('inert','');cragNav.classList.remove('rise');void cragNav.offsetWidth;cragNav.classList.add('rise');enter(cur);renderCrag();return}
 app.classList.remove('away');app.removeAttribute('inert');
 let chrome='';if(TOP.includes(id))chrome=tbar(id);else if(TRIPSUB.includes(id))chrome=tbar('trips');else if(id==='city')chrome=cityDock();
 host().innerHTML=`<div class="scr${id==='map'?' bare':''}${dir?' in-'+dir:''}" id="scr">${S[id]()}</div>${chrome}`;
 after(id);qa('.idx button').forEach(b=>b.setAttribute('aria-current',b.dataset.j===lastKey))}
function after(id){const s=$('scr');grow(s);rollIn(s);
 if(id==='map')initMap();
 if(id==='welcome'){initRng(s);drawWeek()}}
function nav2(id,{reset,replace}={}){if(reset)stack=[id];else if(replace)stack[stack.length-1]=id;else stack.push(id);render(reset?'':'r');const s=$('scr');if(s)s.scrollTop=0}
function back(){if(stack.length>1){stack.pop();render('l')}else nav2('list',{reset:true})}
function openCrag(id,p=0){if(id==='mp'){cityTab=0;nav2('city');return}cgSub=null;stack.push('crag');if(p!==cur)go(p);render();qa('.pg').forEach(x=>x.scrollTop=0)}
function initRng(root){qa('[data-rng]',root).forEach(el=>{const k=el.dataset.rng,mn=+el.dataset.min,mx=+el.dataset.max,gap=+el.dataset.gap,u=el.dataset.unit;
 el.innerHTML=`<div class="tr"></div><div class="fill"></div><input type="range" min="${mn}" max="${mx}" value="${el.dataset.lo}" aria-label="${u==='h'?'Start of climbing hours':'Too cold below'}"><input type="range" min="${mn}" max="${mx}" value="${el.dataset.hi}" aria-label="${u==='h'?'End of climbing hours':'Too hot above'}">`;
 const [a,b]=qa('input',el),fill=el.querySelector('.fill');
 const upd=src=>{let lo=+a.value,hi=+b.value;if(hi-lo<gap){if(src===a){lo=hi-gap;a.value=lo}else{hi=lo+gap;b.value=hi}}
  fill.style.left=((lo-mn)/(mx-mn)*100)+'%';fill.style.width=((hi-lo)/(mx-mn)*100)+'%';RNG[k]=[lo,hi];
  const o=document.querySelector(`[data-out="${k}"]`);if(o)o.textContent=u==='h'?`${hr12(lo)} to ${hr12(hi)}`:`${lo}°F to ${hi}°F`;if(src)drawWeek()};
 a.oninput=()=>upd(a);b.oninput=()=>upd(b);upd()})}
function profStep(k,d){const lim={lo:[0,PF.hi-5],hi:[PF.lo+5,95],from:[0,PF.to-1],to:[PF.from+1,24]}[k];PF[k]=Math.max(lim[0],Math.min(lim[1],PF[k]+d));
 $('st-'+k).textContent=k==='lo'||k==='hi'?PF[k]+'°F':hr12(PF[k]);
 const t=$('rbT'),h=$('rbH');t.style.left=PF.lo/85*100+'%';t.style.right=100-PF.hi/85*100+'%';h.style.left=PF.from/24*100+'%';h.style.right=100-PF.to/24*100+'%'}

document.addEventListener('click',e=>{const t=e.target.closest('button,[data-go],[data-crag],[data-ctab],summary');if(!t)return;
 const inApp=app.contains(t),inCrag=!inApp&&t.closest('#phone'),inNotes=t.closest('.notes');if(!inApp&&!inCrag&&!inNotes)return;
 const d=t.dataset;
 if(d.j){jump(d.j);return}
 if(inCrag){
  if(t.matches('.head .back')){back();return}
  if(t.matches('.head .fbt')||t.matches('.ck .rep')){fbKind='check';nav2('feedback');return}
  if(d.cg!==undefined){cgSub=d.cg||null;renderCrag();$('pg5').scrollTo({top:0,behavior:RM?'auto':'smooth'});return}
  if(d.cgr!==undefined){cgSub='route';renderCrag();$('pg5').scrollTop=0;return}
  if(d.cgo!==undefined){go(+d.cgo);return}
  if(d.go==='check'){fbKind='check';nav2('feedback');return}
  if(d.go==='howscore'){e.preventDefault();nav2('profile');return}
  if(d.go==='edit'){nav2('edit');return}
  if('remove' in d){if(t.dataset.armed){stack=['list'];render('l');toast('Removed Red Wing');return}t.dataset.armed=1;t.firstElementChild.textContent='Tap again to remove';return}
  if('rearr' in d){toast('Drag the cards into the order you want');return}
  if(t.closest('.seg')&&t.closest('#pg5')){qa('button',t.closest('.seg')).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
  if(d.bar!==undefined&&t.closest('#pg5')){const v=t.closest('.vb');qa('.col',v).forEach((c,i)=>c.classList.toggle('on',i===+d.bar));return}
  return}
 if(d.toast&&!d.go&&!('back' in d))toast(d.toast);
 if(d.top){nav2(d.top,{reset:true});return}
 if(d.crag){openCrag(d.crag);return}
 if(d.ctab!==undefined&&!t.closest('.lst')){cityTab=+d.ctab;$('cpn').innerHTML=CP[cityTab]();$('cpn').classList.remove('cpn');void $('cpn').offsetWidth;$('cpn').classList.add('cpn');
  qa('.app .nav button').forEach((b,i)=>b.setAttribute('aria-selected',i===cityTab));$('scr').scrollTop=0;grow($('cpn'));rollIn($('cpn'));initLw($('cpn'));return}
 if('cwho' in d){$('who').click();return}
 if(d.gocrag!==undefined){openCrag('rw',+d.gocrag);return}
 if(d.go){if(d.go==='check'){fbKind='check';nav2('feedback');return}if(d.go==='feedback')fbKind='app';if(d.go==='add')addState='main';nav2(d.go,{reset:'reset' in d,replace:'replace' in d});if(d.toast)toast(d.toast);return}
 if('back' in d){back();if(d.toast)setTimeout(()=>toast(d.toast),30);return}
 if(d.sort){sortBy=d.sort;render();return}
 if('remove' in d){if(t.dataset.armed){nav2('list',{reset:true});toast('Removed Minneapolis');return}t.dataset.armed=1;t.firstElementChild.textContent='Tap again to remove';return}
 if('deltrip' in d){if(t.dataset.armed){nav2('trips',{reset:true});toast('Trip deleted');return}t.dataset.armed=1;t.firstElementChild.textContent='Tap again to delete';return}
 if('rearr' in d){toast('Drag the cards into the order you want');return}
 if(d.hr){hOpen=hOpen===+d.hr?-1:+d.hr;$('cpn').innerHTML=CP[2]();return}
 if(t.closest('[data-hc]')){hChip=d.v;$('cpn').innerHTML=CP[2]();return}
 if(t.closest('[data-fk]')){fbKind=d.v;render();return}
 if(t.closest('[data-tm]')){trendMode=d.v;$('trendBox').innerHTML=trendChart();rollIn($('trendBox'));qa('[data-tm] button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===trendMode));return}
 if(d.bar!==undefined&&t.closest('[data-tdays]')){tDay=+d.bar;qa('[data-tdays] .col').forEach((c,i)=>c.classList.toggle('on',i===tDay));$('tdcW').innerHTML=dayCard(curTrip,tDay);rollIn($('tdcW'));return}
 if(d.bar!==undefined&&t.closest('[data-wk]')){wkSel=+d.bar;drawWeek();return}
 if(d.bar!==undefined){const v=t.closest('.vb');qa('.col',v).forEach((c,i)=>c.classList.toggle('on',i===+d.bar));return}
 if('rdef' in d){qa('[data-rng]').forEach(el=>{el.dataset.lo=el.dataset.rng==='wT'?30:8;el.dataset.hi=el.dataset.rng==='wT'?60:18});RNG.wT=[30,60];RNG.wH=[8,18];initRng($('scr'));drawWeek();return}
 if('invite' in d){invited=true;render();toast('Link created');return}
 if('done' in d){const fb=t.closest('.fb');fb.style.opacity=.4;t.textContent='Resolved';t.disabled=true;return}
 if(d.adds){addState=d.adds;render();return}
 if(d.addres!==undefined){addState='save';render();return}
 if('coordnext' in d){$('coordErr').textContent='Give the place a name.';return}
 if(d.st){profStep(d.st,+d.d*(d.st==='lo'||d.st==='hi'?5:1));return}
 if('preset' in d){Object.assign(PF,{lo:30,hi:60,from:8,to:18});render();return}
 if('ck' in d){t.setAttribute('aria-pressed',t.getAttribute('aria-pressed')!=='true');return}
 if('sw' in d){t.setAttribute('aria-checked',t.getAttribute('aria-checked')!=='true');return}
 if('dsel' in d){qa('[data-dsel]').forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.closest('[data-single]')){qa('button',t.closest('[data-single]')).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.closest('.seg')){qa('button',t.closest('.seg')).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.matches('.leg')){t.classList.toggle('open');t.setAttribute('aria-expanded',t.classList.contains('open'));return}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.app [role=button]')){e.preventDefault();e.target.click()}});
document.addEventListener('toggle',e=>{if(e.target.matches&&e.target.matches('[data-pastd]'))pastOpen=e.target.open},true);
document.addEventListener('input',e=>{if(e.target.id==='addQ'&&e.target.value.length>=3&&addState==='main'){addState='search';render();const q=$('addQ');q.focus();q.setSelectionRange(9,9)}});
function initLw(root){qa('.lw',root).forEach(w=>{const wt=w.querySelector('.wt');wt.style.transition='none';wt.style.height='0';requestAnimationFrame(()=>requestAnimationFrame(()=>{wt.style.transition='';wt.style.height=Math.min(.95,+w.dataset.l)*88+'%'}))})}
const _after=after;after=function(id){_after(id);initLw($('scr'))};
/* the search's pick: from the app layer it opens that place */
window.__slOpen=c=>{const real={rw:'rw',tf:'tf',dl:'dl',ss:'ss',mp:'mp'}[c.id];if(!real)return;
 if(real==='mp'){if(stack[stack.length-1]==='city'){cityTab=0;render()}else{if(stack[stack.length-1]==='crag')stack.pop();cityTab=0;nav2('city')}return}
 if(stack[stack.length-1]!=='crag'){if(stack[stack.length-1]==='city')stack.pop();openCrag(real)}};

/* ================= map ================= */
/*MAP*/

/* ================= jump list ================= */
let lastKey='list';
const JUMPS={
 login:()=>nav2('login',{reset:true}),join:()=>nav2('join',{reset:true}),welcome:()=>nav2('welcome',{reset:true}),list:()=>nav2('list',{reset:true}),
 ov:()=>{stack=['list'];openCrag('rw',0)},daily:()=>{stack=['list'];openCrag('rw',1)},hourly:()=>{stack=['list'];openCrag('rw',2)},precip:()=>{stack=['list'];openCrag('rw',3)},rock:()=>{stack=['list'];openCrag('rw',4)},
 crag:()=>{stack=['list'];openCrag('rw',5)},wall:()=>{stack=['list'];openCrag('rw',5);cgSub='wall';renderCrag()},route:()=>{stack=['list'];openCrag('rw',5);cgSub='route';renderCrag()},
 city:()=>{stack=['list'];openCrag('mp')},cityh:()=>{stack=['list'];cityTab=2;nav2('city')},cityp:()=>{stack=['list'];cityTab=3;nav2('city')},edit:()=>{stack=['list'];nav2('edit')},
 add:()=>{stack=['list'];addState='main';nav2('add')},search:()=>{stack=['list'];addState='search';nav2('add')},save:()=>{stack=['list'];addState='save';nav2('add')},coords:()=>{stack=['list'];addState='coords';nav2('add')},browse:()=>{stack=['list'];addState='browse2';nav2('add')},
 feedback:()=>{stack=['list'];fbKind='app';nav2('feedback')},check:()=>{stack=['list'];fbKind='check';nav2('feedback')},
 map:()=>nav2('map',{reset:true}),trips:()=>{pastOpen=true;nav2('trips',{reset:true})},newtrip:()=>{stack=['trips'];nav2('newtrip')},
 trip1:()=>{stack=['trips'];trendMode='day';tDay=0;nav2('trip1')},trip2:()=>{stack=['trips'];nav2('trip2')},trip2crag:()=>{stack=['trips','trip2'];tDay=0;nav2('trip2crag')},trip3:()=>{stack=['trips'];nav2('trip3')},past:()=>{stack=['trips'];nav2('past')},
 profile:()=>{invited=false;nav2('profile',{reset:true})}};
function jump(k){lastKey=k;JUMPS[k]();if(stack[stack.length-1]!=='crag'){const s=$('scr');if(s)s.scrollTop=0}qa('.idx button').forEach(b=>b.setAttribute('aria-current',b.dataset.j===k))}
window.WT={jump,JUMPS,back,nav2};
app.innerHTML=`<div class="st"><span>9:41</span><span aria-hidden="true">●●● ▭</span></div><div id="ah"></div><div class="toast" id="toast" role="status"></div>`;
[0,1,2,3,4].forEach(n=>{const x=$("pg"+n);if(x)x.querySelector(".in").insertAdjacentHTML("beforeend",foot(false,{edit:n===3,rearr:n===0}))});
renderCrag();render();
})();
