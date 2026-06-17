/* trips-flow.jsx — Trip creation flow for Crux Conditions.
   Chrome (I, SetupShell) + tokens shared via window. SetupShell lives in
   walls-flow.jsx; this file is loaded after it. */

/* ---------- HORIZON confidence-ramp SVG ----------
   Confidence rises as the trip date nears: high near term, decaying out to
   ~14 days where it floors at climatology. Selected window highlighted. */
function HorizonRamp({ selStart = 0.18, selEnd = 0.30 }) {
  const W = 300, H = 96, pad = 4;
  const xx = t => pad + t * (W - pad * 2);
  const conf = t => {
    // t: 0 (today) → 1 (21 days). High→low.
    const v = 0.30 + 0.62 * Math.exp(-3.2 * t);
    return v;
  };
  const yy = v => (H - 16) - v * (H - 26);
  let line = `M ${xx(0)} ${yy(conf(0))}`;
  const N = 40;
  for (let i = 1; i <= N; i++) { const t = i / N; line += ` L ${xx(t)} ${yy(conf(t))}`; }
  const area = line + ` L ${xx(1)} ${H - 4} L ${xx(0)} ${H - 4} Z`;
  return (
    <svg className="horizon-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
      <defs>
        <linearGradient id="confFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(184,245,66,0.45)" />
          <stop offset="100%" stopColor="rgba(184,245,66,0.02)" />
        </linearGradient>
        <linearGradient id="confLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(184,245,66,0.95)" />
          <stop offset="55%" stopColor="rgba(246,173,85,0.9)" />
          <stop offset="100%" stopColor="rgba(226,232,240,0.4)" />
        </linearGradient>
      </defs>
      {/* selected window band */}
      <rect x={xx(selStart)} y="2" width={xx(selEnd) - xx(selStart)} height={H - 6} fill="rgba(184,245,66,0.12)" rx="2" />
      <line x1={xx(selStart)} y1="2" x2={xx(selStart)} y2={H - 4} stroke="rgba(184,245,66,0.5)" strokeWidth="1" />
      <line x1={xx(selEnd)} y1="2" x2={xx(selEnd)} y2={H - 4} stroke="rgba(184,245,66,0.5)" strokeWidth="1" />
      <path d={area} fill="url(#confFill)" />
      <path d={line} fill="none" stroke="url(#confLine)" strokeWidth="2.5" />
      {/* marker at selected midpoint */}
      <circle cx={xx((selStart + selEnd) / 2)} cy={yy(conf((selStart + selEnd) / 2))} r="4" fill="#b8f542" stroke="#0d1117" strokeWidth="2" />
    </svg>
  );
}

/* ---------- confidence-shaded month grid ---------- */
function ConfCalendar() {
  // June 2026; trip selected Jun 12–14. "Today" Jun 1.
  const startDow = 1; // Jun 1 2026 is a Monday → offset
  const days = 30;
  const sel = [12, 13, 14];
  const conf = d => {
    const out = d - 1; // days from today (Jun 1)
    if (out <= 7) return "c-high";
    if (out <= 14) return "c-med";
    return "c-low";
  };
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(<div key={"p" + i} className="cal-cell muted" />);
  for (let d = 1; d <= days; d++) {
    const isSel = sel.includes(d);
    const cls = ["cal-cell", conf(d)];
    if (isSel) cls.push("in-range");
    if (d === sel[0]) cls.push("range-start");
    if (d === sel[sel.length - 1]) cls.push("range-end");
    cells.push(
      <div key={d} className={cls.join(" ")}>
        <span>{d}</span>
        <span className="conf-dot" />
      </div>
    );
  }
  return (
    <>
      <div className="cal-head">
        <div className="cal-month">June 2026</div>
        <div className="cal-nav"><div><I n="chevron-left" s={15} /></div><div><I n="chevron-right" s={15} /></div></div>
      </div>
      <div className="cal-dow">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid">{cells}</div>
      <div className="cal-legend">
        <div className="cal-leg"><span className="d" style={{ background: "var(--good)" }} />Reliable forecast</div>
        <div className="cal-leg"><span className="d" style={{ background: "var(--fair)" }} />Trending</div>
        <div className="cal-leg"><span className="d" style={{ background: "rgba(226,232,240,0.30)" }} />Averages only</div>
      </div>
    </>
  );
}

