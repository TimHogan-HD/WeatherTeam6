/* walls-screens.jsx — Walls screen + Wall setup flow for Crux Conditions.
   Shared primitives (I, TopBar, BottomNav) come from window. */

const TAU = Math.PI * 2;
const pol = (cx, cy, r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/* ---------- SUN ARC (sunrise→sunset dome w/ sun-on-wall window) ---------- */
function SunArc({ winStart = 0.30, winEnd = 0.74, sunT = 0.52 }) {
  const cx = 48, cy = 48, r = 44;
  const pt = t => { const th = Math.PI * (1 - t); return [cx + r * Math.cos(th), cy - r * Math.sin(th)]; };
  const [bx0, by0] = pt(0), [bx1, by1] = pt(1);
  const [wx0, wy0] = pt(winStart), [wx1, wy1] = pt(winEnd);
  const [sx, sy] = pt(sunT);
  return (
    <div className="sunarc">
      <svg viewBox="0 0 96 56" preserveAspectRatio="xMidYMin meet">
        <path d={`M${bx0} ${by0} A${r} ${r} 0 0 1 ${bx1} ${by1}`} fill="none" stroke="rgba(226,232,240,0.16)" strokeWidth="2" strokeDasharray="2 3" />
        <path d={`M${wx0} ${wy0} A${r} ${r} 0 0 1 ${wx1} ${wy1}`} fill="none" stroke="rgba(253,186,116,0.85)" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="4" y1="48" x2="92" y2="48" stroke="rgba(226,232,240,0.10)" strokeWidth="1" />
        <circle cx={sx} cy={sy} r="6" fill="rgba(253,186,116,1)" />
        <circle cx={sx} cy={sy} r="10" fill="rgba(253,186,116,0.25)" />
      </svg>
      <div className="sa-ends"><span className="sa-end">6:14a</span><span className="sa-end">7:48p</span></div>
    </div>
  );
}

/* ---------- COMPASS DIAL (draggable facing picker) ---------- */
function CompassDial({ bearing = 135, dir = "SE", deg = "135°", cap = "Faces southeast" }) {
  const cx = 109, cy = 109, R = 92;
  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const big = i % 6 === 0;
    const [x1, y1] = pol(cx, cy, R, i * 15);
    const [x2, y2] = pol(cx, cy, R - (big ? 14 : 7), i * 15);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={big ? "rgba(226,232,240,0.4)" : "rgba(226,232,240,0.16)"} strokeWidth={big ? 2 : 1} />);
  }
  const [tipX, tipY] = pol(cx, cy, R - 6, bearing);
  const [lX, lY] = pol(cx, cy, 22, bearing - 90);
  const [rX, rY] = pol(cx, cy, 22, bearing + 90);
  const cards = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
  return (
    <div className="cdial">
      <svg viewBox="0 0 218 218">
        <defs>
          <linearGradient id="wedge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(184,245,66,0.9)" />
            <stop offset="100%" stopColor="rgba(184,245,66,0.12)" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="rgba(255,255,255,0.03)" stroke="rgba(226,232,240,0.14)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={R - 22} fill="none" stroke="rgba(226,232,240,0.07)" strokeWidth="1" />
        {ticks}
        <polygon points={`${tipX},${tipY} ${lX},${lY} ${rX},${rY}`} fill="url(#wedge)" />
        {cards.map(([c, d]) => {
          const [x, y] = pol(cx, cy, R - 30, d);
          return <text key={c} x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={c === "N" ? "rgba(252,129,129,0.9)" : "rgba(226,232,240,0.55)"} fontFamily="Barlow Condensed">{c}</text>;
        })}
        <circle cx={tipX} cy={tipY} r="13" fill="#b8f542" stroke="#0d1117" strokeWidth="4" />
      </svg>
      <div className="cdial-readout">
        <div className="cdial-dir">{dir}</div>
        <div className="cdial-deg">{deg}</div>
        <div className="cdial-cap">{cap}</div>
      </div>
    </div>
  );
}

