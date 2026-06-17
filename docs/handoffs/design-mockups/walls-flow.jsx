/* walls-flow.jsx — the actual Walls + Setup screens. Viz from walls-viz.jsx,
   chrome from radar-shared.jsx (all via window). */

const WALLS = [
  { name: "West Buttress", dir: "W", tick: 270, score: 91, tone: "good", routes: "48 routes · 5.9–5.13a", aspect: "West-facing · open exposure", dry: ["dry", "Dry"], sun: ["sun", "Sun til 7:40p"] },
  { name: "The Prow", dir: "SE", tick: 135, score: 82, tone: "good", routes: "31 routes · 5.10–5.12d", aspect: "SE-facing · canyon rim", dry: ["dry", "Dry"], sun: ["sun", "AM sun"] },
  { name: "Shady Side", dir: "N", tick: 0, score: 58, tone: "fair", routes: "22 routes · 5.7–5.11b", aspect: "North-facing · shaded", dry: ["damp", "Damp · 9h"], sun: ["sun", "No direct sun"] },
];

/* ============================================================
   WALLS · A — classic list rows
   ============================================================ */
function WallsClassic() {
  return (
    <div className="crux-phone">
      <div className="scr-head">
        <div className="scr-back"><I n="chevron-left" s={15} />Taylors Falls</div>
        <div className="scr-title">Walls</div>
        <div className="scr-sub">3 defined · scores from current weather + aspect</div>
      </div>
      <div className="src-row">
        <span className="src-badge">Aspect · OpenBeta + terrain</span>
        <span className="src-badge">Angle · user-defined</span>
      </div>
      <div className="scr-body">
        {WALLS.map(w => (
          <div className="wall-row" key={w.name}>
            <div className="aspect-badge">
              <div className="ab-dir">{w.dir}</div>
              <div className="ab-tick" style={{ transform: `rotate(${w.tick}deg)` }} />
            </div>
            <div className="wall-info">
              <div className="wall-name">{w.name}</div>
              <div className="wall-meta">{w.routes} · {w.aspect}</div>
              <div className="wall-tags">
                <span className={"wtag " + w.dry[0]}><I n={w.dry[0] === "dry" ? "check" : "droplet"} s={11} />{w.dry[1]}</span>
                <span className="wtag sun"><I n="sun" s={11} />{w.sun[1]}</span>
              </div>
            </div>
            <div className="wall-score">
              <div className={"ws-num " + w.tone}>{w.score}</div>
              <div className="ws-lbl">Score</div>
            </div>
          </div>
        ))}
        <div className="wall-row" style={{ justifyContent: "center", gap: 9, color: "var(--txt-3)", borderStyle: "dashed" }}>
          <I n="plus" s={17} /><span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Add a wall</span>
        </div>
      </div>
      <BottomNav active={1} />
    </div>
  );
}

/* ============================================================
   WALLS · B — data-forward cards with sun arc
   ============================================================ */
function WallsCards() {
  const cards = [
    { name: "West Buttress", dir: "W · 270°", score: 91, tone: "good", sun: "5.2 h", sunWin: [0.42, 0.96], sunT: 0.7, dry: "Dry", dtone: "good", win: "Now → 7:40p" },
    { name: "The Prow", dir: "SE · 135°", score: 82, tone: "good", sun: "3.8 h", sunWin: [0.12, 0.5], sunT: 0.3, dry: "Dry", dtone: "good", win: "6:30a → 11a" },
  ];
  return (
    <div className="crux-phone">
      <div className="scr-head">
        <div className="scr-back"><I n="chevron-left" s={15} />Taylors Falls</div>
        <div className="scr-title">Walls</div>
        <div className="scr-sub">Sun window + drying, per wall · today</div>
      </div>
      <div className="scr-body" style={{ gap: 10 }}>
        {cards.map(c => (
          <div className="wall-card" key={c.name}>
            <div className="wc-top">
              <div>
                <div className="wc-name">{c.name}</div>
                <div className="wc-meta">{c.dir} · {c.win}</div>
              </div>
              <div className="wc-score"><span className={"n " + c.tone}>{c.score}</span></div>
            </div>
            <div className="wc-row">
              <div className="wc-stat"><div className="v sun">{c.sun}</div><div className="k">Direct sun</div></div>
              <div className="wc-stat"><div className={"v " + (c.dtone || "")}>{c.dry}</div><div className="k">Rock state</div></div>
              <SunArc winStart={c.sunWin[0]} winEnd={c.sunWin[1]} sunT={c.sunT} />
            </div>
          </div>
        ))}
        <div className="wall-row" style={{ justifyContent: "center", gap: 9, color: "var(--txt-3)", borderStyle: "dashed" }}>
          <I n="plus" s={17} /><span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Add a wall</span>
        </div>
      </div>
      <BottomNav active={1} />
    </div>
  );
}

