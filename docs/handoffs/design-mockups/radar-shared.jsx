/* radar-shared.jsx — shared primitives for the Crux radar explorations.
   Exports to window: I, TopBar, BottomNav, LayerChips, Blob, Pin, Here,
   RingDial, IntensityChart, BlobField. */

// Inline SVG icon set (functional UI glyphs — reliable + bundle-safe).
const ICONS = {
  "menu-2": <><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></>,
  "droplet": <path d="M12 3.5 C12 3.5 6 10 6 14 a6 6 0 0 0 12 0 C18 10 12 3.5 12 3.5 Z"/>,
  "temperature": <><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z"/><line x1="12" y1="9" x2="12" y2="15"/></>,
  "wind": <><path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 16h13a2.5 2.5 0 1 1-2.5 2.5"/><line x1="3" y1="12" x2="13" y2="12"/></>,
  "cloud": <path d="M7 18h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 18Z"/>,
  "bolt": <path d="M13 3 5 13h5l-1 8 8-11h-5l1-7Z"/>,
  "home": <><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></>,
  "map-pin": <><path d="M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/></>,
  "calendar": <><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="9" y1="3" x2="9" y2="6"/><line x1="15" y1="3" x2="15" y2="6"/></>,
  "radar-2": <><path d="M12 12 19 7"/><path d="M5.5 18.5a9 9 0 1 1 13 0"/><path d="M8.5 15.5a5 5 0 1 1 7 0"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></>,
  "layers-intersect": <><rect x="4" y="4" width="11" height="11" rx="1.5"/><rect x="9" y="9" width="11" height="11" rx="1.5"/></>,
  "target": <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  "cloud-rain": <><path d="M7 15h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 15Z"/><line x1="9" y1="18" x2="8" y2="21"/><line x1="13" y1="18" x2="12" y2="21"/><line x1="17" y1="18" x2="16" y2="21"/></>,
  "cloud-storm": <><path d="M7 14h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 14Z"/><path d="M12 16l-2 3h3l-2 3"/></>,
  "player-play": <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none"/>,
  "arrow-up-right": <><line x1="7" y1="17" x2="17" y2="7"/><path d="M9 7h8v8"/></>,
  "gauge": <><path d="M5 17a8 8 0 1 1 14 0"/><line x1="12" y1="14" x2="15.5" y2="9.5"/><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none"/></>,
  "ripple": <><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></>,
  "clock": <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
  "mountain": <path d="M4 19 10 7l3.5 6 2-3L20 19Z"/>,
  "chevron-right": <path d="M9 6l6 6-6 6"/>,
  "chevron-left": <path d="M15 6l-6 6 6 6"/>,
  "plus": <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  "check": <path d="M5 12l5 5L19 7"/>,
  "x": <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>,
  "sun": <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></>,
  "sunrise": <><path d="M12 3v5M9 6l3-3 3 3"/><path d="M3 15h2M19 15h2M5.6 9.6 7 11M17 11l1.4-1.4"/><path d="M5 18h14"/><path d="M8 15a4 4 0 0 1 8 0"/></>,
  "compass": <><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5 11 11l-1.5 3.5L13 13Z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  "edit": <><path d="M5 19h3l9-9-3-3-9 9Z"/><path d="M14 7l3 3"/></>,
  "info-circle": <><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></>,
  "current-location": <><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></>,
  "search": <><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/></>,
  "calendar-plus": <><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="9" y1="3" x2="9" y2="6"/><line x1="15" y1="3" x2="15" y2="6"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></>,
  "trending-up": <><path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/></>,
  "arrow-right": <><line x1="4" y1="12" x2="20" y2="12"/><path d="M14 6l6 6-6 6"/></>,
  "dots-vertical": <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></>,
  "file-text": <><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>,
  "droplet-half": <><path d="M12 3.5 C12 3.5 6 10 6 14 a6 6 0 0 0 12 0 C18 10 12 3.5 12 3.5 Z"/><path d="M12 6v14" strokeDasharray="2 2"/></>,
  "history": <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></>,
};
const I = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: "block", flexShrink: 0 }}>
    {ICONS[n] || null}
  </svg>
);

// ---- top bar ----
function TopBar({ loc, title, time, icon = "menu-2" }) {
  return (
    <div className="topbar">
      {title
        ? <div className="tb-title">{title}</div>
        : <div className="tb-loc"><span className="tb-dot" />{loc}</div>}
      <div className="tb-right">
        {time && <div className="tb-time">{time}</div>}
        <span className="tb-icon" style={{ display: "flex" }}><I n={icon} s={20} /></span>
      </div>
    </div>
  );
}

