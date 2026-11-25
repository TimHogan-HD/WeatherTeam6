/* Whole app v4: the approved v26 crag document is the base; every other screen is an app layer inside the same phone. */
const fs=require('fs'),path=require('path'),d=__dirname,S=path.join(d,'..');
let s=fs.readFileSync(path.join(S,'passo-feel-644.html'),'utf8');
const rep=(a,b)=>{if(!s.includes(a))throw new Error('missing: '+a.slice(0,80));s=s.replace(a,b)};
const css=fs.readFileSync(path.join(d,'app.css'),'utf8');
let js=fs.readFileSync(path.join(d,'app.js'),'utf8');
const v2=fs.readFileSync(path.join(d,'app2-app.js'),'utf8').split('\n');
const L=(a,b)=>v2.slice(a-1,b).join('\n');
const chev='chev:`<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5l3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,';
js=js.replace('/*SHARED*/',[L(9,28).replace('const I={','const I={'+chev),L(298,299),L(315,316),L(336,339)].join('\n'));
js=js.replace('/*MAP*/',L(560,602));
const data=fs.readFileSync(path.join(d,'data.json'),'utf8');

/* ---- head, styles ---- */
rep('\n the other pages. A lit strip','\n/* Hours: the other pages. A lit strip');
rep('</style>',`
${css}
.head .fbt{all:unset;cursor:pointer;font:500 14px/1 var(--font);color:var(--t2);padding:12px 2px;flex:none}
.head .fbt:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:6px}
#nav button{width:44px}#nav button[aria-selected=true]{width:112px}
.jg{margin:16px 0 0;font:600 13px/1.2 var(--font);color:#a1a1aa}
.jump{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.jump button{font:500 13px/1 var(--font);color:#e4e4e7;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:8px 11px;cursor:pointer}
.jump button[aria-current=true]{background:#fff;color:#111;border-color:#fff}
.notes details.old{margin-top:26px;border-top:1px solid rgba(255,255,255,.12);padding-top:14px}
.notes details.old summary{cursor:pointer;font:600 15px/1.3 var(--font);color:#fff}
</style>`);
rep('<title>Crag, lit</title>','<title>WeatherTeam6 app</title>');
rep('<button class="find" id="find"','<button class="fbt" type="button">Feedback</button>\n    <button class="find" id="find"');

/* ---- six real tabs ---- */
const ic={
 ov:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 15a7 7 0 1 1 14 0"/><path d="M10 15l3.5-4.5"/></svg>',
 daily:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 16V9M8 16V5M12 16v-6M16 16V7"/></svg>',
 hourly:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.6 2"/></svg>',
 precip:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10 2.5S4.5 9 4.5 12.5a5.5 5.5 0 0 0 11 0C15.5 9 10 2.5 10 2.5Z"/></svg>',
 rock:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2.5 16.5 7 7l3 4 2.5-5 5 10.5z"/></svg>',
 crag:'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5"/></svg>'};
const T=[['ov','Overview','pg0'],['daily','Daily','pg1'],['hourly','Hourly','pg4'],['precip','Precip','pg2'],['rock','Rock','pg3'],['crag','Crag','pg5']];
const n0=s.indexOf('<nav class="nav" role="tablist" aria-label="Crag pages" id="nav">'),n1=s.indexOf('</nav>',n0);
s=s.slice(0,n0)+'<nav class="nav" role="tablist" aria-label="Crag pages" id="nav">\n'+T.map(([k,n,pg],i)=>`    <button role="tab" aria-selected="${!i}" aria-controls="${pg}" data-i="${i}"${i?' tabindex="-1"':''}>${ic[k]}<span>${n}</span></button>`).join('\n')+'\n  '+s.slice(n1);
rep('const ORDER=[0,4,1,2,3];','const ORDER=[0,1,4,2,3,5];');
rep("const HUE={0:[220,'7%'],","const HUE={5:[220,'7%'],0:[220,'7%'],");
rep('if(i<0||i>4||i===cur)return;','if(i<0||i>5||i===cur)return;');
rep('go(Math.min(4,cur+1),1)','go(Math.min(5,cur+1),1)');
rep("else if(k==='End')go(4,1)","else if(k==='End')go(5,1)");
rep("if(e.target.closest('.nav,.tc'))return;","if(e.target.closest('.nav,.tc,.app,.srch'))return;");

/* ---- the Crag page ---- */
rep('  </div></section>\n  </div>\n\n  <div class="srch"',`  </div></section>
  <section class="pg" id="pg5" aria-label="Crag" hidden><div class="in">
    <div class="light" style="left:-60px;top:40px;width:420px;height:260px;background:#eceef2;opacity:.1;filter:blur(60px);animation:drift1 8s ease-in-out infinite alternate"></div>
    <div class="light" style="left:160px;top:900px;width:300px;height:260px;background:#b8f542;opacity:.08;filter:blur(60px);animation:drift2 9s ease-in-out infinite alternate"></div>
    <div id="cgBody"></div>
  </div></section>
  </div>

  <div class="srch"`);

/* ---- search lists the real five places ---- */
const s0=s.indexOf('const SL=['),s1=s.indexOf("{id:'ph'",s0);
s=s.slice(0,s0)+`const SL=[
  {id:'rw',t:'Red Wing',m:'Dolomite or limestone (with chert)',s:52,saved:1},{id:'ss',t:'Sandstone',m:'Sandstone (hard quartz)',s:100,saved:1},{id:'tf',t:'Taylors Falls',m:'Basalt (dense)',s:100,saved:1},
  {id:'dl',t:"Devil's Lake",m:'Quartzite',s:100,saved:1},{id:'mp',t:'Minneapolis',m:'Not a crag',saved:1},
  `+s.slice(s1);
