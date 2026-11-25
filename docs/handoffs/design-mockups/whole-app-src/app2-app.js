/* WeatherTeam6, whole app in the Passo look. Content and data are the real app's, captured 25 Nov 2026 ~10:40 AM CST. */
const $=id=>document.getElementById(id),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const D=window.DATA;
const col=s=>s==null?'#5b5d63':s>=60?'#b8f542':s>=40?'#f6ad55':'#fc8181';
const cls=s=>s==null?'':s>=60?'g':s>=40?'fa':'po';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* ---------- icons ---------- */
const I={
 sun:(s=22)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#ffd36b" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#ffd36b"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>`,
 moon:(s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M19 15.5A8 8 0 0 1 8.5 5a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="#c2c3c8" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
 part:(s=24)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3.6" fill="#ffd36b"/><path d="M9 2.6v1.6M2.6 9h1.6M4.5 4.5l1.1 1.1M13.5 4.5l-1.1 1.1" stroke="#ffd36b" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.5 1.4 2.8 2.8 0 0 0 .2 5.6Z" fill="#e4e5ea"/></svg>`,
 back:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>`,
 arrow:d=>`<svg width="14" height="14" viewBox="0 0 14 14" style="transform:rotate(${d+180}deg)"><path d="M7 1.5v11M3.5 5 7 1.5 10.5 5" fill="none" stroke="#c2c3c8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
 cond:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="3.4"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>`,
 trips:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12.5" rx="2.5"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke-linecap="round"/></svg>`,
 map:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2.5 5 7 3l6 2 4.5-2v12L13 17l-6-2-4.5 2z"/><path d="M7 3v12M13 5v12"/></svg>`,
 prof:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="6.5" r="3.5"/><path d="M3.5 17.5a6.5 6.5 0 0 1 13 0" stroke-linecap="round"/></svg>`,
 ov:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 15a7 7 0 1 1 14 0"/><path d="M10 15l3.5-4.5"/></svg>`,
 daily:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 16V9M8 16V5M12 16v-6M16 16V7"/></svg>`,
 hourly:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.6 2"/></svg>`,
 precip:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10 2.5S4.5 9 4.5 12.5a5.5 5.5 0 0 0 11 0C15.5 9 10 2.5 10 2.5Z"/></svg>`,
 rock:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2.5 16.5 7 7l3 4 2.5-5 5 10.5z"/></svg>`,
 crag:`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5"/></svg>`,
};
const cloud=(s=22)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M6.5 18.5h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6 3.2 3.2 0 0 0-.8 6.4Z" fill="#8a8c93"/></svg>`;
const skyIcon=(r,nx)=>{if(!r)return I.sun();const h=r[1];if(h<7||h>=17)return I.moon();const m=(nx||r)[11]??0;return m>=30?I.sun():m>0?I.part():cloud()};

/* ---------- places ---------- */
const LOCS=[
 {id:'ss',name:'Sandstone',rock:'Sandstone (hard quartz)',crag:true,ll:[46.1316,-92.8589]},
 {id:'tf',name:'Taylors Falls',rock:'Basalt (dense)',crag:true,ll:[45.3955,-92.6616]},
 {id:'dl',name:"Devil's Lake",rock:'Quartzite',crag:true,ll:[43.418,-89.715]},
 {id:'rw',name:'Red Wing',rock:'Dolomite or limestone (with chert)',crag:true,ll:[44.5625,-92.5338]},
 {id:'mp',name:'Minneapolis',crag:false,ll:[44.9778,-93.265]},
];
const L=id=>LOCS.find(l=>l.id===id);
const TABS=[['ov','Overview'],['daily','Daily'],['hourly','Hourly'],['precip','Precip'],['rock','Rock'],['crag','Crag']];

/* ---------- chrome ---------- */
const tbar=(label,to,fb=true)=>`<div class="tbar"><button class="bk" data-back="${to||''}"><span class="rb">${I.back}</span>${label}</button>${fb?'<button class="fbk" data-go="feedback">Feedback</button>':''}</div>`;
const srcs=(city)=>`<details class="srcs"><summary>Sources</summary><dl>
 <dt>Forecast</dt><dd>Open-Meteo · GFS, ECMWF, ICON, GEM</dd><dt>Precip</dt><dd>Open-Meteo past hours</dd>
 ${city?'':'<dt>Crag</dt><dd>OpenBeta community data (CC0), Nov 16, 2026</dd><dt>Sunshine</dt><dd>GFS via Open-Meteo</dd><dt>Sun</dt><dd>USGS 3DEP lidar and AWS Terrarium terrain, Nov 16, 2026</dd>'}</dl></details>`;
const foot=(city)=>`${srcs(city)}<div class="foot">${city?'':'<button class="lnk" data-go="check">Check this forecast</button>'}<button class="lnk danger" data-remove>Remove location</button></div>`;
const rearr=`<div style="text-align:center;margin-top:4px"><button class="lnk u" data-rearr>Rearrange cards</button></div>`;

/* ================= screens ================= */
const S={};

S.login=()=>`<div class="in" style="padding-top:110px"><div class="pad">
 <h1 style="font-size:36px">WeatherTeam6</h1><p class="body" style="margin-top:12px">Sign in to see your locations.</p>
 <label class="fld"><span>Username</span><input class="inp" autocomplete="username" value=""></label>
 <label class="fld"><span>Passphrase</span><input class="inp" type="password" autocomplete="current-password"></label>
 <div style="margin-top:22px"><button class="pill wide" data-go="list" data-reset>Sign in</button></div></div></div>`;

S.join=()=>`<div class="in" style="padding-top:110px"><div class="pad">
 <h1 style="font-size:36px">WeatherTeam6</h1><p class="body" style="margin-top:12px">You’ve been invited. Pick a username and passphrase.</p>
 <label class="fld"><span>Username</span><input class="inp" autocomplete="username"></label>
 <label class="fld"><span>Passphrase</span><input class="inp" type="password" autocomplete="new-password"></label>
 <p class="small" style="margin-top:7px">At least 12 characters. A few unrelated words works well.</p>
 <label class="fld"><span>Repeat passphrase</span><input class="inp" type="password" autocomplete="new-password"></label>
 <div style="margin-top:22px"><button class="pill wide" data-go="welcome" data-reset>Create account</button></div>
 <p class="small" style="margin-top:28px">Without a code in the link, this screen reads “This link is missing its invite code. Ask for a new one.”</p></div></div>`;

S.welcome=()=>{const wk=[['Thu',47],['Fri',100],['Sat',75],['Sun',41],['Mon',71]];
 const strip=Array.from({length:24},(_,h)=>{const inH=h>=8&&h<18;const c=h>=9&&h<13?'#b8f542':h>=13&&h<18?'#f6ad55':h<9&&h>=6?'#b8f542':'#f6ad55';return `<i style="background:${c};opacity:${inH?1:.28}"></i>`}).join('');
 return `<div class="in"><div class="tbar"><span class="lbl" style="color:#fff;font-weight:600">Welcome</span><button class="fbk" data-go="list" data-reset>Skip</button></div>
 <div class="pad" style="margin-top:14px"><h1>Welcome to WeatherTeam6</h1><p class="body" style="margin-top:10px">A few settings before you start. The score depends on them, so they’re worth a minute. You can change any of this later on Profile.</p></div>
 <div class="sec" style="margin-top:14px"><h2>Reading the score</h2>
  <div class="legend4"><div><b class="g">60</b>and up</div><div><b class="fa">40</b>to 59</div><div><b class="po">0</b>to 39</div><div><b>—</b>no data</div></div>
  <ul class="dots"><li>0 to 100: how dry the rock is and how good the grip is likely to be.</li><li>A day’s score is its best 3 hours in a row inside your climbing hours.</li><li>— means forecast data is missing. The app leaves a gap rather than guess.</li><li>Weather warnings show beside the score and never change it.</li></ul></div>
 <div class="sec"><h2>Climbing preferences</h2><p class="body" style="margin-top:6px">Your climbing hours and temperature range set every score. Change them and watch the example week.</p>
  <div class="sh" style="margin:18px 0 0"><span class="lbl">Climbing hours</span><b>8 am to 6 pm</b></div>
  <div class="dual"><div class="tr"></div><div class="on" style="left:34.8%;right:21.7%"></div><div class="th" style="left:34.8%"></div><div class="th" style="left:78.3%"></div></div>
  <div class="sh" style="margin:0"><span class="small">12 am</span><span class="small">11 pm</span></div>
  <div class="sh" style="margin:16px 0 0"><span class="lbl">Temperature range</span><b>30°F to 60°F</b></div>
  <div class="dual"><div class="tr"></div><div class="on" style="left:35.3%;right:29.4%"></div><div class="th" style="left:35.3%"></div><div class="th" style="left:70.6%"></div></div>
  <div class="sh" style="margin:0"><span class="small">0°</span><span class="small">85°</span></div>
  <button class="lnk u" style="margin-top:6px">Back to the defaults (30°F to 60°F, 8 am to 6 pm)</button>
  <div class="card" style="margin:16px 0 0;padding:18px">
   <div class="sh" style="margin:0"><h3>Red Wing</h3><span class="lbl f">Example · sample week</span></div>
   <div class="wk" id="wkW">${wk.map(([d,s],i)=>`<button aria-pressed="${i===2}" data-wk="${i}">${d}<b style="color:${col(s)}">${s}</b></button>`).join('')}</div>
   <p class="body" style="margin-top:12px;color:#fff">Sat scores 75 on the defaults. Move the sliders to see it change.</p>
   <p class="small" style="margin-top:4px;color:var(--t2)">It reaches 78°F in your hours, above your 60°F.</p>
   <div class="strip24">${strip}</div><div class="sh" style="margin:6px 0 0;display:grid;grid-template-columns:repeat(4,1fr)"><span class="small">12a</span><span class="small">6a</span><span class="small">12p</span><span class="small">6p</span></div></div></div>
 <div class="sec"><h2>Open a crag on</h2><p class="body" style="margin-top:6px">The tab you see first when you tap a crag.</p>
  <div class="chips" style="margin-top:12px" data-single>${TABS.map(([k,n],i)=>`<button class="chip" aria-pressed="${i===0}">${n}</button>`).join('')}</div></div>
 <div class="sec"><div class="sh" style="margin-bottom:6px"><h2>Feedback</h2><span class="lbl">Feedback</span></div><p class="body">It’s in the top-right of every screen and comes straight to the person who runs the app. Use it for bugs, ideas, or a score that didn’t match the rock. From a crag, it opens with that crag chosen.</p></div>
 <div class="sec"><h2>Add to home screen</h2><p class="body" style="margin-top:6px">Opens like an app and keeps you signed in.</p><ul class="dots"><li>iPhone: Safari › Share › Add to Home Screen</li><li>Android: Chrome › ⋮ › Add to Home screen</li></ul></div>
 <div class="pad" style="display:grid;gap:6px;margin-top:6px"><button class="pill wide" data-go="list" data-reset>Keep the defaults and start</button><button class="lnk" style="justify-content:center" data-go="list" data-reset>Skip for now</button></div></div>`};

S.list=()=>`<div class="in"><div class="glow" style="width:260px;height:200px;left:-80px;top:20px;background:rgba(184,245,66,.12)"></div>
 <div class="pad" style="display:flex;justify-content:space-between;align-items:flex-start;padding-top:14px"><div><h1 style="font-size:34px">Conditions</h1><p class="lbl f" style="margin-top:6px">5 saved · updated just now</p></div>
 <button class="pill ghost sm" data-go="add" style="margin-top:4px">+ Add</button></div>
 <div class="pad" style="display:flex;justify-content:flex-end;margin-top:8px"><label class="pillrow" style="min-height:36px;gap:6px">Sort by <select style="background:none;border:0;font:600 13px var(--font);color:#fff" aria-label="Sort by"><option>Score</option><option>Name</option><option>Added</option></select></label></div>
 <div class="rows" style="margin:10px 20px 0">${LOCS.map(l=>l.crag?`<button class="lrow" data-crag="${l.id}"><span class="sky">${I.sun(26)}</span><span class="tx"><b>${l.name}</b><span class="small" style="color:var(--t2)">Dryness: Dry · ${l.rock}</span><span class="small">good 10a–11p · today 100</span></span><span style="text-align:right"><b style="display:block;font:600 34px/1 var(--font);letter-spacing:-.03em;color:var(--good)">100</b><span class="small">now</span></span><span class="chev">›</span></button>`
 :`<button class="lrow" data-crag="${l.id}"><span class="sky">${I.sun(26)}</span><span class="tx"><b>${l.name}</b><span class="small" style="color:var(--t2)">Today: 25–37°F</span></span><span class="chev">›</span></button>`).join('')}</div></div>`;

/* ---------- crag ---------- */
let crag='rw',tab='ov',cragSub=null;
const cragName=()=>L(crag).name;
const isCity=()=>!L(crag).crag;
function slim(){const n=cragName();
 if(tab==='hourly')return `<div class="slim"><div class="n big">${n}</div><div class="v"><b class="g">100</b><span class="small">Today 11 AM</span></div></div>`;
 if(tab==='precip')return `<div class="slim"><div class="n">${n}</div><div class="v"><b class="rn">2%</b><span class="small">chance today</span></div></div>`;
 if(tab==='rock')return `<div class="slim"><div><div class="n">${n}</div><span class="small">Dryness: Dry</span></div><div class="v"><b>10°</b><span class="small">air above dew</span></div></div>`;
 if(tab==='daily'||tab==='crag')return `<div class="slim"><div><div class="n">${n}</div><span class="small">Wednesday · good 10a–11p · Dry</span></div><div class="v"><b class="g">100</b><span class="small">${tab==='daily'?'best day':'today'}</span></div></div>`;
 return ''}
S.crag=()=>{const order=[crag,...LOCS.map(l=>l.id).filter(i=>i!==crag)];
 return `<div class="strip"><button class="rb" data-back aria-label="Back">${I.back}</button><div class="names">${order.map(i=>`<button data-sw="${i}" aria-current="${i===crag}">${L(i).name}</button>`).join('')}</div><button class="fbk" data-go="check">Feedback</button></div>
 <div id="cragBody">${cragBody()}</div>`};
function cragBody(){const city=isCity();
 if(tab==='crag'&&cragSub==='wall')return slim()+T.wall();
 if(tab==='crag'&&cragSub==='route')return slim()+T.route();
 return slim()+(city&&tab==='ov'?T.city():T[tab]())}

const T={};
/* Overview */
T.ov=()=>`<div class="in" style="padding-top:0"><div class="glow" style="width:280px;height:220px;left:-60px;top:40px;background:rgba(184,245,66,.14)"></div>
 <div class="card" style="margin-top:14px;--rim:rgba(184,245,66,.45)"><h1>Red Wing</h1><p class="lbl f" style="margin-top:4px">Score at 11am</p>
 <div class="hero"><div class="sc g">100</div><div class="q">
  <div><span class="lbl f">Dryness</span><b>Dry</b><span class="small">3d 9h since real rain</span></div>
  <div><span class="lbl f">Rock</span><b>Dolomite or limestone (with chert)</b><span class="small">softens when wet</span></div>
  <div><span class="lbl f">Air</span><b>33°F</b><span class="small">high 37° · low 26°</span></div>
  <div><span class="lbl f">Good hours</span><b>10a–11p</b><span class="small">14 hours</span></div></div></div>
 <button class="wline" aria-expanded="false" data-walls><span>◐☀</span>Sun and shade walls alike<span class="ar">▾</span></button>
 <div class="wpick" id="wpick" hidden><h3>Pick a wall</h3><p class="small" style="margin-top:4px">Scores at 11am. ☀ in sun, ◐ in shade. Sun hours are the rest of today’s climbing hours.</p>
  <button class="wrow" aria-pressed="true" style="margin-top:8px"><b class="sv">◐☀</b><span class="tx"><b>Auto: best walls</b><span class="small">sun and shade</span></span></button>
  <div class="grp"><span class="lbl f">In sun now</span>
   <button class="wrow"><b class="sv g">100</b><span class="tx"><b>☀ Cyclops Area</b><span class="small">7 sun hours</span></span></button>
   <button class="wrow"><b class="sv g">94</b><span class="tx"><b>☀ Winter Wall</b><span class="small">8 sun hours</span></span></button></div>
  <div class="grp"><span class="lbl f">In shade now</span>${['Annadonia Area','Large Roof Area','New Vice Area','Perfect Crimb Area'].map(n=>`<button class="wrow"><b class="sv g">100</b><span class="tx"><b>◐ ${n}</b><span class="small">Under trees</span></span></button>`).join('')}</div></div></div>
 <div id="ovCards">${ovCards(false)}</div>
 <div style="margin-top:8px">${foot(false)}</div></div>`;
function ovCards(city){const nd=city?[['Today','37°/25°','0%'],['Thu','38°/24°','0%'],['Fri','40°/24°','14%'],['Sat','43°/31°','17%',1],['Sun','36°/30°','17%'],['Mon','36°/28°','14%']]
 :[['Today','37°/26°','2%'],['Thu','39°/25°','0%'],['Fri','42°/25°','20%'],['Sat','45°/31°','29%',1],['Sun','36°/30°','29%'],['Mon','37°/27°','15%']];
 const rows=city?D.mp:D.rw;
 return `<div class="sec first" style="margin-top:14px"><div class="sh"><h2>Today</h2><span class="lbl">${city?'':'good hours 10am–11pm'}</span></div>
 <div style="text-align:center"><span class="tchip" id="tcChip"></span></div><div class="tc" id="tc" data-city="${city?1:''}">${todayChart(rows,city)}</div>
 <div class="key"><span><i style="background:${city?'#fff':'linear-gradient(90deg,#f6ad55,#b8f542)'}"></i>${city?'air':'air, coloured by score'}</span><span><i style="background:repeating-linear-gradient(90deg,#a5b4fc 0 4px,transparent 4px 7px)"></i>dew point</span><span><i style="background:rgba(165,180,252,.5);width:8px;height:10px"></i>chance of rain</span></div></div>
 <div class="sec"><div class="sh"><h2>Next days</h2><span class="lbl">${city?'':'day score · '}high/low · chance of rain</span></div>
 <div class="rows ${city?'city':''}">${nd.map(([d,hl,p,pc])=>`<button class="nd" data-tab="daily" style="width:100%;text-align:left"><b>${d}</b><span>${pc?I.part(22):I.sun(20)}</span><span class="hl">${hl}</span><span class="pc">${p}</span>${city?'':'<span class="s g">100</span>'}</button>`).join('')}</div></div>
 <div class="sec"><h2 style="margin-bottom:6px">Right now</h2><div class="rows">
  <button class="rn-row" data-tab="precip"><span class="lbl">Last rain</span><span class="r"><b>Sun</b><span class="small">${city?'0.09 in · 3d 9h ago':'0.54 in · 3d 7h ago'}</span></span><span class="chev">›</span></button>
  <button class="rn-row" data-tab="precip"><span class="lbl">Next rain</span><span class="r"><b>None likely</b><span class="small">through Tue 12/1</span></span><span class="chev">›</span></button>
  <button class="rn-row" data-tab="hourly"><span class="lbl">Wind</span><span class="r"><b>5 mph</b><span class="small">gusts ${city?8:7}</span></span><span class="chev">›</span></button></div>
  <p class="small" style="margin-top:10px">${city?'Air: HRRR':'Air: HRRR · rain: median of GFS, ECMWF, ICON, GEM'}</p></div>${rearr}`}
function todayChart(rows,city){const H=rows.slice(11,28),W=350,top=24,bot=128,n=H.length,x=i=>14+i*(W-28)/(n-1);
 const ts=H.flatMap(r=>[r[2],r[3]]),lo=Math.floor((Math.min(...ts)-2)/5)*5,hi=Math.ceil((Math.max(...ts)+2)/5)*5,y=v=>bot-(v-lo)/(hi-lo)*(bot-top);
 const path=k=>H.map((r,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join('');
 let seg='';if(city)seg=`<path d="${path(2)}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
 else for(let i=0;i<n-1;i++)seg+=`<path d="M${x(i)},${y(H[i][2])}L${x(i+1)},${y(H[i+1][2])}" stroke="${col(H[i][9])}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
 const area=`<path d="${path(2)}L${x(n-1)},${bot}L${x(0)},${bot}Z" fill="url(#tg)"/>`;
 const ticks=[lo,Math.round((lo+hi)/2/5)*5,hi].map(v=>`<text x="-4" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#9c9da3">${v}°</text><line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/>`).join('');
 const pills=H.map((r,i)=>{const h=Math.max(3,r[6]/100*30);return `<rect x="${x(i)-5}" y="${bot+12}" width="10" height="34" rx="5" fill="rgba(255,255,255,.07)"/><rect x="${x(i)-5}" y="${bot+46-h}" width="10" height="${h}" rx="5" fill="#a5b4fc" opacity=".8"/>`}).join('');
 const lab={0:'now',1:'12p',4:'3p',7:'6p',10:'9p',13:'Thu',16:'3a'};
 const labs=Object.entries(lab).map(([i,t])=>`<text x="${x(+i)}" y="${bot+64}" text-anchor="middle" font-size="12" fill="#9c9da3">${t}</text>`).join('');
 const sc=city?'':H.map((r,i)=>`<text x="${x(i)}" y="${bot+82}" text-anchor="middle" font-size="12" font-weight="600" fill="${col(r[9])}">${r[9]}</text>`).join('');
 const sun=`<g transform="translate(${x(1)-8},2)">${I.sun(16).replace('<svg','<svg x="0" y="0"')}</g>`;
 return `<svg viewBox="-30 0 ${W+34} ${bot+(city?70:90)}" role="img" aria-label="Today, hour by hour"><defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
 ${ticks}${area}<path d="${path(3)}" fill="none" stroke="#a5b4fc" stroke-width="1.6" stroke-dasharray="4 3"/>${seg}${sun}
 <line x1="${x(0)}" x2="${x(0)}" y1="${top-8}" y2="${bot+46}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="2 3"/>
 <circle cx="${x(0)}" cy="${y(H[0][2])}" r="11" fill="#fff" opacity=".18"/><circle cx="${x(0)}" cy="${y(H[0][2])}" r="5.5" fill="${city?'#fff':col(H[0][9])}" stroke="#111" stroke-width="1.5"/>
 ${pills}${labs}${sc}</svg>`}
const setChip=(city)=>{const r=(city?D.mp:D.rw)[11];$('tcChip').innerHTML=city?`Now <span><i style="background:#fff"></i>air <b>${r[2]}°</b></span><span><i style="background:#a5b4fc"></i>dew <b>${r[3]}°</b></span><span><i style="background:#a5b4fc"></i>rain <b>${r[6]}%</b></span>`
 :`Now <b class="g">${r[9]}</b><span><i style="background:#b8f542"></i>air <b>${r[2]}°</b></span><span><i style="background:#a5b4fc"></i>dew <b>${r[3]}°</b></span><span><i style="background:#a5b4fc"></i>rain <b>${r[6]}%</b></span> Dry`};

/* City */
T.city=()=>`<div class="in" style="padding-top:0"><div class="glow" style="width:280px;height:220px;left:-60px;top:40px;background:rgba(165,180,252,.12)"></div>
 <div class="card" style="margin-top:14px"><h1>Minneapolis</h1>
 <div style="display:flex;align-items:center;gap:16px;margin-top:10px"><span style="font:600 96px/.9 var(--font);letter-spacing:-.05em">34°</span><div><b style="font:600 17px/1.2 var(--font)">Air now</b><p style="font:600 17px/1.3 var(--font)">High 37° · Low 25°</p><p class="small">44.9778, −93.2650</p></div></div>
 <p class="body" style="margin-top:12px">Last rain: 3d 9h ago · Humidity 63% · wind 5 mph · gusts 8 mph</p></div>
 ${ovCards(true)}<div style="margin-top:8px">${foot(true)}</div></div>`;

/* Daily */
const DAYS=[['Today','Nov 25',26,37,'2%','10a–11p','7 h'],['Thu','Nov 26',25,39,'0%','12a–9p','8 h'],['Fri','Nov 27',25,42,'20%','3a–10p','8 h'],['Sat','Nov 28',31,45,'29%','10a–11p','6 h'],['Sun','Nov 29',30,36,'29%','All day','1–8 h','forecasts differ'],['Mon','Nov 30',27,37,'15%','All day','8 h'],['Tue','Dec 1',30,39,'16%','All day','8 h']];
T.daily=()=>`<div class="in" style="padding-top:0"><div class="sec first"><div class="sh"><h2>Seven days</h2><span class="lbl">low–high · chance of rain</span></div>
 <div class="rows">${DAYS.map(([d,dt,lo,hi,p,g,sun,note],i)=>`<button class="drow" data-day="${i}"><div class="t"><b>${d}<small>${dt}</small></b><span class="lo">${lo}°</span><span class="rng"><i style="left:${(lo-24)/22*100}%;right:${(46-hi)/22*100}%"></i></span><span class="hi">${hi}°</span><span class="pc">${p}</span></div>
 <div class="st"><div><span class="lbl f">Score</span><b class="g">100</b></div><div><span class="lbl f">Good</span><b>${g}</b></div><div><span class="lbl f">Rock</span><b>Dry</b></div><div><span class="lbl f">Sun</span><b>${sun}</b>${note?`<span class="small">${note}</span>`:''}</div></div></button>`).join('')}</div>
 <p class="small" style="margin-top:12px">A day score is the worst hour of the best three-hour run inside your climbing hours (8 AM to 6 PM unless you change them on Profile); today counts only hours still ahead. The bar spans each day from low to high, on one scale for the week. Chance of rain is the highest hourly share of wet ensemble members. Sun is the hours of bright sunshine. Tap a day for its hours.</p></div>${foot(isCity())}</div>`;

/* Hourly */
let hMode='list',hChip='All',hOpen=11;
T.hourly=()=>{const city=isCity();return `<div class="in" style="padding-top:0">
 <div class="days" role="tablist">${DAYS.map(([d,dt],i)=>`<button role="tab" aria-selected="${i===0}"><b>${d}</b>${dt}</button>`).join('')}</div>
 <div class="hctl"><div class="seg" id="hChips">${['All','Temp','Rain','Wind','Sun'].map(c=>`<button aria-pressed="${c===hChip}" data-hc="${c}">${c}</button>`).join('')}</div>
 <div class="seg"><button aria-pressed="${hMode==='list'}" data-hm="list" aria-label="List"><svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg></button><button aria-pressed="${hMode==='chart'}" data-hm="chart" aria-label="Chart"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2 12 4-4 3 2 5-6"/></svg></button></div></div>
 ${city?'':`<div class="hgood"><span class="lbl">Good hours <b>10am–11pm</b></span><span class="small">shaded below</span></div>`}
 ${hMode==='list'?hList(city):hCharts(city)}
 <p class="small pad" style="margin-top:14px">${hMode==='list'?'A row is the hour that starts at its time. Temperature, rain and wind are the ensemble: the middle of its members, the likely range in an opened hour, rain as their mean. Chance of rain is the share of members wet in the hour. Humidity, dew point, gusts and wind direction are HRRR’s. Sun is HRRR’s minutes of bright sun, on flat ground.':'A chart’s hour is the one that starts at its time; a line marks that hour’s start, a bar covers the hour. Temperature, rain and wind are the ensemble: the middle of its members, the likely range shaded, rain as their mean. Chance of rain is the share of members wet in the hour. Humidity, dew point, gusts and wind direction are HRRR’s. Sun is HRRR’s minutes of bright sun, on flat ground.'}</p>
 <div style="margin-top:10px">${foot(city)}</div></div>`};
const hl=h=>h===0?'12 AM':h<12?h+' AM':h===12?'12 PM':(h-12)+' PM';
const dirName=d=>['N','NE','E','SE','S','SW','W','NW'][Math.round(((d%360)+360)%360/45)%8];
function hDet(r){return `<div class="hdet"><div><span class="lbl f">Temperature</span><b>${r[2]}°</b><small>likely ${r[16]}–${r[17]}°</small></div><div><span class="lbl f">Humidity</span><b>${r[4]}%</b></div><div><span class="lbl f">Dew point</span><b>${r[3]}°</b></div><div><span class="lbl f">Score</span><b class="${cls(r[9])}">${r[9]??'—'}</b></div>
 <div><span class="lbl f">Chance of rain</span><b class="rn">${r[6]}%</b></div><div><span class="lbl f">Rain</span><b>${r[5]?r[5].toFixed(2):0} in</b></div><div><span class="lbl f">Sun</span><b>${r[11]??'—'} min</b><small>${hl(r[1])}–${hl(r[1]+1)}</small></div><div><span class="lbl f">Wind</span><b>${r[7]} mph</b><small>from ${dirName(r[15])}, gusts ${r[8]}</small></div></div>`}
function hList(city){const rows=(city?D.mp:D.rw).slice(10,24);
 const head=`<div class="hhead" style="grid-template-columns:64px 30px 46px 46px 1fr 46px"><span>Hour</span><span></span><span>${city?'':'Score'}</span><span>°F</span><span style="text-align:center">${hChip==='Temp'?'Likely range':hChip==='Wind'?'Gusts':hChip==='Sun'?'Sun':'Chance of rain'}</span><span>mph</span></div>`;
 return `<button class="lnk u pad" style="display:flex;margin:0 0 4px">Show earlier hours, 12 AM – 9 AM</button>${head}`+rows.map(r=>{const h=r[1];const good=!city&&h>=10;
  const mid=hChip==='Temp'?`${r[16]}–${r[17]}°`:hChip==='Wind'?`${r[8]}`:hChip==='Sun'?`${r[11]??'—'} min`:`${r[6]}%`;
  return `<button class="hrow ${good?'good':''}" aria-expanded="${h===hOpen}" data-hr="${h}"><span class="hr">${hl(h)}${h===10?'<small>Now</small>':''}</span><span>${skyIcon(r,(city?D.mp:D.rw)[r[1]+1])}</span><span class="s ${cls(r[9])}">${city?'':r[9]}</span><span class="tp">${r[2]}°</span><span class="pc">${mid}</span><span class="w">${I.arrow(r[15])} ${r[7]}</span></button>${h===hOpen?hDet(r):''}`}).join('')}
function hCharts(city){const R=(city?D.mp:D.rw).slice(0,24),W=350,x=i=>i*(W/24);
 const xl=`${[0,6,12,18].map(h=>`<text x="${x(h)+7}" y="${'__B'}" text-anchor="middle" font-size="12" fill="#9c9da3">${['12a','6a','12p','6p'][h/6]}</text>`).join('')}`;
 const now=`<line x1="${x(11)}" x2="${x(11)}" y1="0" y2="__N" stroke="#fff" stroke-opacity=".5" stroke-dasharray="2 3"/>`;
 const chip=(a)=>`<div style="text-align:center;margin-top:8px"><span class="tchip">11 AM ${a}</span></div>`;
 const want=c=>hChip==='All'||hChip===c;
 let out='';
 if(want('Temp')){const lo=15,hi=40,y=v=>110-(v-lo)/(hi-lo)*100;const pth=k=>R.map((r,i)=>`${i?'L':'M'}${x(i)+7},${y(r[k])}`).join('');
  let air='';for(let i=0;i<23;i++)air+=`<path d="M${x(i)+7},${y(R[i][2])}L${x(i+1)+7},${y(R[i+1][2])}" stroke="${city?'#fff':col(R[i][9])}" stroke-width="3" stroke-linecap="round"/>`;
  const band=R.map((r,i)=>`${i?'L':'M'}${x(i)+7},${y(r[17])}`).join('')+[...R].reverse().map((r,j)=>`L${x(23-j)+7},${y(r[16])}`).join('')+'Z';
  const hum=R.map((r,i)=>`${i?'L':'M'}${x(i)+7},${110-r[4]/100*100+30}`).join('');
  out+=`<div class="ch"><div class="sh" style="margin:0"><h3>Temperature and humidity</h3><span class="lbl">°F</span></div>${chip(`<span><i style="background:#b8f542"></i>air <b>33°</b></span><span><i style="background:#a5b4fc"></i>dew <b>23°</b></span><span><i style="background:#f0a8e0"></i>humidity <b>67%</b></span>`)}
  <svg viewBox="-28 0 ${W+30} 134">${city?'':`<rect x="${x(10)}" y="0" width="${x(24)-x(10)}" height="110" fill="rgba(184,245,66,.06)"/>`}${[15,20,25,30,35,40].map(v=>`<text x="-4" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#9c9da3">${v}°</text>`).join('')}
  <path d="${band}" fill="rgba(255,255,255,.1)"/><path d="${hum}" fill="none" stroke="#f0a8e0" stroke-width="1.6"/><path d="${pth(3)}" fill="none" stroke="#a5b4fc" stroke-width="1.6" stroke-dasharray="4 3"/>${air}${now.replace('__N',110)}${xl.replace(/__B/g,128)}</svg>
  <div class="key"><span><i style="background:linear-gradient(90deg,#f6ad55,#b8f542)"></i>air, coloured by score</span><span><i style="background:repeating-linear-gradient(90deg,#a5b4fc 0 4px,transparent 4px 7px)"></i>dew point</span><span><i style="background:#f0a8e0"></i>humidity</span><span><i style="background:rgba(255,255,255,.2);height:8px"></i>likely range</span>${city?'':'<span><i style="background:rgba(184,245,66,.25);height:8px"></i>good hours</span>'}</div></div>`}
 if(want('Sun')){out+=`<div class="ch"><div class="sh" style="margin:0"><h3>Sun</h3><span class="lbl">minutes of sun in the hour</span></div>${chip(`<span><i style="background:#ffd36b"></i>sun <b>60 min</b></span><span><i style="background:#6b6d73"></i>cloud <b>32%</b></span>`)}
  <svg viewBox="-28 0 ${W+30} 112">${[0,30,60].map(v=>`<text x="-4" y="${90-v/60*80+4}" text-anchor="end" font-size="11" fill="#9c9da3">${v?v+'m':0}</text>`).join('')}
  ${R.map((r,i)=>{const night=r[11]==null||(r[1]<7||r[1]>=17);const c=r[12]??0;return `<rect x="${x(i)+2}" y="${90-c/100*80}" width="${W/24-4}" height="${c/100*80}" rx="3" fill="#4a4c52"/>`+(r[11]?`<rect x="${x(i)+2}" y="${90-r[11]/60*80}" width="${W/24-4}" height="${r[11]/60*80}" rx="3" fill="#ffd36b"/>`:'')}).join('')}
  <text x="${x(2)}" y="84" font-size="11" fill="#c2c3c8">night</text><text x="${x(19)}" y="84" font-size="11" fill="#c2c3c8">night</text>${now.replace('__N',90)}${xl.replace(/__B/g,108)}</svg>
  <div class="key"><span><i style="background:#ffd36b;height:8px"></i>minutes of sun</span><span><i style="background:#4a4c52;height:8px"></i>cloud</span></div></div>`}
 if(want('Rain')){out+=`<div class="ch"><div class="sh" style="margin:0"><h3>Rain</h3><span class="lbl">chance · inches per hour</span></div>${chip(`<span><i style="background:#a5b4fc"></i>chance <b>0%</b></span><span><i style="background:#7dd3fc"></i>rain <b>0 in</b></span>`)}
  <svg viewBox="-28 0 ${W+30} 130"><text x="-4" y="12" text-anchor="end" font-size="11" fill="#9c9da3">%</text>${R.map((r,i)=>`<rect x="${x(i)+2}" y="2" width="${W/24-4}" height="16" rx="3" fill="rgba(165,180,252,${.08+r[6]/100*.9})" ${i===11?'stroke="#fff" stroke-width="1.5"':''}/>`).join('')}
  ${[['0',0],['.05',.05],['.10',.10]].map(([t,v])=>`<text x="-4" y="${108-v/.1*72+4}" text-anchor="end" font-size="11" fill="#9c9da3">${t}</text><line x1="0" x2="${W}" y1="${108-v/.1*72}" y2="${108-v/.1*72}" stroke="rgba(255,255,255,.06)"/>`).join('')}
  ${R.map((r,i)=>r[5]?`<rect x="${x(i)+2}" y="${108-Math.max(2,r[5]/.1*72)}" width="${W/24-4}" height="${Math.max(2,r[5]/.1*72)}" rx="2" fill="#7dd3fc"/>`:'').join('')}${now.replace('__N',108).replace('y1="0"','y1="22"')}${xl.replace(/__B/g,126)}</svg>
  <div class="key"><span><i style="background:rgba(165,180,252,.6);height:8px"></i>chance, darker the likelier</span><span><i style="background:#7dd3fc;height:8px"></i>inches in the hour</span></div></div>`}
 if(want('Wind')){const y=v=>90-v/10*80;const pth=k=>R.map((r,i)=>`${i?'L':'M'}${x(i)+7},${y(r[k])}`).join('');const band=R.map((r,i)=>`${i?'L':'M'}${x(i)+7},${y(r[19])}`).join('')+[...R].reverse().map((r,j)=>`L${x(23-j)+7},${y(r[18])}`).join('')+'Z';
  out+=`<div class="ch"><div class="sh" style="margin:0"><h3>Wind</h3><span class="lbl">mph</span></div>${chip(`<span><i style="background:#7ee0c3"></i>wind <b>5 mph E</b></span><span><i style="background:#fff"></i>gusts <b>7 mph</b></span>`)}
  <svg viewBox="-28 0 ${W+30} 110">${[0,5,10].map(v=>`<text x="-4" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#9c9da3">${v}</text>`).join('')}<path d="${band}" fill="rgba(126,224,195,.22)"/><path d="${pth(8)}" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="4 3"/><path d="${pth(7)}" fill="none" stroke="#7ee0c3" stroke-width="3" stroke-linecap="round"/>${now.replace('__N',90)}${xl.replace(/__B/g,106)}</svg>
  <div class="key"><span><i style="background:#7ee0c3"></i>sustained</span><span><i style="background:repeating-linear-gradient(90deg,#fff 0 4px,transparent 4px 7px)"></i>gusts</span><span><i style="background:rgba(126,224,195,.3);height:8px"></i>likely range</span></div></div>`}
 if(hChip!=='All')out+=`<div class="pad" style="margin-top:10px"><span class="lbl f">Today 11 AM</span></div>${hDet(R[11])}`;
 return `<div class="hcs">${out}</div>`}

/* Precip */
const ringSvg=(txt,sub,c='#b8f542')=>`<svg width="96" height="96" viewBox="0 0 96 96"><path d="${Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2,r=i%2?38:44;return `${i?'L':'M'}${48+r*Math.sin(a)},${48-r*Math.cos(a)}`}).join('')}Z" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px ${c}88)"/><text x="48" y="50" text-anchor="middle" font-size="22" font-weight="600" fill="#fff" font-family="Space Grotesk">${txt}</text><text x="48" y="64" text-anchor="middle" font-size="10" fill="#c2c3c8" font-family="Space Grotesk">${sub}</text></svg>`;
T.precip=()=>{const city=isCity();const rec=D.recent;const days=['11-25','11-24','11-23','11-22','11-21','11-20','11-19'],dn=['Today','Tue','Mon','Sun','Sat','Fri','Thu'],tot=['0','0','0','0.05','0.54','tr','0'];
 const cell=(d,h)=>{const r=rec.find(r=>r[0]===`${d}T${String(h).padStart(2,'0')}:00`);if(!r)return '<i style="background:none"></i>';const v=r[1];const sel=d==='11-22'&&h===2;
  return `<i class="${sel?'sel':''}" style="${v>0?`background:rgba(96,130,255,${Math.min(1,.35+v/.16*.65)})`:''}" title="${v} in"></i>`};
 const hm=`<div class="hm"><span></span>${Array.from({length:24},(_,h)=>`<span style="text-align:left">${{0:'00',3:'03',6:'06',12:'12',18:'18'}[h]??''}</span>`).join('')}<span class="tot">in</span>
  ${days.map((d,i)=>`<span>${dn[i]}</span>${Array.from({length:24},(_,h)=>cell(d,h)).join('')}<span class="tot">${tot[i]}</span>`).join('')}</div>`;
 const BD=[['Today','2%'],['Thu','0%'],['Fri','20%'],['Sat','29%','Wettest hour 10 PM: trace mean · p90 0.01 in'],['Sun','29%','Wettest hour 12 AM: trace mean · p90 0.01 in'],['Mon','15%'],['Tue','16%']];
 return `<div class="in" style="padding-top:0"><div class="glow" style="width:260px;height:200px;right:-60px;top:20px;background:rgba(165,180,252,.16)"></div>
 <div class="sec first"><div class="ring3">${ringSvg('3 d','since rain')}<div><span class="lbl f">Last rain</span><div style="display:flex;align-items:baseline;gap:8px;margin-top:4px"><b style="font:600 56px/1 var(--font);letter-spacing:-.04em">3</b><span style="font:500 18px/1 var(--font)">days ago</span></div><p class="small" style="margin-top:6px">Sun 3am · 0.54 in over 17 h</p></div></div>
 <div class="figs" style="margin-top:22px"><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Today</span><b>0 in</b><span class="small">0 hours with rain</span></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">This week</span><b>0.59 in</b><span class="small">21 hours with rain</span></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Dry again</span><b class="g">Now</b><span class="small">rock is dry</span></div></div></div>
 <div class="sec"><div class="sh"><h2>Every hour</h2><span class="lbl">past week · to today 10am</span></div>
 <div class="hmd"><span style="grid-column:1/-1;color:#fff;font-weight:600;font-size:14px">Sun 2am–3am</span><span>Precip<b>trace</b></span><span>Type<b>Rain</b></span><span>Resets drying<b>Partly</b></span><span>Dryness<b>Wet</b></span><span>Week so far<b>0.59 in</b></span></div>
 ${hm}<div class="key" style="align-items:center"><span><i style="background:rgba(255,255,255,.07);width:12px;height:12px;border-radius:3px"></i>Dry</span><span>Less ${[.4,.6,.8,1].map(o=>`<i style="background:rgba(96,130,255,${o});width:12px;height:12px;border-radius:3px"></i>`).join('')} More (0.16+ in/h)</span></div></div>
 ${city?'':`<div class="sec"><div class="sh"><h2>Rain gauges</h2><span class="lbl">Past 6 days</span></div>
 <p style="font:600 20px/1.25 var(--font)">The models matched the volunteer gauge</p><p class="lbl" style="margin-top:6px">Volunteer 0.77 in · models 0.59 in, over 6 whole days</p>
 <table class="gt" aria-label="Rain by day, in inches, from each source"><thead><tr><th></th>${['Thu','Fri','Sat','Sun','Mon','Tue'].map(d=>`<th class="${d==='Sun'?'vis':''}">${d==='Sun'?'<span style="display:block;color:#fff;font-size:11px">Visit</span>':''}${d}</th>`).join('')}<th>6 days</th></tr></thead>
 <tbody><tr><td>Models</td><td>0</td><td><i>trace</i></td><td>0.54</td><td class="vis">0.05</td><td>0</td><td>0</td><td>0.59</td></tr><tr><td>Volunteer</td><td>0</td><td>0</td><td>0.77</td><td class="vis">0</td><td>0</td><td>0</td><td>0.77</td></tr></tbody></table>
 <p class="small" style="margin-top:12px">Inches. volunteer: nearest reporting. “part” days are left out of the total; a dash is a day with no figure, and withholds the total. Volunteers read once a day, so overnight rain can land a day off. Matched means within 0.05 in or 25% of the larger total. Each gauge is one spot, which a passing shower can miss.</p>
 <button class="rn-row" style="margin-top:6px"><span class="lbl">Your visits</span><span class="r"><b>1</b></span><span class="chev">›</span></button></div>`}
 <div class="sec"><div class="sh"><h2>Next 48 hours</h2><span class="lbl">in per 6 hours · ensemble mean · drag to read</span></div>
 <svg viewBox="-28 0 380 150" style="display:block;width:100%;height:auto">${[[0,'0'],[.2,'.2"'],[.4,'.4"']].map(([v,t])=>`<text x="-4" y="${120-v/.4*100+4}" text-anchor="end" font-size="11" fill="#9c9da3">${t}</text><line x1="0" x2="350" y1="${120-v/.4*100}" y2="${120-v/.4*100}" stroke="rgba(255,255,255,.06)"/>`).join('')}
 ${['12p','6p','12a','6a','12p','6p','12a','6a'].map((t,i)=>`<text x="${i*43.75+22}" y="142" text-anchor="middle" font-size="11" fill="#9c9da3">${t}</text>`).join('')}
 <text x="175" y="52" text-anchor="middle" font-size="18" font-weight="600" fill="#b8f542" font-family="Space Grotesk">Dry for 48 hours</text><text x="175" y="72" text-anchor="middle" font-size="12" fill="#c2c3c8" font-family="Space Grotesk">0% in every hour: no ensemble member</text><text x="175" y="88" text-anchor="middle" font-size="12" fill="#c2c3c8" font-family="Space Grotesk">has measurable rain.</text></svg></div>
 <div class="sec"><div class="sh"><h2>By day</h2><span class="lbl">chance of rain · wettest hour</span></div><div class="rows">${BD.map(([d,p,t])=>`<div class="bd"><div><b>${d}</b><span class="small">${t||'No hour with measurable rain in the mean'}</span></div><span class="pc">${p}</span></div>`).join('')}</div></div>
 ${rearr}<p class="small pad" style="margin-top:12px">From GFS, ECMWF, ICON and GEM forecasts. Rain here means 0.02 in or more in an hour; lighter showers set drying back by less. Check the rock before you climb. Ahead, each column adds up six hours of the ensemble mean; its chance is the likeliest of those hours, the share of wet ensemble members.</p>
 <div style="margin-top:10px">${foot(city)}</div></div>`};

/* Rock */
const tex=`<svg viewBox="0 0 350 150" preserveAspectRatio="none" width="100%" height="100%"><defs><linearGradient id="rk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfcabd"/><stop offset=".5" stop-color="#9d998e"/><stop offset="1" stop-color="#6e6a61"/></linearGradient><filter id="rf"><feTurbulence type="fractalNoise" baseFrequency=".012 .06" numOctaves="4" seed="7"/><feDiffuseLighting lighting-color="#fff" surfaceScale="3"><feDistantLight azimuth="235" elevation="38"/></feDiffuseLighting><feComposite in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter></defs><rect width="350" height="150" fill="url(#rk)"/><rect width="350" height="150" fill="url(#rk)" filter="url(#rf)" opacity=".9"/>
 <path d="M0 58 C80 50 160 70 350 52" stroke="#3d3a35" stroke-width="7" opacity=".55" fill="none"/><path d="M0 108 C90 100 200 118 350 102" stroke="#3d3a35" stroke-width="5" opacity=".45" fill="none"/></svg>`;
T.rock=()=>{const R=D.rw.slice(11,53),W=350,y=v=>100-v/15*90,x=i=>i*W/41;
 const line=R.map((r,i)=>`${i?'L':'M'}${x(i)},${y(Math.max(0,r[13]))}`).join('');
 const wallSun=[['Annadonia Area','NNE'],['Cyclops Area','S','7:30 AM – 4:20 PM · 8 h 50 min',[7.5,16.33]],['Large Roof Area','NE'],['New Vice Area','NE'],['Perfect Crimb Area','N'],['Winter Wall','SSE','7:30 AM – 4:30 PM · 9 h',[7.5,16.5]]];
 const sx=h=>(h-5)/15*100;
 return `<div class="in" style="padding-top:0"><div class="glow" style="width:260px;height:200px;left:-60px;top:20px;background:rgba(255,211,107,.12)"></div>
 <div class="sec first"><div class="tex">${tex}</div><h1 style="font-size:28px">Dolomite or limestone (with chert)</h1><p class="body" style="margin-top:8px">Limestone or dolomite with hard chert bands.</p>
 <p class="small" style="margin-top:8px">Most similar to: <b style="color:#fff">Limestone</b></p><p class="small">Limestone or dolomite with hard chert set in it.</p>
 <div class="two" style="margin-top:16px"><div><span class="lbl f">Drying after rain</span><b style="display:block;font:600 17px/1.2 var(--font);margin-top:4px">A day or two</b><div class="bars4"><i class="on"></i><i class="on"></i><i></i><i></i></div></div><div><span class="lbl f">Strength when wet</span><b style="display:block;font:600 17px/1.2 var(--font);margin-top:4px">Softens</b><div class="bars4"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div></div></div></div>
 <div class="sec"><div class="sh"><h2>Drying</h2><span class="lbl">Dolomite or limestone (with chert) · dries in 6–24 h</span></div>
 <div class="ring3">${ringSvg('3 d','since rain')}<div style="display:grid;gap:12px"><div class="fig"><span class="lbl f">Dryness</span><b>Dry</b></div><div class="fig"><span class="lbl f">Since real rain</span><b>3d 9h</b></div><div class="fig"><span class="lbl f">Window starts</span><b>6 h</b><span class="small">the tick on the ring</span></div></div></div></div>
 <div class="sec"><div class="sh"><h2>Condensation</h2><span class="lbl">°F air above dew point · next 42 h</span></div>
 <p style="font:600 16px/1.35 var(--font)">Rock near its dew point from 8 PM tomorrow until 4 AM Fri.</p>
 <div style="text-align:center;margin-top:12px"><span class="tchip">11 AM <span><i style="background:#7ee0c3"></i>air above dew <b>10°F</b></span><span>rock (estimate) <b>clear</b></span></span></div>
 <svg viewBox="-28 0 380 128" style="display:block;width:100%;height:auto;margin-top:8px"><rect x="${x(33)}" y="0" width="${x(41)-x(33)}" height="100" fill="rgba(246,173,85,.18)"/><text x="${x(37)}" y="12" text-anchor="middle" font-size="11" fill="#f6ad55">near dew</text>
 ${[0,5,10,15].map(v=>`<text x="-4" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#9c9da3">${v}°</text><line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/>`).join('')}
 <path d="${line}" fill="none" stroke="#7ee0c3" stroke-width="2.6" stroke-linecap="round"/><circle cx="0" cy="${y(R[0][13])}" r="5" fill="#7ee0c3" stroke="#111" stroke-width="1.5"/>
 ${['12p','6p','12a','6a','12p','6p','12a'].map((t,i)=>`<text x="${x(1+i*6)}" y="120" text-anchor="middle" font-size="11" fill="#9c9da3">${t}</text>`).join('')}</svg>
 <div class="key"><span><i style="background:#7ee0c3"></i>air above dew point</span><span><i style="background:rgba(246,173,85,.4);height:8px"></i>rock near dew (estimate)</span></div>
 <p class="small" style="margin-top:12px">Air temperature minus dew point, from the HRRR forecast. Rock colder than the dew point gets wet with no rain, and rock lags the air, so after a cold night it can be wet while the air reads a few degrees clear. Shaded hours are where the score counts condensation against grip: an estimate, because the rock’s temperature is modelled, not measured.</p>
 <p class="small" style="margin-top:8px">Friction is an estimate based on air temperature, dew point and rock temperature.</p></div>
 <div class="sec"><div class="sh"><h2>Sun on the wall</h2><span class="lbl">Today</span></div><label class="fld" style="margin-top:0"><span>Day</span><input class="inp" type="date" value="2026-11-25"></label>
 <div style="margin-top:12px">${wallSun.map(([n,f,t,s])=>`<div style="margin-top:12px"><div class="sh" style="margin:0"><b style="font:600 14px/1.2 var(--font)">${n}</b><span class="small">faces ${f}</span></div><div class="sunbar">${s?`<i style="left:${sx(s[0])}%;right:${100-sx(s[1])}%"></i>`:''}<b style="position:absolute;left:${sx(11)}%;top:-3px;bottom:-3px;width:2px;background:#fff;border-radius:1px"></b></div><span class="small">Sun: ${t||'none'}</span></div>`).join('')}</div>
 <div class="sh" style="margin:10px 0 0;padding:0 ${100/15}% 0 ${100/15}%"><span class="small">6 AM</span><span class="small">Noon</span><span class="small">6 PM</span></div>
 <p class="small" style="margin-top:12px">Hills and ridges only: USGS lidar near the wall, AWS Terrarium terrain beyond, read Nov 16, 2026. Trees and overhangs are not modelled. Each face carries the nearest OpenBeta wall’s name, which can be off. Times to the nearest 5 minutes.</p></div>
 <div class="sec"><h2>How it formed and climbs</h2><p class="lbl f" style="margin-top:12px">How it formed</p><p class="body" style="color:#fff;margin-top:3px">This is limestone or dolomite with lumps and bands of chert, a hard silica that replaced some of the carbonate.</p>
 <p class="lbl f" style="margin-top:12px">Where the holds come from</p><p class="body" style="color:#fff;margin-top:3px">Expect pockets that water has dissolved into the rock, and hard lumps of chert. Holds loosen where the chert meets the softer rock.</p>
 <div class="chips" style="margin-top:12px"><span class="chip">Edges</span><span class="chip">Crimps</span><span class="chip">Pockets</span></div></div>
 <div class="sec"><h2>Rain and sun</h2><div class="care"><span>${I.precip.replace('currentColor','#a5b4fc')}</span><div><b>Rain</b><p class="body">Holds loosen where the chert meets the softer rock, most of all when wet.</p></div></div><div class="care"><span>${I.sun(20)}</span><div><b>Sun</b><p class="body">Pale rock reflects sunlight and stays cooler than dark rock.</p></div></div></div>
 <div class="sec"><h2>Rock care</h2><div class="care" style="margin-top:6px"><span class="g">✓</span>Test chert edges before weighting them</div><div class="care"><span class="po">✗</span>Pulling on chert lumps while the rock is wet</div><p class="small" style="margin-top:6px">A general guide to this rock type. Walls vary — check the rock before you climb.</p></div>
 ${rearr}<div class="card" style="margin-top:14px;padding:16px 18px"><div class="two"><div><span class="lbl f">Rock</span><b style="display:block;font:600 13px/1.3 var(--font);margin-top:4px">Dolomite or limestone (with chert) · locked</b></div><div><span class="lbl f">Coordinates</span><b style="display:block;font:600 13px/1.3 var(--font);margin-top:4px">44.5625, -92.5338</b></div></div></div>
 <div style="margin-top:10px">${foot(false)}</div></div>`};

/* Crag tab */
const GR=[['5.9−',42,'#8ec5ff'],['5.10',38,'#7ee0c3'],['5.11',35,'#b8f542'],['5.12',34,'#f6ad55'],['5.13+',12,'#fc8181'],['Boulder',2,'#c4a7ff']];
const WALLS=[['Annadonia Area',26,'5.7 – 5.12d',[3,6,8,6,3]],['Cyclops Area',17,'5.8 – 5.12b',[2,5,6,4]],['East End, The',9,'5.7 – 5.11a',[4,3,2]],['Large Roof Area',19,'5.8+ – 5.12c',[3,5,6,5]],['Memorial Park (Red Wing)',6,'5.5 – 5.10-',[4,2]],['New Vice Area',31,'5.4 – 5.12b',[10,9,8,3,0,1]],['Perfect Crimb Area',13,'5.6 – 5.12d',[3,4,4,2]],['Winter Wall',42,'5.7+ – 5.14-',[2,5,8,15,12]]];
T.crag=()=>{const hrs=[8,9,10,11,12,13,14,15,16,17,18],hd={8:'8a',10:'10a',11:'11a',12:'12p',14:'2p',16:'4p',18:'6p'};
 const ws=D.walls.slice().sort((a,b)=>a.n.localeCompare(b.n));
 return `<div class="in" style="padding-top:0"><div class="sec first"><span class="lbl f">OpenBeta area</span><h1 style="font-size:26px;margin-top:4px">He Mni Can - Barn Bluff (Red Wing)</h1><p class="small" style="margin-top:6px">USA › Minnesota</p><p class="small">Also within reach: Memorial Park (Red Wing)</p>
 <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px 10px;margin-top:18px">${[['Routes',163],['Walls',8],['Sport',142],['Trad',18],['Top rope',22],['Boulder',2]].map(([k,v])=>`<div class="fig rule"><span class="lbl f" style="margin:0 0 6px">${k}</span><b>${v}</b></div>`).join('')}</div>
 <p class="small" style="margin-top:12px">Some routes have more than one type.</p></div>
 <div class="sec"><div class="sh"><h2>Now</h2><span class="lbl">the crag's reading</span></div><div style="display:flex;align-items:center;gap:12px"><b class="g" style="font:600 34px/1 var(--font)">100</b><span class="lbl">Dryness: Dry</span><button class="lnk" style="margin-left:auto" data-tab="ov">Overview ›</button></div></div>
 <div class="sec"><div class="sh"><h2>Walls today</h2><span class="lbl">score by hour</span></div>
 <div class="wg"><span></span>${hrs.map(h=>`<span class="hd ${h===11?'now':''}">${hd[h]||''}</span>`).join('')}
 ${ws.map(w=>`<button class="nm" data-wall="${esc(w.n)}" style="text-align:left">${w.n}${w.t?'<small>Under trees</small>':''}</button>${hrs.map(h=>{const e=w.h.find(z=>z[0]===`11-25T${String(h).padStart(2,'0')}`);return `<span class="c ${e&&e[2]?'sun':''}" style="background:${col(e?e[1]:null)}">${e?e[1]:'—'}</span>`}).join('')}`).join('')}</div>
 <p class="small" style="margin-top:12px;display:flex;align-items:center;gap:8px"><i style="width:14px;height:14px;border-radius:4px;box-shadow:inset 0 0 0 2px #fff;background:#b8f542;display:inline-block"></i>Sun on the wall. Tap a wall to pin it on the Overview.</p></div>
 <div class="sec"><div class="sh"><h2>Grades</h2><span class="lbl">163 routes</span></div><div class="grades">${GR.map(([g,n,c])=>`<div>${n}<i style="height:${Math.max(3,n/42*100)}px;background:${c}"></i><span>${g}</span></div>`).join('')}</div></div>
 <div class="sec"><div class="sh"><h2>Walls</h2><span class="lbl">A–Z</span></div><p class="small">Conditions are for the whole crag, not each wall.</p>
 <div class="rows" style="margin-top:8px">${WALLS.map(([n,c,r,mix])=>`<button class="lrow" data-wall="${esc(n)}"><span class="tx"><b>${n}</b><span class="small">${c} routes · ${r}</span><span class="gm">${mix.map((m,i)=>m?`<i style="flex:${m};background:${GR[i][2]}"></i>`:'').join('')}</span></span><span class="chev">›</span></button>`).join('')}</div>
 <div class="key">${GR.map(([g,,c],i)=>`<span><i style="background:${c};width:8px;height:8px;border-radius:50%"></i>${i===0?'5.9 & under':g}</span>`).join('')}</div></div>
 <div style="margin-top:10px">${foot(false)}</div></div>`};
const ROUTES=[['5.13b','Orange Marmalade','Sport'],['5.11b','Skooter Trash','Sport'],['5.12b','Longing for Miss Adonis','Sport'],['5.11','Relentless','Trad · TR'],['5.13a','Gravity Heroes','Sport'],['5.13+','Meet the Feebles','Sport'],['5.13b','NSP','Sport'],['5.14-','OSS','Sport'],['5.13c',"Paul's Boutique",'Sport'],['5.13b','PTC (Present Time Consciousness)','Sport'],['5.12b','Soft Touch','Sport'],['5.12b','Right Touch','Sport'],['5.10d','New Kids on the Rock','Sport'],['5.10a','Jump Start','Sport'],['5.11b','Jump to Something Good','Sport']];
const gcol=g=>g.startsWith('5.13')||g.startsWith('5.14')?'#fc8181':g.startsWith('5.12')?'#f6ad55':g.startsWith('5.11')?'#b8f542':g.startsWith('5.10')?'#7ee0c3':'#8ec5ff';
T.wall=()=>`<div class="in" style="padding-top:0"><div class="sec first"><button class="lnk" data-sub="">‹ He Mni Can - Barn Bluff (Red Wing) guidebook</button><h1 style="margin-top:6px">Winter Wall</h1>
 <div style="display:flex;align-items:center;gap:10px;margin-top:10px"><span class="lbl f">Now</span><b class="g" style="font:600 30px/1 var(--font)">100</b><span class="lbl">Dryness: Dry</span><button class="lnk" style="margin-left:auto" data-tab="ov" data-sub="">Overview ›</button></div></div>
 <div class="sec"><div class="sh"><h2>This week</h2><span class="lbl">the crag's reading, not this wall's</span></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">${DAYS.map(d=>`<div><span class="small">${d[0]}</span><b class="g" style="display:block;font:600 19px/1 var(--font);margin:5px 0 3px">100</b><span class="small" style="display:block;color:var(--t2);font-size:11px">${d[5].replace('All day','All day')}</span><span class="small" style="font-size:11px">Dry</span></div>`).join('')}</div></div>
 <div class="sec"><div class="sh"><h2>Location</h2><span class="lbl">recorded at the wall</span></div><p class="lbl">Not recorded</p><button class="pill ghost sm" style="margin-top:10px">Record here</button></div>
 <div class="sec"><div class="sh"><h2>Grades</h2><span class="lbl">42 routes</span></div><div class="grades" style="grid-template-columns:repeat(5,1fr)">${[['5.9−',2],['5.10',5],['5.11',8],['5.12',15],['5.13+',12]].map(([g,n],i)=>`<div>${n}<i style="height:${Math.max(4,n/15*100)}px;background:${GR[i][2]}"></i><span>${g}</span></div>`).join('')}</div></div>
 <div class="sec"><h2 style="margin-bottom:12px">Routes</h2><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div class="seg">${['All','Sport','Trad','TR'].map((c,i)=>`<button aria-pressed="${!i}">${c}</button>`).join('')}</div><div class="seg"><button aria-pressed="true">Left → right</button><button aria-pressed="false">Grade ↑</button></div></div>
 <div class="rows" style="margin-top:10px">${ROUTES.map(([g,n,t])=>`<button class="rt" data-route="${esc(n)}"><span class="gr" style="color:${gcol(g)}">${g}</span><span><b>${n}</b><span class="small">${t}</span></span><span class="chev">›</span></button>`).join('')}</div>
 <div style="text-align:center"><button class="lnk u">Show all 42 routes</button></div></div>${srcs(false)}</div>`;
T.route=()=>`<div class="in" style="padding-top:0"><div class="sec first"><button class="lnk" data-sub="wall">‹ Winter Wall</button><p class="lbl f" style="margin-top:6px">Sport</p><h1 style="margin-top:4px">Orange Marmalade</h1>
 <div style="display:flex;align-items:baseline;gap:12px;margin-top:10px"><b style="font:600 44px/1 var(--font);color:#fc8181;letter-spacing:-.03em">5.13b</b><span class="lbl">French 8a</span></div><p class="small" style="margin-top:8px">Route 1 of 42, left to right</p></div>
 <div class="sec"><h2>Route</h2><div class="two" style="margin-top:14px;row-gap:14px"><div class="fig"><span class="lbl f">Type</span><b style="font-size:19px">Sport</b></div><div class="fig"><span class="lbl f">First ascent</span><b style="font-size:19px">Josh Helke, 1998</b></div><div class="fig"><span class="lbl f">Protection</span><b style="font-size:19px">Not rated</b></div></div></div>
 <div class="sec"><h2>Logbook</h2><div style="display:grid;gap:10px;margin-top:14px"><button class="pill ghost wide">+ Add to to-do list</button><button class="pill wide">Tick it</button></div></div>
 <div class="sec"><div class="sh"><h2>On the wall</h2><span class="lbl">Left → right</span></div><div class="rows">${ROUTES.slice(0,5).map(([g,n],i)=>`<div class="bd"><span class="body" style="color:#fff">${i+1}. ${n}${i?'':' <span class="small">· this route</span>'}</span><b style="color:${gcol(g)}">${g}</b></div>`).join('')}</div></div>
 <div class="sec"><h2>Beta</h2><p class="body" style="margin-top:10px">Nothing recorded on OpenBeta yet.</p><div class="chips" style="margin-top:12px"><span class="chip">Mountain Project ↗</span><span class="chip">Add beta on OpenBeta ↗</span></div></div>${srcs(false)}</div>`;

/* ---------- task screens ---------- */
S.edit=()=>`<div class="in">${tbar('Back')}<div class="ttl"><h1>Edit crag</h1></div><div class="sec first" style="margin-top:8px"><h2>Rock type</h2><p class="small" style="margin-top:4px">Affects drying time and the score.</p>
 <p style="font:600 18px/1.3 var(--font);margin-top:14px">Dolomite or limestone (with chert)</p><p class="small" style="margin-top:4px">Set for this crag. Can’t be changed.</p></div></div>`;
let addState='main';
const RES=[['Red Rock Canyon Open Space','Climbing area · 92 climbs · Colorado Springs · Colorado, United States · OpenBeta'],['Red Rocks','Climbing area · 20 climbs · Naturita and Paradox Valley · Colorado, United States · OpenBeta'],['Red Rocks (Boulder)','Climbing area · 13 climbs · Mount Sanitas · Colorado, United States · OpenBeta'],['Red Rock Buttress','Climbing area · 7 climbs · South Quarry Area · Minnesota, United States · OpenBeta'],['Redcap Rock','Climbing area · 4 climbs · Crack Hole Area · Colorado, United States · OpenBeta'],['Red Rock','Town · Oklahoma, United States'],['Red Rock','Town · Arizona, United States'],['Red Rock','Town · Texas, United States'],['Red Rock','Mountain · California, United States'],['Red Rock','Mountain · Utah, United States'],['Red Rock','Mountain · Arizona, United States'],['Red Rock','Mountain · Nevada, United States']];
const ROCKS=['Granite','Granite (weathered, crumbly)','Anorthosite','Syenite (porous, Hueco-type)','Basalt, not sure which','Basalt (dense)','Basalt (flow top)','Rhyolite','Tuff (welded)','Tuff (non-welded)','Volcanic breccia','Quartzite','Slate','Gneiss or schist','Sandstone, not sure which','Sandstone (hard quartz)','Sandstone (iron-cemented)','Sandstone (gritstone, arkose)','Sandstone (desert)','Sandstone (soft)','Limestone, not sure which','Limestone (dense)','Limestone (soft, porous)','Dolomite','Dolomite or limestone (with chert)','Conglomerate','Not sure'];
const MN=[['Duluth Area (Rock and Ice)','433 climbs · 2 areas'],['Blue Mounds State Park (Luverne)','337 climbs · 7 areas'],['Interstate SP (Taylors Falls)','166 climbs · 12 areas'],['He Mni Can - Barn Bluff (Red Wing)','157 climbs · 7 areas'],["Jeff's World (MN/CA border)",'134 climbs · 13 areas'],['Tettegouche SP (North Shore)','102 climbs · 2 areas'],['Sawmill Creek Dome','72 climbs · 3 areas'],["Swede's Forest Boulders",'56 climbs · 6 areas'],['Winona, Sugar Loaf','37 climbs'],['Temperance River SP (North Shore)','33 climbs · 2 areas'],['Banning State Park - Bouldering','29 climbs · 1 area'],['Louisville Swamp Boulder (S/W Twin Cities Metro, near Shakopee)','28 climbs'],['Mankato Area Bouldering (Mankato)','24 climbs · 3 areas'],['Lake County Road 6 Area (North Shore)','24 climbs · 2 areas'],['Gunflint Trail','16 climbs'],['Canidae Cliff (Hammond)','16 climbs'],['Quarry Park (St. Cloud)','15 climbs'],['Memorial Park (Red Wing)','6 climbs']];
const BM=[['Bouldering @ Blue Mounds','127 climbs · 13 areas'],['Prairie Walls Area','68 climbs · 11 areas'],['North Quarry Area','55 climbs · 11 areas'],['South Quarry Area','47 climbs · 7 areas'],['Mini Fortress Area','29 climbs · 4 areas'],['Receding Ramparts Area','10 climbs · 6 areas'],['Mound Creek Trail Outcrop','1 climb']];
const locBtn=`<button class="lrow" style="font:600 16px/1 var(--font)"><span class="sky"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#fff" stroke-width="1.7"><circle cx="11" cy="11" r="6"/><circle cx="11" cy="11" r="2" fill="#fff"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3" stroke-linecap="round"/></svg></span>Use my current location</button>`;
S.add=()=>{const a=addState;let b='';
 if(a==='main'||a==='search')b=`<div class="pad">${locBtn}<input class="inp" id="addQ" placeholder="Search for a place" value="${a==='search'?'red rock':''}" style="margin-top:6px" aria-label="Search for a place">
  ${a==='search'?`<div class="rows" style="margin-top:6px">${RES.map(([n,s],i)=>`<button class="lrow" data-addres="${i}"><span class="tx"><b>${n}</b><span class="small">${s}</span></span><span class="chev">›</span></button>`).join('')}</div>`:''}
  <button class="lnk u" style="margin-top:8px" data-adds="coords">Enter coordinates instead</button>
  ${a==='main'?`<h2 style="margin-top:22px">Browse climbing areas</h2><div class="rows" style="margin-top:6px">${[['Minnesota','1,850 climbs · 32 areas'],['Colorado','30,056 climbs · 70 areas'],['Utah','1,502 climbs · 1 area']].map(([n,s])=>`<button class="lrow" data-adds="browse"><span class="tx"><b>${n}</b><span class="small">${s}</span></span><span class="chev">›</span></button>`).join('')}</div>`:''}</div>`;
 else if(a==='save')b=`<div class="card" style="margin-top:6px"><label class="fld" style="margin-top:0"><span>Name</span><input class="inp" value="Red Rock Canyon Open Space"></label><div style="margin-top:14px"><span class="chip" aria-pressed="true">✓ Climbing area</span></div>
  <label class="fld"><span>Rock type</span><select class="inp">${ROCKS.map(r=>`<option ${r==='Not sure'?'selected':''}>${r}</option>`).join('')}</select></label><button class="pill wide" style="margin-top:18px" data-go="list" data-reset data-toast="Saved Red Rock Canyon Open Space">Save</button></div>`;
 else if(a==='coords')b=`<div class="pad">${locBtn}<label class="fld"><span>Name</span><input class="inp"></label><label class="fld"><span>Latitude</span><input class="inp" inputmode="decimal"></label><label class="fld"><span>Longitude</span><input class="inp" inputmode="decimal"></label>
  <button class="pill wide" style="margin-top:18px" data-coordnext>Next</button><p class="err" id="coordErr"></p><button class="lnk u" data-adds="main">Search by name instead</button></div>`;
 else if(a==='browse')b=`<div class="pad"><p class="lbl" style="color:#fff;font-weight:600">Minnesota</p><div class="rows" style="margin-top:6px">${MN.map(([n,s])=>`<button class="lrow" data-adds="browse2"><span class="tx"><b>${n}</b><span class="small">${s}</span></span><span class="chev">›</span></button>`).join('')}</div></div>`;
 else if(a==='browse2')b=`<div class="pad"><p class="lbl"><button class="lnk" style="min-height:32px" data-adds="browse">Minnesota</button> › <b style="color:#fff">Blue Mounds State Park (Luverne)</b></p><button class="pill wide" style="margin-top:12px" data-adds="save">Add Blue Mounds State Park (Luverne)</button>
  <div class="rows" style="margin-top:8px">${BM.map(([n,s])=>`<button class="lrow"><span class="tx"><b>${n}</b><span class="small">${s}</span></span><span class="chev">›</span></button>`).join('')}</div></div>`;
 const title=a==='save'?`<h1>Red Rock Canyon Open Space</h1><p class="small">Climbing area · 92 climbs · Colorado Springs · Colorado, United States · OpenBeta</p>`:'<h1>Add a location</h1>';
 return `<div class="in">${tbar('Back')}<div class="ttl" style="margin-bottom:10px">${title}</div>${b}</div>`};

let fbKind='app';
S.feedback=()=>{const check=fbKind==='check';const pick=(a,sel)=>`<div class="chips" data-single>${a.map(x=>`<button class="chip" aria-pressed="${x===sel}">${x}</button>`).join('')}</div>`;
 return `<div class="in">${tbar('Back',null,false)}<div class="ttl"><h1>Feedback</h1></div>
 <div class="pad" style="margin-top:14px"><div class="seg"><button aria-pressed="${!check}" data-fk="app">App feedback</button><button aria-pressed="${check}" data-fk="check">Forecast check</button></div></div>
 ${check?`<div class="pad"><div class="two"><label class="fld"><span>Crag</span><select class="inp">${LOCS.filter(l=>l.crag).map(l=>`<option ${l.id==='rw'?'selected':''}>${l.name}</option>`).join('')}</select></label><label class="fld"><span>Day</span><input class="inp" type="date" value="2026-11-25"></label></div></div>
 <div class="sec" style="margin-top:18px"><h2>Where you climbed</h2><div class="card" style="margin:12px 0 0;padding:16px"><div class="sh" style="margin:0"><h3>Wall 1</h3><span>⌄</span></div>
  <label class="fld"><span>Area</span><select class="inp"><option>Pick an area</option>${WALLS.map(w=>`<option>${w[0]}</option>`).join('')}<option>Somewhere else</option></select></label>
  <label class="fld"><span>Wall</span><input class="inp" placeholder="e.g. the left side"></label><label class="fld"><span>Routes</span><input class="inp" placeholder="e.g. Pine Tree, Cyclops"></label>
  <div class="two"><label class="fld"><span>From</span><input class="inp" type="time" value="16:42"></label><label class="fld"><span>Until</span><input class="inp" type="time"></label></div>
  <p class="lbl" style="margin:16px 0 8px;color:#fff;font-weight:600">The rock was</p>${pick(['Dry','Damp','Wet','Mixed'])}
  <p class="lbl" style="margin:14px 0 8px">Sun on the rock</p>${pick(['All sun','Mostly sun','Sun and shade','Mostly shade','All shade'])}
  <p class="lbl" style="margin:14px 0 8px">Wall faces</p>${pick(['N','NE','E','SE','S','SW','W','NW'])}
  <p class="lbl" style="margin:14px 0 8px">Wall angle</p>${pick(['Slab','Vertical','Overhang','Roof'])}</div>
  <button class="lnk u" style="margin-top:6px">Add another wall</button></div>
 <div class="sec"><span class="lbl f">The app said</span><p style="font:600 15px/1.3 var(--font);margin-top:4px">Dryness: Dry · Score: 100 · at 10 am</p>
  <p class="lbl" style="margin:16px 0 8px;color:#fff;font-weight:600">Did the app match?</p>${pick(['Matched','Partly','Missed'])}
  <details style="margin-top:14px"><summary class="lnk" style="list-style:none">Add a note ⌄</summary><textarea class="inp" placeholder="Say what the rock was like." style="margin-top:8px"></textarea></details>
  <button class="pill wide" style="margin-top:16px" data-back data-toast="Check saved">Save check</button></div>`
 :`<div class="pad"><label class="fld" style="margin-top:18px"><span class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden">Feedback</span><textarea class="inp" placeholder="What’s working, what isn’t"></textarea></label><button class="pill wide" style="margin-top:14px" data-toast="Sent, thanks">Send feedback</button></div>`}
 <div class="sec" style="margin-top:20px"><div class="sh"><h2>Open feedback</h2><span class="lbl">2 open</span></div><div class="rows">
  <div class="fb"><span class="small">Forecast check · Red Wing · Nov 22, 4:28 PM</span><p>Rock: Dry · Forecast: Matched</p><span class="small">No app reading attached</span><div><button class="pill ghost sm" style="margin-top:10px" data-done>Done</button></div></div>
  <div class="fb"><span class="small">App feedback · Nov 25, 4:28 PM</span><p>Trip list should show which trip looks best without opening each one.</p><div><button class="pill ghost sm" style="margin-top:10px" data-done>Done</button></div></div></div></div></div>`};

/* ---------- map ---------- */
S.map=()=>`<div class="map" id="map"><svg class="terrain" id="terrain" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true"></svg><canvas id="radar" width="390" height="844"></canvas><div id="pins"></div></div>
 <div class="mtag glass">Map <span>5 saved</span></div>
 <button class="lay glass" id="lay" aria-haspopup="menu" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="m10 3 7.5 4L10 11 2.5 7z"/><path d="m2.5 10.5 7.5 4 7.5-4M2.5 14l7.5 4 7.5-4" stroke-opacity=".6"/></svg><span id="layN">Radar</span><span style="font-size:11px">▾</span></button>
 <div class="laym glass" id="laym" role="menu" aria-label="Map layer"></div>
 <button class="locb glass" id="locb" aria-label="Show my location"><svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="#fff" stroke-width="1.7"><circle cx="11" cy="11" r="6"/><circle cx="11" cy="11" r="2" fill="#fff"/><path d="M11 1.5v3M11 17.5v3M1.5 11h3M17.5 11h3" stroke-linecap="round"/></svg></button>
 <div class="rctl glass" id="rctl"><button class="play" id="play" aria-label="Play radar loop"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg></button><input type="range" id="rt" min="0" max="11" value="11" aria-label="Radar time"><span class="tt" id="rtt">Radar 4:30 PM</span></div>
 <div class="leg glass" id="leg"><span id="legA">Faint</span><span class="strip2" id="legS"></span><span id="legB">Heavy</span></div>
 <p class="attr">Radar: Iowa Environmental Mesonet | Terrain: Mapzen / AWS Open Data | OpenFreeMap © OpenMapTiles © OpenStreetMap contributors</p>`;

/* ---------- trips ---------- */
let pastOpen=false;
S.trips=()=>`<div class="in"><div class="pad" style="display:flex;justify-content:space-between;align-items:flex-start;padding-top:14px"><div><h1 style="font-size:34px">Trips</h1><p class="lbl f" style="margin-top:6px">Soonest first</p></div><button class="pill sm" data-go="newtrip" style="margin-top:4px">+ New trip</button></div>
 <div class="rows" style="margin:14px 20px 0">
 <button class="trow" data-go="trip2"><span style="flex:1"><b>Sandstone and Taylors Falls</b><span class="small" style="display:block">Fri 27 – Sat 28 Nov · in 2 days · 2 crags</span></span><span class="chev">›</span></button>
 <button class="trow" data-go="trip1"><span style="flex:1"><b>Red Wing after Thanksgiving</b><span class="small" style="display:block">Sun 29 Nov – Wed 2 Dec · in 4 days · 1 crag</span></span><span class="chev">›</span></button>
 <button class="trow" data-go="trip3"><span style="flex:1"><b>Devil's Lake, winter break</b><span class="small" style="display:block">Sat 12 – Mon 14 Dec · in 17 days · 1 crag</span><span class="small fa" style="display:block;color:var(--fair)">Forecast opens 27 Nov</span></span><span class="chev">›</span></button>
 <button class="trow" data-past aria-expanded="${pastOpen}"><span style="flex:1;font:500 15px/1 var(--font);color:var(--t2)">Past trips (1)</span><span class="small">Latest first ${pastOpen?'⌃':'⌄'}</span></button>
 ${pastOpen?`<button class="trow" data-go="past"><span style="flex:1"><b>Barn Bluff Sunday</b><span class="small" style="display:block">Sun 15 Nov · ended · 1 crag</span></span><span class="chev">›</span></button>`:''}</div></div>`;
S.newtrip=()=>`<div class="in">${tbar('Trips')}<div class="ttl"><h1>New trip</h1></div><div class="pad">
 <label class="fld" style="margin-top:18px"><span>Name</span><input class="inp" placeholder="Red Wing weekend"></label>
 <div class="two"><label class="fld"><span>First day</span><input class="inp" type="date" value="2026-11-25"></label><label class="fld"><span>Last day</span><input class="inp" type="date" value="2026-11-25"></label></div>
 <p class="lbl" style="margin:16px 0 4px">Crags</p><div class="rows">${['Sandstone','Taylors Falls',"Devil's Lake",'Red Wing'].map(n=>`<label class="lrow" style="cursor:pointer;min-height:48px"><input type="checkbox" style="width:22px;height:22px;accent-color:#fff"><span style="font:500 16px/1 var(--font)">${n}</span></label>`).join('')}</div>
 <button class="pill ghost wide" style="margin-top:8px;border:1px dashed rgba(255,255,255,.25);box-shadow:none" data-go="add">+ Add a crag</button>
 <p class="lbl" style="margin:18px 0 8px">Climbing hours</p><div class="seg"><button aria-pressed="true">Same as Profile</button><button aria-pressed="false">Own hours</button></div><p class="small" style="margin-top:8px">Your Profile hours, 8 am – 6 pm.</p>
 <button class="pill wide" style="margin-top:20px" data-go="trip1" data-replace>Create trip</button></div></div>`;
const tripFoot=(weather=true,past=false)=>`<div class="sec"><h2>Trip</h2><p class="small" style="margin-top:10px">Weather on every day is the trip outlook’s; scores and words are each crag’s hourly readings.</p><p class="small" style="margin-top:6px">Agreement is the share of forecast runs that agree on rain or no rain that day.</p>${weather?'<p class="small" style="margin-top:6px">Weather: Open-Meteo · GFS, ECMWF, ICON, GEM.</p>':''}</div>
 <div class="foot" style="justify-content:space-between">${past?'<button class="lnk" data-go="newtrip">Plan again</button>':''}<button class="lnk" data-go="newtrip">Edit trip</button><button class="lnk danger" data-deltrip>Delete trip</button></div>`;
const tripTiles=t=>`<div class="tiles">${t.map(([d,s,w,l],i)=>`<button class="tile ${s==null?'dash':''}" aria-pressed="${i===0}"><span class="d">${d}</span><div class="v ${cls(s)}">${s??'—'}</div><span class="small" style="display:block">${w}</span><span class="small" style="display:block;margin-top:4px">${l}</span></button>`).join('')}</div>`;
const dayCard=(d,g,hl,ch,am,ag)=>`<div class="sec"><span class="lbl f">${d}</span><p style="font:600 24px/1.2 var(--font);margin-top:6px" class="g">Good hours ${g} · 100</p><p class="lbl" style="margin-top:4px">Dryness: Dry</p>
 <div class="figs" style="margin-top:16px"><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">High · low</span><b>${hl}</b></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Chance</span><b class="rn">${ch}</b></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Amount</span><b>${am}</b></div></div>
 <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><span class="agree">Agreement ${ag}</span><button class="lnk" data-gocrag="hourly">Hourly ›</button></div></div>`;
const rainTrip=(n,tot,rng,days)=>{const mx=Math.max(...days.map(d=>d[2]),.01);return `<div class="sec"><div class="sh"><h2>Rain over the trip</h2><span class="lbl">All ${n} days</span></div><div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><b class="bigfig">${tot}</b><span class="lbl">likely</span><span class="lbl" style="margin-left:6px">Range ${rng}</span></div>
 <div style="display:grid;grid-template-columns:repeat(${days.length},1fr);gap:10px;margin-top:20px;align-items:end;height:90px">${days.map(([d,t,v])=>`<div style="text-align:center"><i style="display:block;height:${Math.max(4,v/mx*44)}px;border-radius:6px;background:var(--rain);margin:0 8px 8px"></i><span class="small" style="display:block;color:var(--t2)">${d}</span><span class="small rn" style="display:block">${t}</span></div>`).join('')}</div>
 <p class="small" style="margin-top:12px">Amounts add up; a range never does.</p></div>`};
let trendMode='day';
function trendChart(){const td=D.trend[0];
 if(trendMode==='whole'){return `<p class="small" style="margin-bottom:10px">What each forecast update said about the whole trip. Newest on the right.</p>
  <svg viewBox="-30 0 380 150" style="display:block;width:100%;height:auto">${[[0,'0.0'],[.5,'0.5'],[1,'1.0 in']].map(([v,t])=>`<text x="-4" y="${110-v*90+4}" text-anchor="end" font-size="11" fill="#9c9da3">${t}</text><line x1="0" x2="320" y1="${110-v*90}" y2="${110-v*90}" stroke="rgba(255,255,255,.06)"/>`).join('')}
  ${td.points.map((p,i)=>{const X=80+i*160,mm=p.mean_mm/25.4,lo=p.p10_mm/25.4,hi=Math.min(1,p.p90_mm/25.4);return `<rect x="${X-14}" y="${110-hi*90}" width="28" height="${(hi-lo)*90}" rx="6" fill="rgba(165,180,252,.22)"/><rect x="${X-8}" y="${110-mm*90-3}" width="16" height="6" rx="3" fill="#a5b4fc"/><circle cx="${X+26}" cy="${110-(p.high_c_max*9/5+32-38)/2*90}" r="5" fill="${i?'#f6ad55':'none'}" stroke="#f6ad55" stroke-width="1.6"/><text x="${X}" y="132" text-anchor="middle" font-size="12" fill="#c2c3c8">${i?'25 Nov':'19 Nov'}</text>`}).join('')}
  ${[[38,'38°'],[39,'39°'],[40,'40°F']].map(([v,t])=>`<text x="350" y="${110-(v-38)/2*90+4}" text-anchor="end" font-size="11" fill="#f6ad55">${t}</text>`).join('')}<text x="160" y="148" text-anchor="middle" font-size="11" fill="#9c9da3">Forecast made on →</text></svg>
  <div class="key"><span><i style="background:#a5b4fc"></i>Rain, trip total · Range</span><span><i style="background:#f6ad55;width:8px;height:8px;border-radius:50%"></i>High, warmest day</span></div>
  <div class="figs" style="margin-top:14px"><div class="fig"><b style="font-size:17px">Rain: up 0.14 in</b></div><div class="fig"><b style="font-size:17px">High: no change</b></div></div>`}
 const ds=td.days,mm=v=>v/25.4,y=v=>110-mm(v)/.2*100,ty=c=>110-((c*9/5+32)-30)/15*100;
 return `<p class="small" style="margin-bottom:10px">Each trip day: the first forecast (19 Nov) against the latest (25 Nov).</p>
 <svg viewBox="-30 0 384 160" style="display:block;width:100%;height:auto">${[[0,'0.00'],[2.54,'0.10'],[5.08,'0.20 in']].map(([v,t])=>`<text x="-4" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#9c9da3">${t}</text><line x1="0" x2="320" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/>`).join('')}
 ${[30,35,40,45].map(v=>`<text x="352" y="${110-(v-30)/15*100+4}" text-anchor="end" font-size="11" fill="#f6ad55">${v}°${v===45?'F':''}</text>`).join('')}
 ${ds.map((d,i)=>{const X=40+i*80,f=d.first,l=d.last;const dr=(mm(l.precip_mm_mean)-mm(f.precip_mm_mean)),dt=Math.round((l.temp_c_max-f.temp_c_max)*9/5);const sg=v=>v>0?'+':v<0?'−':'';
  return `<rect x="${X-14}" y="${y(f.precip_mm_mean)}" width="11" height="${Math.max(1,110-y(f.precip_mm_mean))}" rx="3" fill="none" stroke="#c2c3c8" stroke-dasharray="3 2"/><rect x="${X+1}" y="${y(l.precip_mm_mean)}" width="11" height="${Math.max(1,110-y(l.precip_mm_mean))}" rx="3" fill="#a5b4fc"/>
  <line x1="${X+24}" x2="${X+24}" y1="${ty(f.temp_c_max)}" y2="${ty(l.temp_c_max)}" stroke="#f6ad55" stroke-width="1.4"/><circle cx="${X+24}" cy="${ty(f.temp_c_max)}" r="3.5" fill="#1b1c20" stroke="#f6ad55" stroke-width="1.5"/><circle cx="${X+24}" cy="${ty(l.temp_c_max)}" r="3.5" fill="#f6ad55"/>
  <text x="${X}" y="128" text-anchor="middle" font-size="12" fill="#fff">${['Sun 29','Mon 30','Tue 1','Wed 2'][i]}</text><text x="${X}" y="145" text-anchor="middle" font-size="11" fill="#c2c3c8">${sg(dr)}${Math.abs(dr).toFixed(2)} in · ${sg(dt)}${Math.abs(dt)}°</text>`}).join('')}</svg>
 <div class="key"><span><i style="border:1px dashed #c2c3c8;width:10px;height:10px;background:none"></i>Rain, 19 Nov</span><span><i style="background:#a5b4fc;width:10px;height:10px"></i>Rain, 25 Nov</span><span><i style="border:1.5px solid #f6ad55;width:8px;height:8px;border-radius:50%;background:none"></i>High, 19 Nov → <i style="background:#f6ad55;width:8px;height:8px;border-radius:50%"></i>25 Nov</span></div>`}
S.trip1=()=>`<div class="in">${tbar('Trips')}<div class="ttl"><h1>Red Wing after Thanksgiving</h1><p class="small" style="color:var(--t2)">Sun 29 Nov – Wed 2 Dec · in 4 days · Red Wing · Dolomite or limestone (with chert)</p></div>
 <div class="sec" style="margin-top:14px">${tripTiles([['Sun 29',100,'Dry','37° · 47% · 0.04 in'],['Mon 30',100,'Dry','37° · 20% · 0.01 in'],['Tue 1',100,'Dry','40° · 40% · 0.03 in'],['Wed 2',null,'Scored from 26 Nov','45° · 44% · 0.02 in']])}</div>
 ${dayCard('Sun 29 Nov','All day','37° · 30°','47%','0.04 in','53%')}
 ${rainTrip(4,'0.08 in','0.00–0.24 in',[['Sun 29','0.04 in',.04],['Mon 30','0.01 in',.01],['Tue 1','0.03 in',.03],['Wed 2','0.02 in',.02]])}
 <div class="sec"><div class="sh"><h2>How the forecast has moved</h2><span class="lbl">2 recordings since 19 Nov</span></div><div class="seg" style="margin-bottom:14px"><button aria-pressed="${trendMode==='day'}" data-tm="day">By day</button><button aria-pressed="${trendMode==='whole'}" data-tm="whole">Whole trip</button></div><div id="trendBox">${trendChart()}</div></div>
 ${tripFoot()}</div>`;
S.trip2=()=>`<div class="in">${tbar('Trips')}<div class="ttl"><h1>Sandstone and Taylors Falls</h1><p class="small" style="color:var(--t2)">Fri 27 – Sat 28 Nov · in 2 days · 2 crags</p></div>
 <div class="sec" style="margin-top:14px"><div class="sh"><h2>By day</h2><span class="lbl">Tap a crag</span></div>
 <div class="tgrid"><span></span><span class="lbl" style="text-align:center;color:#fff;font-weight:600">Fri 27</span><span class="lbl" style="text-align:center;color:#fff;font-weight:600">Sat 28</span>
 <button class="lnk" data-go="trip2crag">Sandstone ›</button><div class="c"><b class="g">100</b><span>Dry</span><span>0.01 in</span></div><div class="c"><b class="g">100</b><span>Dry</span><span>trace</span></div>
 <button class="lnk" data-go="trip2crag">Taylors Falls ›</button><div class="c"><b class="g">100</b><span>Dry</span><span>trace</span></div><div class="c"><b class="g">100</b><span>Dry</span><span>0.02 in</span></div></div></div>
 <div class="sec"><div class="sh"><h2>Rain over the trip</h2><span class="lbl">likely · range</span></div><div class="rows">${[['Sandstone','0.02 in','0.00–0.04 in'],['Taylors Falls','0.03 in','0.00–0.07 in']].map(([n,v,r])=>`<div class="bd"><div><b style="font-weight:500">${n}</b><span class="small">${r}</span></div><b style="font:600 22px/1 var(--font)">${v}</b></div>`).join('')}</div></div>
 ${tripFoot()}</div>`;
S.trip2crag=()=>`<div class="in">${tbar('Sandstone and Taylors Falls')}<div class="ttl"><h1>Sandstone</h1><p class="small" style="color:var(--t2)">Fri 27 – Sat 28 Nov · in 2 days · Sandstone (hard quartz)</p></div>
 <div class="sec" style="margin-top:14px">${tripTiles([['Fri 27',100,'Dry','38° · 48% · 0.01 in'],['Sat 28',100,'Dry','41° · 33% · trace']]).replace('repeat(3','repeat(2')}</div>
 ${dayCard('Fri 27 Nov','12am–9pm','38° · 20°','48%','0.01 in','52%')}
 ${rainTrip(2,'0.02 in','0.00–0.04 in',[['Fri 27','0.01 in',.01],['Sat 28','trace',.004]])}
 <div class="sec"><h2>How the forecast has moved</h2><p class="small" style="margin-top:10px">Trend starts after the next forecast update.</p></div>${tripFoot()}</div>`;
S.trip3=()=>`<div class="in">${tbar('Trips')}<div class="ttl"><h1>Devil's Lake, winter break</h1><p class="small" style="color:var(--t2)">Sat 12 – Mon 14 Dec · in 17 days · Devil's Lake · Quartzite</p></div>
 <div class="sec" style="margin-top:14px"><p style="font:600 18px/1.3 var(--font);color:var(--fair)">Forecast opens 27 Nov.</p></div>
 <div class="sec"><h2>How the forecast has moved</h2><p class="small" style="margin-top:10px">Trend starts after the next forecast update.</p></div>${tripFoot(false)}</div>`;
S.past=()=>`<div class="in">${tbar('Trips')}<div class="ttl"><h1>Barn Bluff Sunday</h1><p class="small" style="color:var(--t2)">Sun 15 Nov · ended · Red Wing · Dolomite or limestone (with chert)</p></div>
 <div class="sec" style="margin-top:14px"><h2>How it turned out</h2><p class="lbl f" style="margin-top:12px">Sun 15 Nov</p>
 <div class="figs" style="margin-top:10px;align-items:start"><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Turned out</span><b class="fa">Drying</b><span class="small">score 48 · 0.02 in · high 46° · low 29°</span></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Said first</span><b>Dry · 78</b><span class="small">11 days out</span></div><div class="fig rule"><span class="lbl f" style="margin:0 0 6px">Said last</span><b>Drying · 57</b><span class="small">1 day out</span></div></div>
 <button class="pill ghost sm" style="margin-top:14px" data-go="check">How was it?</button><p class="small" style="margin-top:12px">How a day turned out is the forecast model’s own look back at it once it was over, not a weather station’s record.</p></div>
 <div class="sec"><h2>How the forecast has moved</h2><div class="seg" style="margin:12px 0 14px"><button aria-pressed="true">By day</button><button aria-pressed="false">Whole trip</button></div><p class="small" style="margin-bottom:10px">Each trip day: the first forecast (4 Nov) against the latest (14 Nov).</p>
 <svg viewBox="-30 0 380 150" style="display:block;width:100%;height:auto">${[[0,'0.00'],[.05,'0.05'],[.1,'0.10'],[.15,'0.15 in']].map(([v,t])=>`<text x="-4" y="${110-v/.15*100+4}" text-anchor="end" font-size="11" fill="#9c9da3">${t}</text><line x1="0" x2="320" y1="${110-v/.15*100}" y2="${110-v/.15*100}" stroke="rgba(255,255,255,.06)"/>`).join('')}
 <rect x="146" y="104" width="12" height="6" rx="3" fill="none" stroke="#c2c3c8" stroke-dasharray="3 2"/><rect x="162" y="${110-.05/.15*100}" width="12" height="${.05/.15*100}" rx="3" fill="#a5b4fc"/><text x="160" y="128" text-anchor="middle" font-size="12" fill="#fff">Sun 15</text><text x="160" y="145" text-anchor="middle" font-size="11" fill="#c2c3c8">+0.04 in</text></svg>
 <div class="key"><span><i style="border:1px dashed #c2c3c8;width:10px;height:10px;background:none"></i>Rain, 4 Nov</span><span><i style="background:#a5b4fc;width:10px;height:10px"></i>Rain, 14 Nov</span><span><i style="border:1.5px solid #f6ad55;width:8px;height:8px;border-radius:50%;background:none"></i>High, 4 Nov → <i style="background:#f6ad55;width:8px;height:8px;border-radius:50%"></i>14 Nov</span></div></div>
 ${tripFoot(false,true)}</div>`;

/* ---------- profile ---------- */
let invited=false;
S.profile=()=>{const step=(l,v)=>`<div class="step"><span class="lbl">${l}</span><span class="ctl"><button aria-label="Less">−</button><b>${v}</b><button aria-label="More">+</button></span></div>`;
 const fbs=[['tim · Forecast check · Red Wing · Nov 22, 4:28 PM','Rock: Dry · Forecast: Matched','No app reading attached'],['sam · Forecast check · Red Wing · Nov 16, 4:28 PM','Rock: Damp · Forecast: Partly','No app reading attached'],['sam · App feedback · Nov 25, 4:28 PM','The map pins are hard to tap when two crags are close together.'],['tim · App feedback · Nov 25, 4:28 PM','Trip list should show which trip looks best without opening each one.']];
 const dryR=[['Granite',1,6,'1–6 h'],['Limestone (dense)',4,18,'4–18 h'],['Sandstone (hard quartz)',24,48,'1–2 days'],['Limestone (soft, porous)',24,72,'1–3 days'],['Sandstone (soft)',48,120,'2–5 days']];
 const ex=[[40,'8a'],[55],[70,'10a'],[85],[92,'12p'],[88],[82,'2p'],[95],[90,'4p'],[62],[45,'6p']];
 return `<div class="in"><div class="pad" style="display:flex;justify-content:space-between;align-items:center;padding-top:14px"><h1 style="font-size:34px">Profile</h1><button class="fbk" data-go="feedback">Feedback</button></div>
 <div class="sec first" style="margin-top:10px"><h2>Temperature range</h2><p class="body" style="margin-top:6px">The score drops when it’s colder or warmer than this. Default 30–60°F.</p>${step('Low','30°F')}${step('High','60°F')}</div>
 <div class="sec"><h2>Climbing hours</h2><p class="body" style="margin-top:6px">A day’s score comes from these hours only. Default 8 am – 6 pm.</p>${step('From','8 am')}${step('Until','6 pm')}</div>
 <div class="sec"><h2>Open a crag on</h2><p class="body" style="margin-top:6px">The tab a crag shows first.</p><div class="chips" style="margin-top:12px" data-single>${TABS.map(([k,n],i)=>`<button class="chip" aria-pressed="${!i}">${n}</button>`).join('')}</div>
 <p class="small" style="margin-top:12px">Places that aren’t crags always open on Overview.</p><div style="display:flex;align-items:center;gap:16px;margin-top:14px"><button class="pill" style="flex:1" data-toast="Saved">Save</button><button class="lnk">Reset</button></div></div>
 <div class="sec"><h2>Everyone’s feedback</h2><p class="lbl f" style="margin-top:6px">4 open, newest first.</p><div class="rows" style="margin-top:4px">${fbs.map(([h,p,n])=>`<div class="fb"><span class="small">${h}</span><p>${p}</p>${n?`<span class="small">${n}</span>`:''}<div><button class="pill ghost sm" style="margin-top:10px" data-done>Done</button></div></div>`).join('')}</div></div>
 <div class="sec"><h2>Thermometer</h2><p class="body" style="margin-top:6px">Stored every 30 minutes while it is online. Not used in any score.</p><p class="lbl f" style="margin-top:10px">No readings yet.</p></div>
 <div class="sec"><h2>Invite someone</h2><p class="body" style="margin-top:6px">A link that creates one account. It works once and expires in 2 days. Send it to one person, privately.</p>
 ${invited?`<div class="card" style="margin:14px 0 0;padding:16px"><p style="font:500 13px/1.4 var(--font);word-break:break-all">https://weatherteam6.vercel.app/join#EXAMPLE-invite-token</p><p class="small" style="margin-top:6px">Expires Fri, Nov 27.</p><div style="display:flex;gap:10px;margin-top:12px"><button class="pill sm" data-toast="Copied">Copy link</button><button class="pill ghost sm" data-invite>Create another link</button></div></div>`:`<button class="pill wide" style="margin-top:14px" data-invite>Create invite link</button>`}
 <p class="lbl f" style="margin-top:16px">Your links</p><div class="rows">${(invited?['Expires Fri, Nov 27, 4:42 PM','Expires Fri, Nov 27, 4:28 PM']:['Expires Fri, Nov 27, 4:28 PM']).map(e=>`<div class="bd"><div><b style="font-size:14px">Not used yet</b><span class="small">${e}</span></div><button class="lnk danger">Cancel</button></div>`).join('')}</div></div>
 <div class="sec"><h2>How the score works</h2><p class="body" style="margin-top:6px">The score rates one hour at the crag from 0 to 100. It multiplies two things, so if either one is zero, so is the score.</p>
 <div style="display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap"><span class="chip">Dry rock</span>×<span class="chip">Good grip</span>=<span class="chip" aria-pressed="true">Score</span></div>
 <h3 style="margin-top:18px">Dry rock</h3><p class="body" style="margin-top:6px">Rain starts a drying clock. A light shower needs a short wait and only dents the score; 0.4" or more needs the rock’s full drying time below and drops it to zero. While rain you’d see on the rock is falling (0.02" an hour or more), the score is zero. The clock counts rain due in the next 2 hours, so rock can read wet just before rain arrives; the crag’s overview says when it’s due. Sun, dry air and wind speed drying up. The forecast’s sunshine warms eight imagined walls, one facing each direction, by the hour; the crag takes the middle one, so one sunny face can’t make it read dry. Cold, damp or still weather never holds rock wet past its full drying time. Rock that is weak when wet dries by the clock on the wall, whatever the weather.</p>
 <div class="dry" style="margin-top:16px"><span></span><span style="position:relative;height:14px">${[[0,"0"],[19.5,"1 day"],[39,"2 days"],[78,"5 days"]].map(([l,t])=>`<span style="position:absolute;left:${l}%;transform:translateX(-${l?50:0}%);white-space:nowrap">${t}</span>`).join("")}</span>${dryR.map(([n,a,b,t])=>{const X=h=>(h<=24?h/24*25:h<=48?25+(h-24)/24*25:50+(h-48)/72*50)*.78;return `<span>${n}</span><span class="bar"><i style="left:${X(a)}%;width:${Math.max(2,X(b)-X(a))}%"></i><em style="left:calc(${X(b)}% + 6px)">${t}</em></span>`}).join('')}</div>
 <p class="small" style="margin-top:10px">Hours after a soaking, from climbers’ rules of thumb. Nobody has measured them.</p>
 <h3 style="margin-top:18px">Good grip</h3><p class="body" style="margin-top:6px">Grip is an estimate. It’s full inside your temperature range and fades the further outside it the air gets. Muggy air (a dew point over 54°F) lowers it, and so does rock within about 4°F of its dew point, where moisture settles on it. The rock’s temperature there is modelled for each imagined wall, sun included, so it can take at most 50% off the score.</p>
 <div style="margin-top:16px"><div class="sh" style="margin:0 0 6px"><span class="small">← colder</span><span class="small" style="color:var(--good);font-weight:600">Full grip</span><span class="small">warmer →</span></div>
 <div style="position:relative;height:14px;border-radius:7px;background:linear-gradient(90deg,rgba(184,245,66,.08),#b8f542 30%,#b8f542 60%,rgba(184,245,66,.08))"><i style="position:absolute;left:30%;top:-4px;bottom:-4px;width:2px;background:#fff"></i><i style="position:absolute;left:60%;top:-4px;bottom:-4px;width:2px;background:#fff"></i></div>
 <div style="position:relative;height:18px;margin-top:6px" class="small">${[[0,'0°'],[20,'20°'],[30,'<b style=color:#fff>30°F</b>'],[40,'40°'],[60,'<b style=color:#fff>60°F</b>'],[80,'80°'],[100,'100°']].map(([v,t])=>`<span style="position:absolute;left:${v}%;transform:translateX(-50%)">${t}</span>`).join('')}</div></div>
 <h3 style="margin-top:18px">A day’s score</h3><p class="body" style="margin-top:6px">It’s the lowest hour of the day’s best 3 hours in a row inside your climbing hours, 8am to 6pm unless you change them on Profile. Good hours are the longest run scoring 60 or more. After your last climbing hour, today has no score.</p>
 <div style="position:relative;display:grid;grid-template-columns:repeat(11,1fr);gap:5px;align-items:end;height:150px;margin-top:28px">${ex.map(([v,l],i)=>`<div style="text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:100%;${i>=4&&i<=6?'background:rgba(255,255,255,.07);border-radius:10px 10px 0 0;':''}"><span class="small" style="font-size:11px">${v}</span><i style="display:block;height:${v}px;border-radius:6px;background:${col(v)};margin-top:3px"></i><span class="small" style="height:14px;font-size:11px">${l||''}</span></div>`).join('')}
 <span class="small" style="position:absolute;top:-22px;left:${4/11*100}%;width:${3/11*100}%;text-align:center;color:#fff;font-weight:600">Day score 85</span></div>
 <p class="small" style="margin-top:8px">An example day, not a forecast.</p>
 <h3 style="margin-top:18px">When it’s missing or wrong</h3><p class="body" style="margin-top:6px">A weather warning shows beside the score and never hides it, and a missing forecast hour is a gap, never a guess. Score breakdown on a crag lists what’s lowering its score.</p><p class="body" style="margin-top:8px">The rain is from forecast models, not a gauge, so a local shower can be missed. The score can’t see terrain shade, seepage, wind on one wall, or your skin and rubber, and it hasn’t been checked against real days yet. Use Check this forecast on a crag to report a miss.</p></div>
 <div class="pad" style="display:flex;gap:10px"><button class="pill ghost sm" data-go="welcome">Run setup again</button><button class="pill ghost sm" data-go="login" data-reset>Sign out</button></div></div>`};

/* ================= router ================= */
const TOP=['list','trips','map','profile'];
let stack=['list'];
const app=()=>$('app');
const navBar=(cur)=>`<nav class="nav" role="tablist" aria-label="Sections">${[['list','Conditions',I.cond],['trips','Trips',I.trips],['map','Map',I.map],['profile','Profile',I.prof]].map(([id,n,ic])=>`<button role="tab" aria-selected="${id===cur}" data-top="${id}">${ic}<span>${n}</span></button>`).join('')}</nav>`;
const dock=()=>{const t=isCity()?TABS.slice(0,4):TABS;return `<nav class="nav dock ${isCity()?'four':''}" role="tablist" aria-label="Crag pages">${t.map(([k,n])=>`<button role="tab" aria-selected="${k===tab}" data-tab="${k}">${I[k]}<span>${n}</span></button>`).join('')}</nav>`};
function render(){const id=stack[stack.length-1];const host=app();
 let html=S[id]();let chrome='';
 if(TOP.includes(id))chrome=navBar(id);
 if(id==='crag')chrome=dock();
 if(['trips','trip1','trip2','trip2crag','trip3','past','newtrip'].includes(id)&&id!=='trips'&&id!=='newtrip')chrome=navBar('trips');
 host.innerHTML=`<div class="scr" id="scr">${html}</div>${chrome}<div class="toast" id="toast"></div>`;
 passo(id);after(id);qa('.jump button').forEach(b=>b.style.outline=b.dataset.j===curKey()?'2px solid #fff':'')}
const PIDX={ov:0,daily:1,hourly:2,precip:3,rock:4};
function passo(id){const pf=$('pframe');if(!pf)return;const on=id==='crag'&&!isCity()&&tab!=='crag'&&!cragSub;pf.classList.toggle('off',!on);pf.setAttribute('aria-hidden',!on);
 if(on){const w=pf.contentWindow;if(w&&w.goPage)w.goPage(PIDX[tab]);else pf.dataset.want=PIDX[tab]}}
let lastKey='list';const curKey=()=>lastKey;
function after(id){
 if(id==='crag'){if(tab==='ov')setChip(isCity());}
 if(id==='map')initMap();
}
function go(id,{reset,replace}={}){if(reset)stack=[TOP.includes(id)?id:id];else if(replace)stack[stack.length-1]=id;else stack.push(id);render();const s=$('scr');if(s)s.scrollTop=0}
function back(){if(stack.length>1){stack.pop();render()}else go('list',{reset:true})}
function openCrag(id,t){crag=id;tab=t||'ov';cragSub=null;if(!L(id).crag&&!['ov','daily','hourly','precip'].includes(tab))tab='ov';go('crag')}
function setTab(t){tab=t;cragSub=null;render();$('scr').scrollTop=0}
const toast=m=>{const t=$('toast');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),1600)};

document.addEventListener('click',e=>{const t=e.target.closest('button,[data-go],[data-crag],summary');if(!t||!app().contains(t)&&!t.closest('.notes'))return;
 const d=t.dataset;
 if(d.j){jump(d.j);return}
 if(d.toast)toast(d.toast);
 if(d.top){go(d.top,{reset:true});return}
 if(d.crag){openCrag(d.crag);return}
 if(d.sw){crag=d.sw;if(!L(crag).crag&&!['ov','daily','hourly','precip'].includes(tab))tab='ov';cragSub=null;render();return}
 if(d.tab!==undefined&&!d.go){if(d.sub!==undefined)cragSub=null;setTab(d.tab);return}
 if(d.sub!==undefined){cragSub=d.sub||null;render();return}
 if(d.wall){cragSub='wall';render();return}
 if(d.route){cragSub='route';render();return}
 if(d.gocrag){crag='rw';tab=d.gocrag;cragSub=null;go('crag');return}
 if(d.go){if(d.go==='check'){fbKind='check';go('feedback');return}if(d.go==='feedback')fbKind='app';if(d.go==='add')addState='main';go(d.go,{reset:'reset' in d,replace:'replace' in d});if(d.toast)toast(d.toast);return}
 if('back' in d&&t.matches('[data-back]')){back();if(d.toast)setTimeout(()=>toast(d.toast),30);return}
 if('walls' in d){const o=t.getAttribute('aria-expanded')!=='true';t.setAttribute('aria-expanded',o);$('wpick').hidden=!o;return}
 if('remove' in d){if(t.dataset.armed){go('list',{reset:true});toast('Removed '+cragName());return}t.dataset.armed=1;t.textContent='Tap again to remove';return}
 if('deltrip' in d){if(t.dataset.armed){go('trips',{reset:true});toast('Trip deleted');return}t.dataset.armed=1;t.textContent='Tap again to delete';return}
 if('rearr' in d){$('ovCards')&&($('ovCards').innerHTML=`<div class="sec first"><div class="sh"><h2>Rearrange cards</h2><span class="lbl">saved on this device</span></div><div class="rows">${['Today','Next days','Right now'].map(n=>`<div class="bd"><b>${n}</b><span class="chev">≡</span></div>`).join('')}</div><button class="pill sm" style="margin-top:12px" data-rdone>Done</button></div>`);return}
 if('rdone' in d){render();return}
 if(d.hr){hOpen=hOpen===+d.hr?-1:+d.hr;render();return}
 if(d.hc){hChip=d.hc;render();return}
 if(d.hm){hMode=d.hm;render();return}
 if(d.fk){fbKind=d.fk;render();return}
 if(d.tm){trendMode=d.tm;$('trendBox').innerHTML=trendChart();qa('[data-tm]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tm===trendMode));return}
 if('past' in d){pastOpen=!pastOpen;render();return}
 if('invite' in d){invited=true;render();toast('Link created');return}
 if('done' in d){const fb=t.closest('.fb');fb.style.opacity=.4;t.textContent='Resolved';t.disabled=true;return}
 if(d.adds){addState=d.adds;render();return}
 if(d.addres!==undefined){addState='save';render();return}
 if('coordnext' in d){$('coordErr').textContent='Give the place a name.';return}
 if(d.wk!==undefined){qa('#wkW button').forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.closest('[data-single]')&&t.classList.contains('chip')){qa('.chip',t.closest('[data-single]')).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.closest('.seg')&&!d.hm&&!d.hc&&!d.fk&&!d.tm){qa('button',t.closest('.seg')).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.classList.contains('tile')){qa('.tile',t.parentNode).forEach(b=>b.setAttribute('aria-pressed',b===t));return}
 if(t.closest('.days')){qa('button',t.closest('.days')).forEach(b=>b.setAttribute('aria-selected',b===t));return}
});
document.addEventListener('input',e=>{if(e.target.id==='addQ'&&e.target.value.length>=3&&addState==='main'){addState='search';render();const q=$('addQ');q.focus();q.setSelectionRange(9,9)}});

/* ================= map ================= */
const PROJ={lon0:-96.2,lon1:-86.2,latC:44.6};const pxDeg=390/(PROJ.lon1-PROJ.lon0),pyDeg=pxDeg/Math.cos(PROJ.latC*Math.PI/180);
const P=([la,lo])=>[(lo-PROJ.lon0)*pxDeg,430-(la-PROJ.latC)*pyDeg];
let layer='radar',frame=11,playing=0;
const N0Q=['#04e9e7','#019ff4','#02fd02','#01c501','#fdf802','#fd9500','#fd0000'],RAINB=['#c7d0ff','#a5b4fc','#7c8cf5','#5662e0','#3b3fb8'];
const LAYERS={radar:'Radar',r24:'Past 24h rain',r72:'Past 72h rain',off:'Off'};
const rh=(x,y)=>{const s=Math.sin(x*12.9898+y*78.233)*43758.5453;return s-Math.floor(s)};
const rn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),a=rh(xi,yi),b=rh(xi+1,yi),c=rh(xi,yi+1),d=rh(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v};
function terrain(){const svg=$('terrain');const cw=130,ch=282,c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d'),im=g.createImageData(cw,ch);
 const H=(x,y)=>{let s=0,f=1/38,a=1;for(let o=0;o<5;o++){s+=rn(x*f+3,y*f+7)*a;f*=2.1;a*=.5}return s};
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const h=H(x,y),dx=H(x+1,y)-h,dy=H(x,y+1)-h,sh=Math.max(0,Math.min(1,.5+(dx+dy)*-5)),v=20+h*10+sh*30,i=(y*cw+x)*4;im.data[i]=v*.92;im.data[i+1]=v*.97;im.data[i+2]=v*1.04;im.data[i+3]=255}
 g.putImageData(im,0,0);const line=pts=>pts.map(P).map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
 const sup=[[46.78,-92.1],[46.71,-91.6],[46.65,-91.0],[46.62,-90.5],[46.75,-90.2],[46.55,-89.4],[46.85,-88.4],[47.45,-87.8],[46.85,-87.0],[46.45,-86.4],[46.65,-85.0],[46.5,-84.6],[47.3,-84.7],[47.95,-84.9],[48.6,-86.4],[48.8,-87.8],[48.4,-89.2],[47.9,-89.7],[47.5,-90.6],[47.05,-91.5]];
 const mich=[[45.9,-85.0],[45.6,-86.6],[45.35,-87.0],[44.9,-87.6],[44.5,-88.0],[44.9,-87.4],[44.2,-87.5],[43.5,-87.7],[42.6,-87.8],[41.9,-87.6],[41.65,-87.3],[41.7,-86.6],[42.6,-86.25],[43.7,-86.5],[44.8,-86.1],[45.8,-85.0]];
 const town=(ll,n,dx=6,dy=4)=>{const [x,y]=P(ll);return `<circle cx="${x}" cy="${y}" r="2" fill="#9c9da3"/><text x="${x+dx}" y="${y+dy}" font-size="11" font-family="Space Grotesk" fill="#9c9da3">${n}</text>`};
 svg.innerHTML=`<image href="${c.toDataURL()}" x="0" y="0" width="390" height="844" preserveAspectRatio="none"/>
 <polygon points="${line(sup)}" fill="#1b2a3a" stroke="#4a6a8c"/><polygon points="${line(mich)}" fill="#1b2a3a" stroke="#4a6a8c"/>
 <text x="${P([47.5,-90.6])[0]}" y="${P([47.5,-90.6])[1]}" font-size="12" font-family="Space Grotesk" fill="#6d8aa8" transform="rotate(-20 ${P([47.5,-90.6]).join(' ')})">Lake Superior</text>
 <polyline points="${line([[45.2,-93.6],[44.98,-93.27],[44.75,-92.85],[44.6,-92.62],[44.45,-92.25],[44.3,-92.05],[44.0,-91.65],[43.8,-91.25],[43.4,-91.2],[42.5,-90.65],[41.5,-90.6]])}" fill="none" stroke="#5f7f9f" stroke-width="2" stroke-linecap="round"/>
 <polyline points="${line([[46.75,-92.3],[46.3,-92.3],[45.7,-92.85],[45.4,-92.65],[44.75,-92.8],[44.4,-92.2],[43.5,-91.22],[42.5,-90.65]])}" fill="none" stroke="#c2c3c8" stroke-opacity=".3" stroke-dasharray="5 4"/>
 ${town([46.79,-92.1],'Duluth')}${town([43.8,-91.24],'La Crosse')}${town([44.02,-92.47],'Rochester')}${town([43.07,-89.4],'Madison')}${town([43.04,-87.91],'Milwaukee')}${town([41.88,-87.63],'Chicago',-46,-6)}${town([44.52,-88.02],'Green Bay')}
 <text x="14" y="${P([45.8,-94])[1]}" font-size="11" font-family="Space Grotesk" fill="#9c9da3" letter-spacing=".1em">MINNESOTA</text><text x="${P([45.3,-90.5])[0]}" y="${P([45.3,-90.5])[1]}" font-size="11" font-family="Space Grotesk" fill="#9c9da3" letter-spacing=".1em">WISCONSIN</text><text x="10" y="${P([42.3,-94])[1]}" font-size="11" font-family="Space Grotesk" fill="#9c9da3" letter-spacing=".1em">IOWA</text>`;
 $('pins').innerHTML=LOCS.map(l=>{const [x,y]=P(l.ll);return l.crag?`<button class="pin" style="left:${x}px;top:${y}px;color:#b8f542" data-crag="${l.id}" aria-label="${l.name}, score 100"><span class="dot"></span><em>${l.name}<b class="g">100</b></em></button>`
  :`<button class="pin city" style="left:${x}px;top:${y}px" data-crag="${l.id}" aria-label="${l.name}"><span class="dot"></span><em>${l.name}</em></button>`}).join('')}
function drawRadar(){const cv=$('radar');if(!cv)return;const g=cv.getContext('2d');g.clearRect(0,0,390,844);if(layer==='off')return;
 const w=98,h=211,id=g.createImageData(w,h),sc=390/w,t=layer==='radar'?(frame-11)/11:0;
 const cells=layer==='radar'?[[60,600,60,.7],[20,520,40,.55],[120,660,50,.5],[30,700,40,.6],[200,720,40,.35],[320,250,70,.45],[340,120,60,.4]].map(([x,y,r,k])=>[x-t*-60,y+t*40,r,k]):layer==='r24'?[[60,640,90,.6],[330,200,80,.4]]:[[60,620,120,.8],[300,220,110,.7],[260,560,90,.4]];
 const ramp=layer==='radar'?N0Q:RAINB;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;const X=x*sc,Y=y*sc;for(const [cx,cy,r,k] of cells)v+=k*Math.exp(-((X-cx)**2+(Y-cy)**2)/(r*r)*1.6);v*=.5+.9*rn(X*.09,Y*.09);
  if(v<.16)continue;const c=ramp[Math.min(ramp.length-1,Math.floor((v-.16)/.9*ramp.length))],i=(y*w+x)*4;id.data[i]=parseInt(c.slice(1,3),16);id.data[i+1]=parseInt(c.slice(3,5),16);id.data[i+2]=parseInt(c.slice(5,7),16);id.data[i+3]=120}
 const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;tmp.getContext('2d').putImageData(id,0,0);g.filter='blur(1.2px)';g.drawImage(tmp,0,0,390,844);g.filter='none'}
function setLayer(k){layer=k;$('layN').textContent=LAYERS[k];$('rctl').hidden=k!=='radar';$('leg').hidden=k==='off';
 $('laym').innerHTML=Object.entries(LAYERS).map(([kk,n])=>`<button role="menuitemradio" aria-checked="${kk===k}" data-l="${kk}">${n}</button>`).join('');
 $('legS').style.background=k==='radar'?`linear-gradient(90deg,${N0Q.join(',')})`:`linear-gradient(90deg,${RAINB.join(',')})`;
 $('legA').textContent=k==='radar'?'Faint':'0.01 in';$('legB').textContent=k==='radar'?'Heavy':'1 in +';$('leg').style.bottom=k==='radar'?'112px':'160px';drawRadar()}
const fl=i=>{const m=(16*60+30)-(11-i)*10;return `Radar ${Math.floor(m/60)-12}:${String(m%60).padStart(2,'0')} PM`};
function initMap(){terrain();setLayer(layer);
 $('rt').oninput=e=>{frame=+e.target.value;$('rtt').textContent=fl(frame);drawRadar()};
 $('play').onclick=()=>{if(playing){clearInterval(playing);playing=0;$('play').innerHTML='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>';return}
  $('play').innerHTML='<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/></svg>';playing=setInterval(()=>{if(!$('rt')){clearInterval(playing);playing=0;return}frame=(frame+1)%12;$('rt').value=frame;$('rtt').textContent=fl(frame);drawRadar()},600)};
 $('lay').onclick=()=>{const on=!$('laym').classList.contains('on');$('laym').classList.toggle('on',on);$('lay').setAttribute('aria-expanded',on)};
 $('laym').onclick=e=>{const b=e.target.closest('[data-l]');if(!b)return;setLayer(b.dataset.l);$('laym').classList.remove('on')};
 $('locb').onclick=()=>toast('Location shown')}

/* ================= notes jump list ================= */
const JUMPS={
 login:()=>go('login',{reset:true}),join:()=>go('join',{reset:true}),welcome:()=>go('welcome',{reset:true}),
 list:()=>go('list',{reset:true}),
 ov:()=>{stack=['list'];openCrag('rw','ov')},daily:()=>{stack=['list'];openCrag('rw','daily')},hourly:()=>{stack=['list'];hMode='list';hChip='All';openCrag('rw','hourly')},
 hchart:()=>{stack=['list'];hMode='chart';hChip='All';openCrag('rw','hourly')},precip:()=>{stack=['list'];openCrag('rw','precip')},rock:()=>{stack=['list'];openCrag('rw','rock')},
 crag:()=>{stack=['list'];openCrag('rw','crag')},wall:()=>{stack=['list'];crag='rw';tab='crag';cragSub='wall';go('crag')},route:()=>{stack=['list'];crag='rw';tab='crag';cragSub='route';go('crag')},
 city:()=>{stack=['list'];openCrag('mp','ov')},edit:()=>{stack=['list'];go('edit')},
 add:()=>{stack=['list'];addState='main';go('add')},search:()=>{stack=['list'];addState='search';go('add')},save:()=>{stack=['list'];addState='save';go('add')},coords:()=>{stack=['list'];addState='coords';go('add')},browse:()=>{stack=['list'];addState='browse2';go('add')},
 feedback:()=>{stack=['list'];fbKind='app';go('feedback')},check:()=>{stack=['list'];fbKind='check';go('feedback')},
 map:()=>go('map',{reset:true}),trips:()=>{pastOpen=true;go('trips',{reset:true})},newtrip:()=>{stack=['trips'];go('newtrip')},
 trip1:()=>{stack=['trips'];trendMode='day';go('trip1')},trip2:()=>{stack=['trips'];go('trip2')},trip2crag:()=>{stack=['trips','trip2'];go('trip2crag')},trip3:()=>{stack=['trips'];go('trip3')},past:()=>{stack=['trips'];go('past')},
 profile:()=>{invited=false;go('profile',{reset:true})},
};
function jump(k){lastKey=k;JUMPS[k]();}
window.WT={jump,JUMPS,cragBack:()=>back(),cragTab:()=>{tab='crag';cragSub=null;render();$('scr').scrollTop=0}};
render();