/* ---------- COMPASS ROSE (tappable 8-way segments) ---------- */
function donutSlice(cx, cy, rO, rI, a0, a1) {
  const [x0o, y0o] = pol(cx, cy, rO, a0), [x1o, y1o] = pol(cx, cy, rO, a1);
  const [x1i, y1i] = pol(cx, cy, rI, a1), [x0i, y0i] = pol(cx, cy, rI, a0);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M${x0o} ${y0o} A${rO} ${rO} 0 ${large} 1 ${x1o} ${y1o} L${x1i} ${y1i} A${rI} ${rI} 0 ${large} 0 ${x0i} ${y0i} Z`;
}
function CompassRose({ active = "SE" }) {
  const cx = 110, cy = 110, rO = 100, rI = 44, gap = 3;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return (
    <div className="rose">
      <svg viewBox="0 0 220 220">
        {dirs.map((d, i) => {
          const c = i * 45;
          const on = d === active;
          const [lx, ly] = pol(cx, cy, (rO + rI) / 2, c);
          return (
            <g key={d}>
              <path d={donutSlice(cx, cy, rO, rI, c - 45 / 2 + gap, c + 45 / 2 - gap)}
                fill={on ? "#b8f542" : "rgba(255,255,255,0.05)"}
                stroke={on ? "none" : "rgba(226,232,240,0.12)"} strokeWidth="1" />
              <text x={lx} y={ly + 5} textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="Barlow Condensed"
                fill={on ? "#0d1117" : (d === "N" ? "rgba(252,129,129,0.85)" : "rgba(226,232,240,0.6)")}>{d}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={rI - 4} fill="rgba(13,17,23,0.6)" stroke="rgba(226,232,240,0.1)" />
      </svg>
      <div className="rose-center">
        <div className="rose-dir">{active}</div>
        <div className="rose-deg">135°</div>
      </div>
    </div>
  );
}

/* ---------- ANGLE SIDE-PROFILE ---------- */
function AngleProfile({ angle = 18 }) {
  // angle from vertical; + = overhang (top leans toward climber on right)
  const W = 280, H = 150, baseX = 116, baseY = 130, L = 108;
  const th = angle * Math.PI / 180;
  const topX = baseX + L * Math.sin(th), topY = baseY - L * Math.cos(th);
  // rock mass polygon (left of the face)
  const rock = `M${baseX} ${baseY} L${topX} ${topY} L0 ${topY - 6} L0 ${baseY} Z`;
  // angle arc from vertical reference to face
  const arc = (() => {
    const r = 34;
    const [ax, ay] = [baseX, baseY - r];
    const [bx, by] = [baseX + r * Math.sin(th), baseY - r * Math.cos(th)];
    return `M${ax} ${ay} A${r} ${r} 0 0 1 ${bx} ${by}`;
  })();
  return (
    <svg className="profile-svg" viewBox={`0 0 ${W} ${H}`} style={{ height: 150 }}>
      {/* ground */}
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.2)" strokeWidth="1.5" />
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.08)" strokeWidth="6" strokeDasharray="1 7" transform="translate(0,5)" />
      {/* rock */}
      <path d={rock} fill="rgba(226,232,240,0.10)" stroke="rgba(226,232,240,0.32)" strokeWidth="2" />
      {/* vertical reference */}
      <line x1={baseX} y1={baseY} x2={baseX} y2={baseY - L} stroke="rgba(99,179,237,0.5)" strokeWidth="1.2" strokeDasharray="4 4" />
      {/* angle arc */}
      <path d={arc} fill="none" stroke="rgba(184,245,66,0.9)" strokeWidth="2" />
      <text x={baseX + 16} y={baseY - 40} fontSize="13" fontWeight="700" fill="#b8f542" fontFamily="Barlow Condensed">{angle}°</text>
      {/* climber dot on the face */}
      <circle cx={(baseX + topX) / 2 + 6} cy={(baseY + topY) / 2} r="5" fill="#f0f4f8" />
      <text x={W - 6} y={baseY - 6} textAnchor="end" fontSize="9" fontWeight="600" fill="rgba(226,232,240,0.4)" fontFamily="Barlow" letterSpacing="1">SIDE VIEW</text>
    </svg>
  );
}

/* ---------- CAVE SIDE-PROFILE ----------
   The extreme end of the angle scale: a deep roof / cave you climb the
   underside of. Γ-shaped rock mass — vertical back wall + a roof slab that
   projects out over the climber and droops toward the lip. */
function CaveProfile({ depthFt = 11 }) {
  const W = 280, H = 150;
  const baseY = 130, ceilY = 56, backX = 60, drop = 22;
  const lipY = ceilY + drop;
  // Γ rock: back-wall column (x 0..backX) + ceiling slab (y 8..ceiling)
  const rock = `M0 ${baseY} L0 8 L${W} 8 L${W} ${lipY} L${backX} ${ceilY} L${backX} ${baseY} Z`;
  // climbing surface = ceiling underside, back → lip
  const underside = `M${backX} ${ceilY} L${W} ${lipY}`;
  // a climber hanging from mid-roof
  const ct = 0.52;
  const cx = backX + ct * (W - backX), cy = ceilY + ct * (lipY - ceilY);
  // texture hatch lines inside the rock mass (terrain-placeholder language)
  const hatch = [];
  for (let i = 0; i < 7; i++) {
    const x = 12 + i * 16;
    hatch.push(<line key={"h" + i} x1={x} y1="14" x2={x + 22} y2="48" stroke="rgba(226,232,240,0.07)" strokeWidth="1" />);
  }
  return (
    <svg className="profile-svg" viewBox={`0 0 ${W} ${H}`} style={{ height: 150 }}>
      {/* ground */}
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.2)" strokeWidth="1.5" />
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.08)" strokeWidth="6" strokeDasharray="1 7" transform="translate(0,5)" />
      {/* rock mass */}
      <path d={rock} fill="rgba(226,232,240,0.10)" stroke="rgba(226,232,240,0.32)" strokeWidth="2" />
      {hatch}
      {/* climbing surface (underside of the roof) */}
      <path d={underside} fill="none" stroke="rgba(184,245,66,0.9)" strokeWidth="2.5" strokeLinecap="round" />
      {/* roof-depth bracket */}
      <line x1={backX} y1={baseY - 8} x2={W - 4} y2={baseY - 8} stroke="rgba(99,179,237,0.5)" strokeWidth="1" strokeDasharray="4 3" />
      <line x1={backX} y1={baseY - 12} x2={backX} y2={baseY - 4} stroke="rgba(99,179,237,0.5)" strokeWidth="1" />
      <line x1={W - 4} y1={baseY - 12} x2={W - 4} y2={baseY - 4} stroke="rgba(99,179,237,0.5)" strokeWidth="1" />
      <text x={(backX + W) / 2} y={baseY - 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(144,205,244,0.95)" fontFamily="Barlow Condensed">≈ {depthFt} ft roof</text>
      {/* hanging climber */}
      <line x1={cx} y1={cy} x2={cx} y2={cy + 14} stroke="#f0f4f8" strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy + 18} r="5" fill="#f0f4f8" />
      <text x={W - 6} y={baseY - 6} textAnchor="end" fontSize="9" fontWeight="600" fill="rgba(226,232,240,0.4)" fontFamily="Barlow" letterSpacing="1">SIDE VIEW</text>
    </svg>
  );
}

Object.assign(window, { SunArc, CompassDial, CompassRose, AngleProfile, CaveProfile });