/* ============================================================
   STEP 1 — destination (multi-select crags)
   ============================================================ */
function TripDest() {
  const crags = [
    { name: "Taylors Falls", meta: "Interstate Park · 1h 12m away", score: 88, tone: "good", sel: true },
    { name: "Red Wing", meta: "Barn Bluff · 52m away", score: 74, tone: "good", sel: true },
    { name: "Sandstone", meta: "Robinson Park · 1h 40m away", score: "?", tone: "unknown", sel: false },
    { name: "Willow River", meta: "WI · 1h 05m away", score: 61, tone: "fair", sel: false },
  ];
  return (
    <SetupShell step={1} total={4} q="Where to?" hint="Pick one or more crags. Each keeps its own forecast and score across the trip dates.">
      <div className="search-bar"><I n="search" s={18} /><span className="ph">Taylors</span><span className="cursor" /></div>
      <div className="chosen">
        <span className="chosen-chip">Taylors Falls<I n="x" s={13} /></span>
        <span className="chosen-chip">Red Wing<I n="x" s={13} /></span>
      </div>
      <div className="lbl res-lbl">Nearby crags</div>
      <div className="crag-pick">
        {crags.map(c => (
          <div className={"crag-opt" + (c.sel ? " sel" : "")} key={c.name}>
            <div className={"pill-score " + c.tone}>{c.score}</div>
            <div className="crag-opt-info">
              <div className="crag-opt-name">{c.name}</div>
              <div className="crag-opt-meta">{c.meta}</div>
            </div>
            <div className="crag-check"><I n="check" s={15} /></div>
          </div>
        ))}
      </div>
    </SetupShell>
  );
}

/* ============================================================
   STEP 2a — dates via confidence-shaded CALENDAR
   ============================================================ */
function TripDatesCalendar() {
  return (
    <SetupShell step={2} total={4} q="When?" hint="Days are shaded by how reliable the forecast is now. Confidence climbs as your trip nears.">
      <ConfCalendar />
    </SetupShell>
  );
}

/* ============================================================
   STEP 2b — dates via HORIZON ramp + suggested windows
   ============================================================ */
function TripDatesHorizon() {
  const wins = [
    { dates: "Jun 5 – 7", out: "4 days out · Fri–Sun", lvl: "High", tone: "good" },
    { dates: "Jun 12 – 14", out: "11 days out · Fri–Sun", lvl: "Medium", tone: "fair", sel: true },
    { dates: "Jun 19 – 22", out: "18 days out · Fri–Mon", lvl: "Low", tone: "low" },
  ];
  return (
    <SetupShell step={2} total={4} q="When?" hint="The line is how confident the forecast is over the next three weeks — it decays the further out you plan.">
      <div className="horizon">
        <HorizonRamp selStart={0.50} selEnd={0.66} />
        <div className="horizon-scale">
          <span>TODAY</span><span>+7d</span><span>+14d</span><span>+21d</span>
        </div>
      </div>
      <div className="lbl res-lbl" style={{ marginTop: 22 }}>Weekend windows</div>
      <div className="hz-windows">
        {wins.map(w => (
          <div className={"hz-win" + (w.sel ? " sel" : "")} key={w.dates}>
            <div className="hz-when">
              <div className="hz-dates">{w.dates}</div>
              <div className="hz-out">{w.out}</div>
            </div>
            <div className="hz-conf">
              <div className={"v " + w.tone}>{w.lvl}</div>
              <div className="k">Confidence</div>
            </div>
          </div>
        ))}
      </div>
    </SetupShell>
  );
}

/* ============================================================
   STEP 3 — name the trip
   ============================================================ */
function TripName() {
  return (
    <SetupShell step={3} total={4} q="Name this trip" hint="Optional — we'll default to the dates if you skip it." footLabel="Continue">
      <div className="field">
        <div className="field-lbl">Trip name</div>
        <div className="field-input">Father's Day Weekend<span className="cursor" /></div>
      </div>
      <div className="trip-summary" style={{ marginTop: 22, padding: "0 2px" }}>
        <div className="lbl">So far</div>
        <div className="ts-meta" style={{ marginTop: 8 }}>Taylors Falls + Red Wing · Jun 12–14 · 3 days · 11 days out</div>
      </div>
      <div className="chosen" style={{ marginTop: 16 }}>
        <span className="chosen-chip" style={{ background: "var(--card)", borderColor: "var(--line)", color: "var(--txt-2)" }}><I n="map-pin" s={13} />2 crags</span>
        <span className="chosen-chip" style={{ background: "var(--card)", borderColor: "var(--line)", color: "var(--txt-2)" }}><I n="calendar" s={13} />Jun 12–14</span>
      </div>
    </SetupShell>
  );
}

