/* radar-variations.jsx — four exploratory Radar screens for Crux Conditions.
   Shared primitives come from window (radar-shared.jsx). */

// mini radar frame for the filmstrip — blobs shift across time
function MiniFrame({ shift }) {
  return (
    <div className="film-canvas">
      <div className="rmap-base" />
      <Blob x={`${30 + shift}%`} y="60%" w={34} h={28} kind="mod" />
      <Blob x={`${52 + shift}%`} y="44%" w={22} h={20} kind="heavy" />
      <Blob x={`${14 + shift}%`} y="78%" w={26} h={20} kind="light" />
      <span style={{ position: "absolute", left: "50%", top: "50%", width: 4, height: 4, borderRadius: "50%", background: "#b8f542", transform: "translate(-50%,-50%)" }} />
    </div>
  );
}

/* ============================================================
   A · CLASSIC — full-bleed radar, scrubber docked at the base
   ============================================================ */
function VarA() {
  return (
    <div className="crux-phone">
      <TopBar loc="Macalester–Groveland" time="TUE 1:42 PM" />
      <LayerChips active="Precip" />
      <div className="rmap">
        <div className="rmap-base" /><div className="rmap-grid" />
        <BlobField />
        <Here x="40%" y="62%" />
        <Pin x="58%" y="48%" name="Taylors Falls" tone="fair" />
        <Pin x="74%" y="73%" name="Sandstone" tone="good" />
        <Pin x="22%" y="42%" name="Interstate" />
        <div className="callout" style={{ left: "44%", top: "26%" }}>
          <div className="callout-lbl">Cell · approaching</div>
          <div className="callout-txt">18 mph NE · tops 38k ft · small hail possible</div>
        </div>
        <span className="basemap-tag">Basemap · terrain tiles</span>
      </div>
      <div className="scrub">
        <div className="scrub-head">
          <div className="scrub-frame">1:42 PM <span>· Now</span></div>
          <div className="scrub-status">Loop −2H → +2H · 12 frames</div>
        </div>
        <div className="scrub-main">
          <div className="play-btn"><I n="player-play" /></div>
          <div className="track-wrap">
            <div className="track">
              <div className="track-past" style={{ width: "50%" }} />
              <div className="track-now" style={{ left: "50%" }} />
              <div className="track-handle" style={{ left: "50%" }} />
            </div>
            <div className="ticks">
              <span className="tick">−2H</span><span className="tick">−1H</span>
              <span className="tick now">NOW</span><span className="tick">+1H</span>
              <span className="tick">+2H</span>
            </div>
          </div>
        </div>
        <div className="legend">
          <span className="legend-end">Light</span>
          <span className="legend-bar" />
          <span className="legend-end">Heavy</span>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

/* ============================================================
   B · TIMELINE-FORWARD — map up top, scrub by filmstrip frames,
       layer rail floats over the map
   ============================================================ */
function VarB() {
  const frames = [
    ["−2H", -10], ["−1H", -6], ["−30", -3], ["Now", 0], ["+30", 4], ["+1H", 8], ["+2H", 13], ["+3H", 18],
  ];
  return (
    <div className="crux-phone">
      <TopBar title="Radar" time="MACALESTER–GROVELAND" icon="layers-intersect" />
      <div className="rmap fixed" style={{ height: 322 }}>
        <div className="rmap-base" /><div className="rmap-grid" />
        <BlobField />
        <Here x="38%" y="58%" />
        <Pin x="60%" y="46%" name="Taylors Falls" tone="fair" />
        <Pin x="76%" y="70%" tone="good" />
        <div className="rail">
          {[["droplet", 1], ["temperature", 0], ["wind", 0], ["cloud", 0], ["bolt", 0]].map(([ic, on], i) => (
            <div key={i} className={"rail-btn" + (on ? " active" : "")}><I n={ic} s={17} /></div>
          ))}
        </div>
        <div className="map-readout" style={{ bottom: 12 }}>
          <div className="mr-icon rain"><I n="cloud-rain" /></div>
          <div>
            <div className="mr-big">Rain reaches you 2:58 PM</div>
            <div className="mr-sub">Clears by 4:20 · heaviest 3:10–3:35</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "13px 16px 0" }}>
        <span className="lbl lbl-good">Scrub the loop</span>
        <span className="scrub-status body-font">Swipe frames · −2H → +3H</span>
      </div>
      <div className="filmstrip">
        {frames.map(([t, sh], i) => (
          <div key={t} className={"film" + (t === "Now" ? " active" : "")}>
            <MiniFrame shift={sh} />
            <div className="film-time">{t}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "2px 16px 14px" }}>
        <div className="legend">
          <span className="legend-end">Light</span>
          <span className="legend-bar" />
          <span className="legend-end">Heavy</span>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

/* ============================================================
   C · DATA-FORWARD — ETA dial + full-axis intensity chart,
       map demoted to a strip, layers as segmented control
   ============================================================ */
function VarC() {
  return (
    <div className="crux-phone">
      <TopBar loc="Macalester–Groveland" time="TUE 1:42 PM" />
      <div className="seg">
        {[["droplet", "Precip", 1], ["temperature", "Temp", 0], ["wind", "Wind", 0], ["cloud", "Cloud", 0], ["bolt", "Ltng", 0]].map(([ic, lb, on]) => (
          <div key={lb} className={"seg-item" + (on ? " active" : "")}><I n={ic} s={15} />{lb}</div>
        ))}
      </div>
      <div className="rmap fixed" style={{ height: 150, margin: "12px 20px 0", borderRadius: 10, flex: "none", border: "1px solid var(--line)" }}>
        <div className="rmap-base" /><div className="rmap-grid" />
        <BlobField />
        <Here x="36%" y="60%" />
        <Pin x="60%" y="44%" tone="fair" />
        <span className="basemap-tag">Basemap · terrain tiles</span>
      </div>
      <div style={{ padding: "16px 20px 0" }}>
        <div className="dial-wrap">
          <RingDial value="38" unit="min" cap="Nearest cell · 6.2 mi SW" pct={0.68} />
          <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
            {[["arrow-up-right", "Bearing", "SW → NE"], ["gauge", "Cell speed", "18 mph"], ["ripple", "Peak intensity", "0.95 in/hr"], ["clock", "Clears your area", "4:20 PM"]].map(([ic, k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--rain)", display: "flex", width: 18 }}><I n={ic} s={16} /></span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--txt-1)", lineHeight: 1 }}>{v}</div>
                  <div className="tile-key" style={{ marginTop: 3 }}>{k}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: "16px 20px 0" }}>
        <div className="chart-card">
          <div className="chart-head">
            <span className="lbl">Precip intensity · −2H → +6H</span>
            <span className="scrub-status body-font">in / hr</span>
          </div>
          <IntensityChart w={300} h={88} nowX={0.27} />
          <div className="chart-ticks">
            <span className="tick">−2H</span><span className="tick now">NOW</span>
            <span className="tick">+2H</span><span className="tick">+4H</span><span className="tick">+6H</span>
          </div>
          <div className="track" style={{ marginTop: 10 }}>
            <div className="track-past" style={{ width: "27%" }} />
            <div className="track-handle" style={{ left: "27%" }} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <BottomNav />
    </div>
  );
}

/* ============================================================
   D · CRAG-CENTRIC — range rings around the chosen wall,
       storm-motion vector + sweep scrubber
   ============================================================ */
function VarD() {
  return (
    <div className="crux-phone">
      <TopBar title="Taylors Falls" time="WEST FACE" icon="target" />
      <div className="layers" style={{ paddingTop: 10, paddingBottom: 4 }}>
        {[["droplet", "Precip", 1], ["bolt", "Lightning", 0], ["wind", "Wind", 0], ["cloud", "Cloud", 0]].map(([ic, lb, on]) => (
          <div key={lb} className={"layer-chip" + (on ? " active" : "")}><I n={ic} s={14} />{lb}</div>
        ))}
      </div>
      <div className="rmap">
        <div className="rmap-base" /><div className="rmap-grid" />
        <div className="sweep" style={{ "--sweep-from": "200deg" }} />
        {/* range rings centred on the crag */}
        <div className="ring" style={{ left: "50%", top: "54%", width: 96, height: 96 }} />
        <div className="ring" style={{ left: "50%", top: "54%", width: 184, height: 184 }} />
        <div className="ring" style={{ left: "50%", top: "54%", width: 280, height: 280 }} />
        <span className="ring-lbl" style={{ left: "50%", top: "calc(54% - 48px)" }}>5 mi</span>
        <span className="ring-lbl" style={{ left: "50%", top: "calc(54% - 92px)" }}>10</span>
        <span className="ring-lbl" style={{ left: "50%", top: "calc(54% - 140px)" }}>15</span>
        {/* approaching cells, SW quadrant */}
        <Blob x="26%" y="82%" w={120} h={92} kind="mod" />
        <Blob x="20%" y="92%" w={80} h={64} kind="heavy" />
        <Blob x="34%" y="74%" w={70} h={60} kind="light" />
        {/* storm motion vector pointing at the crag */}
        <div className="vector" style={{ left: "30%", top: "78%", width: 132, transform: "rotate(-40deg)" }} />
        {/* the crag itself */}
        <Pin x="50%" y="54%" name="West Face" tone="good" />
        <span className="basemap-tag">Basemap · terrain tiles</span>
      </div>
      <div className="map-readout" style={{ position: "static", margin: "0 16px", borderRadius: 0, border: "none", borderTop: "1px solid var(--line)", background: "rgba(10,12,16,0.5)", padding: "13px 4px" }}>
        <div className="mr-icon warn"><I n="cloud-storm" /></div>
        <div>
          <div className="mr-big">Cell 11 mi SW · ETA 47 min</div>
          <div className="mr-sub">Tracking 14 mph toward the wall · 0.6 in expected</div>
        </div>
      </div>
      <div className="scrub" style={{ borderTop: "none" }}>
        <div className="scrub-head">
          <div className="scrub-frame">2:29 PM <span>· +47 min</span></div>
          <div className="scrub-status">Storm track · −1H → +3H</div>
        </div>
        <div className="scrub-main">
          <div className="play-btn"><I n="player-play" /></div>
          <div className="track-wrap">
            <div className="track">
              <div className="track-past" style={{ width: "25%", background: "rgba(184,245,66,0.5)" }} />
              <div className="track-now" style={{ left: "25%" }} />
              <div className="track-handle" style={{ left: "63%" }} />
            </div>
            <div className="ticks">
              <span className="tick">−1H</span><span className="tick now">NOW</span>
              <span className="tick">+1H</span><span className="tick" style={{ color: "var(--fair)" }}>ETA</span><span className="tick">+3H</span>
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

/* ---- design rationale card ---- */
function NotesCard() {
  return (
    <div className="notes-card">
      <h1>Radar · explorations</h1>
      <div className="nc-sub">Four takes on the radar screen, all on the locked system — Barlow Condensed, slate→black gradient, corrected contrast tokens (label floor 0.50, cards 0.07 / borders 0.14). Each keeps the bottom nav and a real timeline scrubber. They diverge on <strong>hierarchy</strong> and <strong>data-viz</strong>.</div>

      <h2>Radar intensity ramp</h2>
      <div className="swatches">
        <div className="sw" style={{ background: "rgba(99,179,237,0.55)", color: "#0a0e14" }}>Light</div>
        <div className="sw" style={{ background: "rgba(63,131,248,0.85)", color: "#fff" }}>Mod</div>
        <div className="sw" style={{ background: "rgba(246,173,85,0.85)", color: "#0a0e14" }}>Heavy</div>
        <div className="sw" style={{ background: "rgba(252,129,129,0.92)", color: "#0a0e14" }}>Severe</div>
      </div>
      <p>Rain reads in the system's info-blue; heavy/severe borrow the amber + red accents so intensity ties to the same good/fair/poor language used everywhere else.</p>

      <h2>The four</h2>
      <ul>
        <li><strong>A · Classic</strong> — full-bleed map, crag pins, cell callout, docked scrubber + legend. The by-the-book baseline.</li>
        <li><strong>B · Timeline-forward</strong> — map on top, the loop becomes a tappable filmstrip; layer toggles move to a floating rail. Time is the hero.</li>
        <li><strong>C · Data-forward</strong> — map demoted to a strip; an ETA dial + a full-axis intensity chart (same chart language as Home) carry the screen.</li>
        <li><strong>D · Crag-centric</strong> — recentred on one wall with range rings, a storm-motion vector and ETA-to-the-wall. Answers "when does it hit my crag".</li>
      </ul>

      <h2>Placeholders</h2>
      <p>The map basemap is a styled placeholder (terrain tiles drop in later) — the radar echoes, pins and chrome are real. Icons are inline SVG, so the screens render fully offline with no font/CDN dependency.</p>

      <h2>Open questions</h2>
      <ul>
        <li>Does radar key off current GPS or the selected crag by default?</li>
        <li>Future frames past +2H — model blend or single source?</li>
        <li>Lightning layer — strike dots or cell-level risk shading?</li>
      </ul>
    </div>
  );
}

Object.assign(window, { VarA, VarB, VarC, VarD, NotesCard });