/* ---------- shared setup chrome ---------- */
function SetupShell({ step, total, q, hint, children, foot, footLabel = "Continue", footIcon = "chevron-right" }) {
  return (
    <div className="crux-phone">
      <div className="setup-head">
        <div className="scr-back"><I n="x" s={15} />Cancel</div>
        <div className="setup-step">Step <b>{step}</b> / {total}</div>
      </div>
      <div className="stepbar">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} />
        ))}
      </div>
      <div className="setup-body">
        <div className="setup-q">{q}</div>
        {hint && <div className="setup-hint">{hint}</div>}
        {children}
      </div>
      <div className="setup-foot">
        {foot || <div className="btn btn-primary">{footLabel}<I n={footIcon} s={16} /></div>}
      </div>
    </div>
  );
}

/* STEP 1 — name + crag */
function SetupName() {
  return (
    <SetupShell step={1} total={4} q="Name this wall" hint="Walls are sectors of a crag you track separately — each gets its own score, drying and sun window.">
      <div className="field">
        <div className="field-lbl">Crag</div>
        <div className="field-input" style={{ color: "var(--txt-2)" }}>Taylors Falls<I n="chevron-right" s={16} /></div>
      </div>
      <div className="field">
        <div className="field-lbl">Wall name</div>
        <div className="field-input">West Buttress<span className="cursor" /></div>
      </div>
    </SetupShell>
  );
}

/* STEP 2a — compass DIAL */
function SetupCompassDial() {
  return (
    <SetupShell step={2} total={4} q="Which way does it face?" hint="Drag the dial to point at the direction the wall faces. This drives sun exposure and drying.">
      <div className="dial-stage"><CompassDial bearing={122} dir="ESE" deg="122°" cap="Faces east-southeast" /></div>
      <div className="setup-hint" style={{ textAlign: "center", marginTop: 20, color: "var(--txt-4)" }}>
        <I n="info-circle" s={13} /> Aspect drives morning vs. afternoon sun.
      </div>
    </SetupShell>
  );
}

/* STEP 2b — compass ROSE */
function SetupCompassRose() {
  return (
    <SetupShell step={2} total={4} q="Which way does it face?" hint="Tap the direction the wall faces. Eight-way is precise enough for sun and drying.">
      <CompassRose active="SE" />
      <div className="presets" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 22 }}>
        <div className="preset"><div className="pv">Catches AM sun</div></div>
        <div className="preset active"><div className="pv">PM sun</div></div>
        <div className="preset"><div className="pv">Mostly shade</div></div>
      </div>
    </SetupShell>
  );
}