// ---- bottom nav ----
function BottomNav({ active = 3 }) {
  const items = [
    ["home", "Home"], ["map-pin", "Crags"], ["calendar", "Trips"], ["radar-2", "Radar"],
  ];
  return (
    <div className="bnav">
      {items.map(([ic, lb], i) => (
        <div key={lb} className={"bnav-item" + (i === active ? " active" : "")}>
          <span className="bnav-ic" style={{ display: "flex" }}><I n={ic} s={21} /></span>
          <div className="bnav-lbl">{lb}</div>
        </div>
      ))}
    </div>
  );
}

// ---- horizontal layer toggle chips ----
const LAYERS = [
  ["droplet", "Precip"], ["temperature", "Temp"], ["wind", "Wind"],
  ["cloud", "Cloud"], ["bolt", "Lightning"],
];
function LayerChips({ active = "Precip" }) {
  return (
    <div className="layers">
      {LAYERS.map(([ic, lb]) => (
        <div key={lb} className={"layer-chip" + (lb === active ? " active" : "")}>
          <I n={ic} s={14} />{lb}
        </div>
      ))}
    </div>
  );
}

// ---- radar primitives ----
function Blob({ x, y, w, h, kind }) {
  return <div className={"rblob " + kind} style={{ left: x, top: y, width: w, height: h || w }} />;
}
function Pin({ x, y, name, tone }) {
  return (
    <div className="pin" style={{ left: x, top: y }}>
      <span className={"pin-dot" + (tone ? " " + tone : "")} />
      {name && <span className="pin-chip">{name}</span>}
    </div>
  );
}
function Here({ x, y }) {
  return (
    <div className="here" style={{ left: x, top: y }}>
      <span className="here-ring" /><span className="here-core" />
    </div>
  );
}

// ---- a field of precip echoes (reused across variations) ----
function BlobField() {
  return (
    <>
      <Blob x="18%" y="78%" w={120} h={90} kind="light" />
      <Blob x="34%" y="64%" w={150} h={110} kind="mod" />
      <Blob x="46%" y="56%" w={90} h={80} kind="heavy" />
      <Blob x="58%" y="48%" w={64} h={58} kind="severe" />
      <Blob x="72%" y="40%" w={130} h={95} kind="light" />
      <Blob x="86%" y="30%" w={80} h={70} kind="trace" />
      <Blob x="26%" y="90%" w={70} h={55} kind="trace" />
    </>
  );
}

// ---- radial ETA dial (SVG arc) ----
function RingDial({ value, unit, cap, pct = 0.62, tone = "rgba(99,179,237,0.9)" }) {
  const r = 56, c = 2 * Math.PI * r, off = c * (1 - pct);
  return (
    <div className="dial">
      <svg viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(226,232,240,0.10)" strokeWidth="9" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={tone} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="dial-center">
        <div className="dial-num">{value}</div>
        <div className="dial-unit">{unit}</div>
        {cap && <div className="dial-cap">{cap}</div>}
      </div>
    </div>
  );
}

// ---- precip intensity area chart, fills full time axis (no gaps) ----
function IntensityChart({ w = 300, h = 92, nowX = 0.32 }) {
  // intensity samples across full axis (−2h … +6h)
  const pts = [0.04, 0.02, 0.0, 0.0, 0.06, 0.18, 0.42, 0.7, 0.95, 0.78, 0.5, 0.62, 0.84, 0.55, 0.3, 0.16, 0.08, 0.03];
  const n = pts.length, pad = 4;
  const xx = i => pad + (i / (n - 1)) * (w - pad * 2);
  const yy = v => (h - 14) - v * (h - 22);
  let d = `M ${xx(0)} ${yy(pts[0])}`;
  for (let i = 1; i < n; i++) {
    const xc = (xx(i - 1) + xx(i)) / 2;
    d += ` C ${xc} ${yy(pts[i - 1])} ${xc} ${yy(pts[i])} ${xx(i)} ${yy(pts[i])}`;
  }
  const area = d + ` L ${xx(n - 1)} ${h - 4} L ${xx(0)} ${h - 4} Z`;
  const nowPx = pad + nowX * (w - pad * 2);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <defs>
        <linearGradient id="precipFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,179,237,0.55)" />
          <stop offset="100%" stopColor="rgba(99,179,237,0.02)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#precipFill)" />
      <path d={d} fill="none" stroke="rgba(144,205,244,0.95)" strokeWidth="2" />
      <line x1={nowPx} y1="2" x2={nowPx} y2={h - 4} stroke="rgba(226,232,240,0.5)" strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  );
}

Object.assign(window, { I, TopBar, BottomNav, LayerChips, Blob, Pin, Here, BlobField, RingDial, IntensityChart });