/* ============================================================
   STEP 4 — review + confidence preview + data availability
   ============================================================ */
function TripReview() {
  const foot = <div className="btn btn-primary"><I n="check" s={16} />Create trip</div>;
  const avail = [
    { k: "NWS point forecast", v: "Hourly through Jun 8", on: true, stat: "Live" },
    { k: "HRRR / ensemble", v: "Available within 48 h of trip", on: false, stat: "Soon" },
    { k: "Climatology", v: "30-yr ACIS averages for mid-June", on: true, stat: "Now" },
  ];
  return (
    <SetupShell step={4} total={4} q="Review" hint="" foot={foot}>
      <div className="trip-summary">
        <div className="ts-name">Father's Day Weekend</div>
        <div className="ts-meta">Taylors Falls + Red Wing · Fri Jun 12 – Sun Jun 14 · 3 days</div>
      </div>
      <div className="conf-hero">
        <div className="ch-top">
          <div className="ch-pct" style={{ color: "var(--fair)" }}>54%</div>
          <div className="ch-lvl">Medium · 11 days out</div>
        </div>
        <div className="ch-track"><div className="ch-fill" style={{ width: "54%", background: "var(--fair)" }} /></div>
        <div className="ch-note">Models broadly agree on a dry weekend, but it's early — the signal firms up inside a week.</div>
        <div className="ch-rebuild"><I n="trending-up" s={15} />Check back Jun 9 — confidence should reach High.</div>
      </div>
      <div className="lbl" style={{ marginTop: 20 }}>Data feeding this trip</div>
      <div className="avail">
        {avail.map(a => (
          <div className="avail-row" key={a.k}>
            <div className={"avail-ic " + (a.on ? "on" : "off")}><I n={a.on ? "check" : "clock"} s={16} /></div>
            <div className="avail-info">
              <div className="avail-k">{a.k}</div>
              <div className="avail-v">{a.v}</div>
            </div>
            <div className={"avail-stat " + (a.on ? "on" : "off")}>{a.stat}</div>
          </div>
        ))}
      </div>
    </SetupShell>
  );
}

/* ---------- notes ---------- */
function TripNotes() {
  return (
    <div className="notes-card">
      <h1>Trip creation</h1>
      <div className="nc-sub">A 4-step flow to spin up a trip. The whole thing is built around the app's core idea — <strong>confidence builds as the date nears</strong> — so forecast reliability is visible from the first tap, not buried at the end.</div>

      <h2>The flow</h2>
      <ul>
        <li><strong>1 · Where</strong> — search + multi-select crags, each showing its current score (or "?" when out of forecast range).</li>
        <li><strong>2 · When</strong> — shown two ways (pick one).</li>
        <li><strong>3 · Name</strong> — optional, with a running summary.</li>
        <li><strong>4 · Review</strong> — a confidence preview + exactly which data sources feed the trip right now.</li>
      </ul>

      <h2>Two date pickers</h2>
      <ul>
        <li><strong>A · Confidence calendar</strong> — a normal month grid, but each day is shaded by forecast reliability (reliable / trending / averages-only). You see the trade-off as you pick.</li>
        <li><strong>B · Horizon ramp</strong> — a curve of confidence decaying over 21 days, with ready-made weekend windows ranked by reliability. Faster for "when's my best shot soon?"</li>
      </ul>

      <h2>Why surface confidence early</h2>
      <p>Locked decisions: no climbing opinions, plain language, score is never the headline. So the flow leads with <strong>weather reliability</strong>, quotes data sources by name, and tells you when to check back — never "go / don't go".</p>

      <h2>Open questions</h2>
      <ul>
        <li>Calendar vs horizon — or keep both as a toggle?</li>
        <li>Should "weekend windows" be auto-suggested, or only show what the user picks?</li>
        <li>Multi-crag trips — one blended confidence, or per-crag?</li>
      </ul>
    </div>
  );
}

Object.assign(window, { TripDest, TripDatesCalendar, TripDatesHorizon, TripName, TripReview, TripNotes, HorizonRamp, ConfCalendar });