/* STEP 2c — terrain SUGGESTION */
function SetupTerrain() {
  return (
    <SetupShell step={2} total={4} q="We think it faces SE" hint="Derived from canyon geometry and terrain near Taylors Falls. Confirm or adjust." footLabel="Looks right">
      <div className="suggest-card">
        <div className="sg-mini">
          <div className="rmap-base" />
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(40deg, rgba(226,232,240,0.08) 0 1px, transparent 1px 8px)" }} />
          <div style={{ position: "absolute", left: "50%", top: "55%", transform: "translate(-50%,-50%)", width: 7, height: 7, borderRadius: "50%", background: "#b8f542" }} />
        </div>
        <div className="sg-info">
          <div className="sg-lbl">Terrain suggests</div>
          <div className="sg-dir">SE · 135°</div>
          <div className="sg-note">Canyon rim drops to the southeast. High confidence from elevation data.</div>
        </div>
      </div>
      <div className="confirm-row">
        <div className="btn btn-ghost">Pick manually</div>
      </div>
    </SetupShell>
  );
}

/* STEP 3 — angle side-profile + slider */
function SetupAngle() {
  return (
    <SetupShell step={3} total={4} q="How steep is it?" hint="No public source has wall angle — you define it. It tunes how rain lands and how fast the face dries.">
      <div className="profile-stage">
        <AngleProfile angle={18} />
        <div className="angle-readout">
          <span className="ar-num">18</span><span className="ar-deg">° past vertical</span>
        </div>
        <div style={{ textAlign: "center" }}><span className="ar-name">Overhanging</span></div>
        <div className="ang-slider">
          <div className="ang-track"><div className="ang-handle" style={{ left: "46%" }} /></div>
          <div className="ang-ticks">
            <span className="ang-tick">Slab</span><span className="ang-tick">Vertical</span>
            <span className="ang-tick">Steep</span><span className="ang-tick">Roof</span>
          </div>
        </div>
      </div>
      <div className="presets">
        <div className="preset"><div className="pv">Slab</div><div className="pd">&lt;0°</div></div>
        <div className="preset"><div className="pv">Vert</div><div className="pd">0°</div></div>
        <div className="preset active"><div className="pv">Steep</div><div className="pd">10–30°</div></div>
        <div className="preset"><div className="pv">Roof</div><div className="pd">30°+</div></div>
      </div>
    </SetupShell>
  );
}

/* STEP 3 (cave variant) — slider pushed to the roof/cave end */
function SetupAngleCave() {
  return (
    <SetupShell step={3} total={4} q="How steep is it?" hint="No public source has wall angle — you define it. It tunes how rain lands and how fast the face dries.">
      <div className="profile-stage">
        <CaveProfile depthFt={11} />
        <div className="angle-readout">
          <span className="ar-num">92</span><span className="ar-deg">° past vertical</span>
        </div>
        <div style={{ textAlign: "center" }}><span className="ar-name">Deep roof · cave</span></div>
        <div className="ang-slider">
          <div className="ang-track"><div className="ang-handle" style={{ left: "94%" }} /></div>
          <div className="ang-ticks">
            <span className="ang-tick">Slab</span><span className="ang-tick">Vertical</span>
            <span className="ang-tick">Steep</span><span className="ang-tick">Roof</span>
          </div>
        </div>
      </div>
      <div className="presets">
        <div className="preset"><div className="pv">Slab</div><div className="pd">&lt;0°</div></div>
        <div className="preset"><div className="pv">Vert</div><div className="pd">0°</div></div>
        <div className="preset"><div className="pv">Steep</div><div className="pd">10–30°</div></div>
        <div className="preset active"><div className="pv">Roof</div><div className="pd">30°+</div></div>
      </div>
      <div className="suggest-card" style={{ marginTop: 16 }}>
        <div style={{ flexShrink: 0, color: "var(--good)", display: "flex" }}><I n="droplet" s={20} /></div>
        <div className="sg-info">
          <div className="sg-lbl">What a roof means</div>
          <div className="sg-note" style={{ marginTop: 2 }}>Rain barely touches the climbing surface — a deep roof stays dry through light precip and dries fastest of any angle.</div>
        </div>
      </div>
    </SetupShell>
  );
}