rep('${c.saved?`<b style="color:${BAND(c.s)[0]}">${c.s}</b> · `','${c.saved&&c.s!=null?`<b style="color:${BAND(c.s)[0]}">${c.s}</b> · `');
rep("setTimeout(()=>{rows.get(c.id).classList.remove('open');opened=null;hide()},RM?200:700)","setTimeout(()=>{rows.get(c.id).classList.remove('open');opened=null;hide();window.__slOpen&&window.__slOpen(c)},RM?200:700)");

/* ---- the app layer, between the dock and the home bar ---- */
rep('  </nav>\n  <div class="homebar"></div>','  </nav>\n  <div class="app" id="app"></div>\n  <div class="homebar"></div>');

/* ---- notes ---- */
const J=(k,n)=>`<button data-j="${k}">${n}</button>`;
const grp=(t,items)=>`<p class="jg">${t}</p><div class="jump">${items.map(([k,n])=>J(k,n)).join('')}</div>`;
const notes=`<div class="notes">
<h2>WeatherTeam6, the whole app · v4</h2>
<p>Every screen of the real app, rebuilt in the crag design we made here: the lit glow behind each page, figures standing on rules, numbers that roll in, lit bars that grow, the water gauge, the past-week tubes and the glass dock. The words, sections, order, controls and figures are the running app's, from Wed Nov 25 signed in as tim. Tap through it like the app or jump to a screen, then tell me what to change.</p>
<h3>Jump to a screen</h3>
${grp('Signing in',[['login','Sign in'],['join','Join (invite link)'],['welcome','Welcome setup']])}
${grp('Conditions',[['list','List'],['add','Add a location'],['search','Add: search'],['save','Add: save'],['coords','Add: coordinates'],['browse','Add: browse'],['edit','Edit crag'],['feedback','Feedback'],['check','Forecast check']])}
${grp('A crag (Red Wing)',[['ov','Overview'],['daily','Daily'],['hourly','Hourly'],['precip','Precip'],['rock','Rock'],['crag','Crag'],['wall','Wall page'],['route','Route page']])}
${grp('A place that is not a crag',[['city','Minneapolis'],['cityh','Minneapolis: Hourly'],['cityp','Minneapolis: Precip']])}
${grp('Trips',[['trips','Trips list'],['newtrip','New trip'],['trip1','One crag'],['trip2','Two crags'],['trip2crag','Two crags: one crag'],['trip3','Beyond the forecast'],['past','Ended trip']])}
${grp('Map and Profile',[['map','Map'],['profile','Profile']])}
<h3>How it is built</h3>
<ul>
<li><b>A crag is the design itself.</b> Overview, Daily, Hourly, Precip and Rock are the v26 pages, under the app's real six tabs in the glass dock, and Crag is the app's guidebook tab (walls by hour, grades, walls, a wall's routes, a route) drawn with the same lit bars and figures. Swipe between them, use the crag picker or search, and Back returns to the list.</li>
<li><b>The crag pages keep the sample day</b> (Red Wing drying after rain, 52 at 9 AM), because on Nov 25 every crag scored 100 and the design shows nothing. Every crag opens Red Wing. Every other screen uses the real Nov 25 data.</li>
<li><b>Every other screen</b> uses the same parts: big figures on a white rule for the one number that matters, lit day bars for scores, the gauge for rain amounts, tubes for rain by day, rules between sections instead of cards, white pills for actions.</li>
<li><b>Minneapolis</b> is not a crag, so it keeps the app's four city tabs, in the same glass dock.</li>
<li><b>The sliders above the phone</b> (Ground, Glow, Card edge, Lightness, Grain, Cards) change every screen at once.</li>
<li><b>Things that work:</b> sign in, the welcome sliders reshape the example week, list sort, city tabs and hour rows, Add search (type 3 letters), Feedback kinds, trip day bars pick the day card, By day / Whole trip, Profile steppers, invite link, map layers and the radar loop, Remove location (tap twice).</li>
<li><b>Not real:</b> map tiles are a drawing; the app uses OpenFreeMap and IEM radar. No warnings were active on Nov 25, so no banner shows outside the sample crag.</li>
</ul>
<h3>Questions for you</h3>
<ul>
<li><b>Six tabs in the dock.</b> Icons with the chosen tab's name fit at 390 px but are a lot to learn. Text-only tabs would also fit if we shorten Overview to Now.</li>
<li><b>Accent.</b> Actions are white here; the app's accent is aqua. Keep white, or bring aqua back as the one action colour?</li>
</ul>
<details class="old"><summary>The crag design's own notes (v26)</summary>
__OLD__
</details>
</div>`;
const a0=s.indexOf('<div class="notes">'),a1=s.indexOf('</div>\n</div>\n\n<script>',a0);
if(a0<0||a1<0)throw new Error('notes bounds');
const old=s.slice(a0+'<div class="notes">'.length,a1).replace(/<h2>[^<]*<\/h2>/,'');
s=s.slice(0,a0)+notes.replace('__OLD__',old)+s.slice(a1+'</div>'.length);

({s,js}=require('./v5.cjs')(s,js));
/* ---- script ---- */
const sEnd=s.lastIndexOf('</script>');
s=s.slice(0,sEnd)+`window.DATA=${data};\n${js}\n`+s.slice(sEnd);
fs.writeFileSync(path.join(S,'whole-app.html'),s);console.log('ok',s.length);
