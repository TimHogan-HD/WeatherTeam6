/* v5: the owner's ten comments on v4 (2026-11-25). Applied after the v4 build, before the script is injected. */
module.exports=function(s,js){
const rep=(a,b,all)=>{if(!s.includes(a))throw new Error('v5 missing: '+a.slice(0,90));s=all?s.split(a).join(b):s.replace(a,b)};
const repJ=(a,b)=>{if(!js.includes(a))throw new Error('v5 js missing: '+a.slice(0,90));js=js.replace(a,b)};
const span=(from,to,b)=>{const i=s.indexOf(from),j=s.indexOf(to,i);if(i<0||j<0)throw new Error('v5 span: '+from.slice(0,60));s=s.slice(0,i)+b+s.slice(j)};
const spanJ=(from,to,b)=>{const i=js.indexOf(from),j=js.indexOf(to,i);if(i<0||j<0)throw new Error('v5 jspan: '+from.slice(0,60));js=js.slice(0,i)+b+js.slice(j)};

/* 1. The real app's fonts: Barlow Condensed for figures, headings, labels, nav and buttons; Barlow for sentences */
rep('family=Space+Grotesk:wght@300;400;500;600;700','family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@400;500;600;700');
rep("--font:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;","--font:'Barlow',ui-sans-serif,system-ui,sans-serif;--disp:'Barlow Condensed','Barlow',ui-sans-serif,sans-serif;");
rep("'Space Grotesk'","'Barlow Condensed'",true);
js=js.split('Space Grotesk').join('Barlow Condensed');

/* CSS for every v5 change */
rep('</style>',`
/* v5 · type: display face on figures, headings, labels and controls */
:is(h1,h2,h3,b,strong,.big,.v,.sc,.nm,.num,.chip,.lbl:not(p),.nav button,.tb button,.pill,.hrow,.colh,.all4,.stat,.stats3,.cfoot .ln,.cfoot summary,.words button,.seg button,.tg button,.dsel button,.jump button,.st,.rc,.d,label){font-family:var(--disp)!important}
.big,.cards-open :is(#tCard,#dCard,#hCard) .big{font-size:96px;line-height:1;height:auto!important;letter-spacing:-.015em;font-weight:700}
.roll{height:1.2em;line-height:1.2;padding:0 .08em 0 .02em;margin:-.1em -.08em -.1em -.02em}
.app [data-roll] .roll,.sc .roll,.bf .roll{margin-top:-.1em;margin-bottom:-.1em}
.stat b,.stats3 b{letter-spacing:0}
/* v5 · dock: thinner and wider */
.nav{width:calc(100% - 32px);padding:4px;justify-content:space-between}
.nav button,#nav button{height:40px;width:auto;flex:1 1 0;min-width:0}
.nav button[aria-selected=true],#nav button[aria-selected=true]{width:auto;flex:0 0 116px}
.app .tb{width:calc(100% - 32px);padding:4px;justify-content:space-between}
.app .tb button{height:40px;width:auto;flex:1 1 0;min-width:0}
.app .tb button[aria-current=page]{width:auto;flex:0 0 136px}
/* v5 · footer links: smaller and quieter */
.cfoot{margin:26px 20px 0}
.cfoot details summary,.cfoot .ln{padding:10px 0;font:500 14px/1 var(--disp);color:var(--t3);border-top:1px solid rgba(255,255,255,.06)}
.cfoot .ln.dg{color:#fc8181}
.cfoot .re{font-size:13px}
/* v5 · Further out removed */
.fo{display:none!important}
/* v5 · Hourly: headers that sit over their columns, charts with room between them */
.colh .r4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.colh .r{display:flex;justify-content:space-between;gap:10px}
.all4 .sm{display:inline-block;position:relative;width:32px;height:8px;border-radius:9px;vertical-align:middle;background:repeating-linear-gradient(90deg,rgba(255,255,255,.26) 0 1px,transparent 1px 4px)}
.all4 .sm i{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:var(--sun);box-shadow:0 0 8px rgba(255,200,90,.5)}
/* each chart is its own panel, so it is plain where one starts and stops */
.lcard:has(#hChart:not([hidden])){background:none;box-shadow:none;padding:0;overflow:visible}
.lcard:has(#hChart:not([hidden]))::before{display:none}
.hc .chart{padding:16px 16px 12px;border-radius:24px;background:linear-gradient(hsl(var(--h) var(--s) calc(var(--gl) + 6%)),hsl(var(--h) var(--s) calc(var(--gl) + 4%)));box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 18px 30px -18px rgba(0,0,0,.6)}
.hc .chart+.chart{margin-top:16px;padding-top:16px;border-top:0}
.hc .chart h3{font-size:18px;margin:0 0 14px}
.hc .chart h3 .lbl{font-size:14px}
/* v5 · Overview: can I climb here now */
.hero{position:relative;margin:4px 20px 0}
.hero .hg{display:grid;grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:end;margin-top:6px}
.hero .hs .rl{height:2px;background:#fff;opacity:.9;margin-top:6px}
.hero .rd4{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;padding-bottom:2px}
.hero .rd4 div{display:grid;gap:2px;min-width:0}
.hero .rd4 b{font:600 19px/1.1 var(--disp);overflow-wrap:anywhere}
.hero .rd4 .nt{font:500 12.5px/1.25 var(--font);color:var(--t3)}
.hero .cav{margin:16px 0 0;font:500 13px/1.35 var(--font);color:var(--t2)}
.why{margin-top:14px;border-top:1px solid rgba(255,255,255,.1)}
.why summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;font:600 16px/1 var(--disp)}
.why summary::-webkit-details-marker{display:none}
.why summary .c{margin-left:auto;font:500 13px/1 var(--font);color:var(--t3)}
.why summary::after{content:"";width:7px;height:7px;border-right:1.6px solid var(--t3);border-bottom:1.6px solid var(--t3);transform:rotate(45deg) translateY(-2px);transition:transform .3s var(--slide)}
.why[open] summary::after{transform:rotate(-135deg)}
.why ol{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:12px}
.why li{display:grid;grid-template-columns:22px 1fr;gap:2px 10px}
.why li .n{grid-row:span 3;font:600 15px/1.3 var(--disp);color:var(--t3)}
.why li b{font:600 16px/1.2 var(--disp)}
.why li span{font:500 13px/1.35 var(--font);color:var(--t2)}
.why li .e{color:var(--t1)}
.why .wf{display:flex;justify-content:space-between;margin-top:12px;font:500 13px/1 var(--font);color:var(--t3)}
.why .wf a{color:var(--t1);text-decoration:none}
.sh{display:flex;justify-content:space-between;align-items:baseline}
.nd{margin-top:10px}
.nd .hd2,.nd .r{display:grid;grid-template-columns:52px minmax(0,1fr) 34px 58px 38px;gap:10px;align-items:center}
.nd .hd2{font:500 12px/1 var(--disp);color:var(--t3);padding:0 0 8px}
.nd .hd2 span:nth-child(n+3){text-align:right}
.nd .r{width:100%;min-height:48px;border-top:1px solid rgba(255,255,255,.08);text-align:left}
.nd .r .dn b{display:block;font:600 16px/1.1 var(--disp)}
.nd .r .dn small{font:500 12px/1 var(--font);color:var(--t3)}
.nd .tr{position:relative;height:8px;border-radius:9px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.2) 0 1px,transparent 1px 4px)}
.nd .tr i{position:absolute;left:0;top:0;bottom:0;border-radius:9px;transform-origin:left;animation:ndg .9s var(--land) both}
@keyframes ndg{from{transform:scaleX(0)}}
.nd .r .s{font:600 18px/1 var(--disp);text-align:right}
.nd .r .g,.nd .r .p{font:600 15px/1 var(--disp);text-align:right}
.rn{margin-top:8px}
.rn button{display:grid;grid-template-columns:96px 1fr 14px;gap:10px;align-items:baseline;width:100%;text-align:left;padding:13px 0;border-top:1px solid rgba(255,255,255,.08)}
.rn button:first-child{border-top:0}
.rn .k{font:500 14px/1.2 var(--disp);color:var(--t2)}
.rn .v2 b{font:600 18px/1.1 var(--disp)}
.rn .v2 small{display:block;font:500 13px/1.3 var(--font);color:var(--t3);margin-top:2px}
.rn .ch{color:var(--t3);font-size:18px}
.srcl{margin:10px 0 0;font:500 12.5px/1.4 var(--font);color:var(--t3)}
@media (prefers-reduced-motion:reduce){.nd .tr i{animation:none}}
</style>`);

/* 2. Overview: the real app's four sections (hero, Today, Next days, Right now) in the v26 parts */
rep('id="t1" style="left:-150px;top:470px;','id="t1" style="left:-150px;top:10px;');
rep('id="t2" style="left:-60px;top:560px;','id="t2" style="left:-60px;top:70px;');
span('    <div class="toprow">\n      <div><div class="v">Drying</div>','  </div></section>\n\n  <!-- ================= HOURS',`    <div class="hero" id="tHero">
      <div class="lbl" id="tAt">Score now, 9 AM</div>
      <div class="hg">
        <div class="hs"><div class="big" id="tBig"></div><div class="rl"></div></div>
        <div class="rd4">
          <div><span class="lbl f">Dryness</span><b>Drying</b><span class="nt">41 h since real rain</span></div>
          <div><span class="lbl f">Rock</span><b>Dolomite or limestone</b><span class="nt">holds up when wet</span></div>
          <div><span class="lbl f">Air</span><b id="tAir">29°F</b><span class="nt" id="tAirN">dew point 23°F</span></div>
          <div><span class="lbl f">Good hours</span><b>10 AM–6 PM</b><span class="nt">8 hours</span></div>
        </div>
      </div>
      <p class="cav">Rain likely Sat · 90% · from 1 PM</p>
      <details class="why"><summary><span>Score breakdown</span><span class="c">2 things cost points</span></summary>
        <ol>
          <li><span class="n">1</span><b>Rock still drying</b><span>Dryness: Drying · 41 h since real rain</span><span class="e">Eases ≈ 10 AM</span></li>
          <li><span class="n">2</span><b>Cold</b><span>Air 29°F · your range 40–75°F</span><span class="e">Eases ≈ 11 AM, when the air reaches 35°F</span></li>
        </ol>
        <div class="wf"><span>Biggest cost first</span><a href="#" data-go="howscore">How the score works ›</a></div>
      </details>
    </div>

    <div class="sec"><div class="sh"><h2>Today</h2><span class="lbl f">Good 10 AM–6 PM</span></div></div>
    <div class="tc" id="tc" tabindex="0" role="slider" aria-label="Hour" aria-valuemin="3" aria-valuemax="19" style="margin-top:30px">
      <div class="chip" id="chip">9 AM · 29°F</div>
      <svg id="tsvg" viewBox="0 0 378 272" role="img" aria-label="Today, 3 AM to 7 PM: air temperature coloured by each hour's score, dew point dashed, chance of rain as dots"></svg>
    </div>
    <div class="key">
      <span class="lbl f"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>Air</span>
      <span class="lbl f"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#9c9da3" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/></svg>Dew point</span>
      <span class="lbl f"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>Chance of rain</span>
    </div>

    <div class="sec"><div class="sh"><h2>Next days</h2><span class="lbl f">Tap for Daily</span></div>
      <div class="nd"><div class="hd2"><span></span><span>Score</span><span></span><span>Good</span><span>Rain</span></div><div id="ndRows"></div></div>
    </div>

    <div class="sec"><h2>Right now</h2>
      <div class="rn">
        <button data-pg="3"><span class="k">Last rain</span><span class="v2"><b>Sun</b><small>0.31 in · 41 h ago</small></span><span class="ch">›</span></button>
        <button data-pg="3"><span class="k">Next rain</span><span class="v2"><b>Sat</b><small>90% · from 1 PM</small></span><span class="ch">›</span></button>
        <button data-pg="2"><span class="k">Wind</span><span class="v2"><b id="tWind">8 mph</b><small id="tGust">gusts 13</small></span><span class="ch">›</span></button>
      </div>
      <p class="srcl">Air: HRRR · rain: median of ECMWF, GFS, ICON</p>
    </div>
`);
rep("$('t3').style.backgroundColor=c;$('tCard').style.setProperty('--rim',c);","$('t3').style.backgroundColor=c;");
rep("$('tAir').innerHTML=AIR[i]+'<small>°F</small>';$('tDew').innerHTML=DEW[i]+'<small>°F</small>';$('tRain').innerHTML=RAIN[i]+'<small>%</small>';$('tWind').innerHTML=WIND[i]+'<small>mph</small>';",
 "$('tAir').textContent=AIR[i]+'°F';$('tAirN').textContent='dew point '+DEW[i]+'°F';$('tWind').textContent=WIND[i]+' mph';$('tGust').textContent='gusts '+(WIND[i]+5);");
/* Next days rows and Right now taps, after DAYS exists */
rep("function growBars(){",`$('ndRows').innerHTML=DAYS.map((r,i)=>{const [c]=BAND(r.s);return \`<button class="r" data-pg="1" data-day="\${i}" aria-label="\${r.full}, score \${r.s}"><span class="dn"><b>\${r.d}</b><small>\${r.date}</small></span><span class="tr"><i style="width:\${r.s}%;background:\${c};box-shadow:0 0 10px \${c};animation-delay:\${i*60}ms"></i></span><span class="s" style="color:\${c}">\${r.s}</span><span class="g">\${r.good??'—'}</span><span class="p">\${r.r}%</span></button>\`}).join('');
document.querySelector('#pg0').addEventListener('click',e=>{const b=e.target.closest('[data-pg]');if(!b)return;if(b.dataset.day!=null)pickDay(+b.dataset.day);go(+b.dataset.pg,1)});
function growBars(){`);

/* 3. Hourly: headers over their columns, sun drawn as a meter, charts with room */
rep("if(hv==='all')return `<div class=\"all4\"><span>${HT[i]}<small>°F</small></span><span>${HC[i]}<small>%</small></span><span>${HWd[i]}<small>mph</small></span><span>${night(i)?'—':HSun[i]+'<small>min</small>'}</span></div>`;",
 "if(hv==='all')return `<div class=\"all4\"><span>${HT[i]}<small>°F</small></span><span>${HC[i]}<small>%</small></span><span>${HWd[i]}<small>mph</small></span><span>${night(i)?'—':`<i class=\"sm\" title=\"${HSun[i]} min of sun\"><i style=\"width:${HSun[i]/60*100}%\"></i></i>`}</span></div>`;");
rep("if(hv==='rain')return `<div class=\"cell\"><span style=\"width:28px;height:14px;border-radius:4px;flex:none;background:${HC[i]?'rgba(165,180,252,'+(.25+HC[i]/60)+')':'rgba(255,255,255,.07)'}\"></span><div","if(hv==='rain')return `<div class=\"cell\"><div");
span("function head(){const sc={","$('hHead').innerHTML=",`function head(){const sc={all:'<span class="r4"><span>Air</span><span>Rain</span><span>Wind</span><span>Sun</span></span>',temp:'<span class="r"><span>Dew point to air · 20–45°F</span><span>Air</span></span>',
  rain:'<span class="r"><span>Amount · 0–0.10 in</span><span>Chance</span></span>',wind:'<span class="r"><span>Range and gusts · 0–40 mph</span><span>Wind</span></span>',sun:'<span class="r"><span>Bright sun · 0–60 min</span><span>Minutes</span></span>'}[hv];
  `);
rep(":st(HSun[i],'min','Sun'))",":st(HSun[i],'min','Sun this hour'))");
rep('const Hh=dryR?52:tall?170:104','const Hh=dryR?60:tall?180:140');

/* 4. Notes: what v5 changed */
rep('<h2>WeatherTeam6, the whole app · v4</h2>',`<h2>WeatherTeam6, the whole app · v5</h2>
<h3>What changed from your comments</h3>
<ul>
<li><b>Fonts</b> are the app's: Barlow Condensed for figures, headings, labels and buttons, Barlow for sentences.</li>
<li><b>Big numbers</b> no longer clip; the rolling figure has room above and below.</li>
<li><b>The dock</b> is thinner (40 px tabs) and runs nearly edge to edge, on crags, Minneapolis and the main tabs.</li>
<li><b>Sources, Check this forecast and Remove location</b> are smaller and quieter on every page.</li>
<li><b>Further out</b> is gone from Daily.</li>
<li><b>Overview</b> is the app's four sections, so it answers “can I climb here now”: the score now on its rule with Dryness, Rock, Air and Good hours beside it, the rain caveat, Score breakdown (what costs points and when it eases), Today's chart, Next days, and Right now (last rain, next rain, wind).</li>
<li><b>Hourly</b>: every list header now sits over its own column (Amount · Chance, not “Chance · amount”). Sun in the All view is a small meter of the hour's bright-sun minutes instead of “60 min”. The charts are taller with a rule and space between them.</li>
<li><b>Conditions</b> uses the crag pages' parts: each crag's score as a figure on a rule in its band colour, its readings as figures, and today's good hours lit on a 24-hour track.</li>
<li><b>Trip forecast trend</b> is redrawn in the design's parts: lit rain capsules against the first forecast's outline, figures for each day, and range tracks for the whole trip.</li>
</ul>`);
return {s,js}};