/* STEP 4 — review */
function SetupReview() {
  const foot = <div className="btn btn-primary"><I n="check" s={16} />Add wall</div>;
  return (
    <SetupShell step={4} total={4} q="Review" hint="You can edit any of this later from the wall's detail." foot={foot}>
      <div className="review-card">
        <div className="rv-row">
          <div><div className="rv-k">Wall</div></div>
          <div className="rv-v">West Buttress<span className="rv-edit"><I n="edit" s={15} /></span></div>
        </div>
        <div className="rv-row">
          <div><div className="rv-k">Crag</div></div>
          <div className="rv-v" style={{ fontWeight: 600 }}>Taylors Falls</div>
        </div>
        <div className="rv-row">
          <div><div className="rv-k">Aspect</div><div className="rv-source">Terrain-derived · confirmed</div></div>
          <div className="rv-v">ESE · 122°<span className="rv-edit"><I n="edit" s={15} /></span></div>
        </div>
        <div className="rv-row">
          <div><div className="rv-k">Angle</div><div className="rv-source">User-defined</div></div>
          <div className="rv-v">18° · Overhanging<span className="rv-edit"><I n="edit" s={15} /></span></div>
        </div>
      </div>
      <div className="suggest-card" style={{ marginTop: 14 }}>
        <div style={{ flexShrink: 0, color: "var(--good)", display: "flex" }}><I n="sun" s={20} /></div>
        <div className="sg-info">
          <div className="sg-lbl">First read</div>
          <div className="sg-note" style={{ marginTop: 2 }}>An ESE overhang gets morning sun and sheds light rain — expect faster drying than a slab. Score updates with the forecast.</div>
        </div>
      </div>
    </SetupShell>
  );
}

/* ---------- notes ---------- */
function WallsNotes() {
  return (
    <div className="notes-card">
      <h1>Walls + setup</h1>
      <div className="nc-sub">The Walls list and the add-a-wall flow, on the locked system. Two key decisions made visible: <strong>aspect is terrain-derived, user-confirmed</strong>; <strong>angle is user-defined</strong> (no public source) — both carry provenance labels.</div>

      <h2>Walls list — two takes</h2>
      <ul>
        <li><strong>A · Classic rows</strong> — aspect badge (with a facing tick), score on the right, drying + sun as tags. Reuses the sector-row vocabulary.</li>
        <li><strong>B · Data cards</strong> — a sun-arc viz per wall showing the direct-sun window, plus rock state. For people who plan around sun.</li>
      </ul>

      <h2>Setup flow · 4 steps</h2>
      <ul>
        <li><strong>1 · Name</strong> — crag + wall name.</li>
        <li><strong>2 · Aspect</strong> — three pickers to choose between: a <strong>draggable dial</strong>, a <strong>tap-rose</strong>, and a <strong>terrain suggestion</strong> you confirm.</li>
        <li><strong>3 · Angle</strong> — a slider with a live side-profile that tilts as you drag, + slab/vert/steep/roof presets.</li>
        <li><strong>4 · Review</strong> — every field editable, each with its data source, plus a plain-language first read.</li>
      </ul>

      <h2>Pick a compass</h2>
      <p>I built all three aspect pickers so you can feel them side by side. The dial is the most expressive; the rose is fastest; the terrain suggestion is the least work when confidence is high. They can coexist — suggestion first, manual dial as the fallback.</p>

      <h2>Open questions</h2>
      <ul>
        <li>Eight-way aspect enough, or do you want full degrees?</li>
        <li>Angle: keep it abstract (slab/steep) or commit to degrees as primary?</li>
        <li>Should "first read" copy appear at all, or is that too close to a climbing opinion?</li>
      </ul>
    </div>
  );
}

Object.assign(window, { WallsClassic, WallsCards, SetupName, SetupCompassDial, SetupCompassRose, SetupTerrain, SetupAngle, SetupAngleCave, SetupReview, WallsNotes });
