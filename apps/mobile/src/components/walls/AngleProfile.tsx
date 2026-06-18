import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg'

type Props = {
  angle: number // degrees past vertical; 0=vertical, positive=overhang, negative=slab
}

function AngleOverhang({ angle }: { angle: number }) {
  const W = 280, H = 150, baseX = 116, baseY = 130, L = 108
  const th = (angle * Math.PI) / 180
  const topX = baseX + L * Math.sin(th)
  const topY = baseY - L * Math.cos(th)
  const rock = `M${baseX} ${baseY} L${topX} ${topY} L0 ${topY - 6} L0 ${baseY} Z`

  // Angle arc from vertical
  const r = 34
  const ax = baseX, ay = baseY - r
  const bx = baseX + r * Math.sin(th), by = baseY - r * Math.cos(th)
  const arc = `M${ax} ${ay} A${r} ${r} 0 0 1 ${bx} ${by}`

  const climberX = (baseX + topX) / 2 + 6
  const climberY = (baseY + topY) / 2

  return (
    <Svg width="100%" height={150} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={0} y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.2)" strokeWidth={1.5} />
      <Path d={rock} fill="rgba(226,232,240,0.10)" stroke="rgba(226,232,240,0.32)" strokeWidth={2} />
      <Line
        x1={baseX} y1={baseY} x2={baseX} y2={baseY - L}
        stroke="rgba(99,179,237,0.5)" strokeWidth={1.2} strokeDasharray="4,4"
      />
      <Path d={arc} fill="none" stroke="rgba(184,245,66,0.9)" strokeWidth={2} />
      <SvgText
        x={baseX + 16} y={baseY - 40}
        fontSize={13} fontWeight="700" fill="#b8f542" fontFamily="BarlowCondensed"
      >
        {Math.abs(angle)}°
      </SvgText>
      <Circle cx={climberX} cy={climberY} r={5} fill="#f0f4f8" />
      <SvgText
        x={W - 6} y={baseY - 6}
        textAnchor="end" fontSize={9} fontWeight="600" fill="rgba(226,232,240,0.4)" fontFamily="Barlow"
      >
        SIDE VIEW
      </SvgText>
    </Svg>
  )
}

function CaveProfile({ depthFt = 11 }: { depthFt?: number }) {
  const W = 280, H = 150
  const baseY = 130, ceilY = 56, backX = 60, drop = 22
  const lipY = ceilY + drop
  const rock = `M0 ${baseY} L0 8 L${W} 8 L${W} ${lipY} L${backX} ${ceilY} L${backX} ${baseY} Z`
  const underside = `M${backX} ${ceilY} L${W} ${lipY}`

  const ct = 0.52
  const cx = backX + ct * (W - backX), cy = ceilY + ct * (lipY - ceilY)

  return (
    <Svg width="100%" height={150} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={0} y1={baseY} x2={W} y2={baseY} stroke="rgba(226,232,240,0.2)" strokeWidth={1.5} />
      <Path d={rock} fill="rgba(226,232,240,0.10)" stroke="rgba(226,232,240,0.32)" strokeWidth={2} />
      <Path d={underside} fill="none" stroke="rgba(184,245,66,0.9)" strokeWidth={2.5} strokeLinecap="round" />
      <Line
        x1={backX} y1={baseY - 8} x2={W - 4} y2={baseY - 8}
        stroke="rgba(99,179,237,0.5)" strokeWidth={1} strokeDasharray="4,3"
      />
      <Line x1={backX} y1={baseY - 12} x2={backX} y2={baseY - 4} stroke="rgba(99,179,237,0.5)" strokeWidth={1} />
      <Line x1={W - 4} y1={baseY - 12} x2={W - 4} y2={baseY - 4} stroke="rgba(99,179,237,0.5)" strokeWidth={1} />
      <SvgText
        x={(backX + W) / 2} y={baseY - 14}
        textAnchor="middle" fontSize={10} fontWeight="700" fill="rgba(144,205,244,0.95)" fontFamily="BarlowCondensed"
      >
        ≈ {depthFt} ft roof
      </SvgText>
      <Line x1={cx} y1={cy} x2={cx} y2={cy + 14} stroke="#f0f4f8" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={cx} cy={cy + 18} r={5} fill="#f0f4f8" />
      <SvgText
        x={W - 6} y={baseY - 6}
        textAnchor="end" fontSize={9} fontWeight="600" fill="rgba(226,232,240,0.4)" fontFamily="Barlow"
      >
        SIDE VIEW
      </SvgText>
    </Svg>
  )
}

export function AngleProfile({ angle }: Props) {
  if (angle > 80) {
    // Estimate depth from angle: 90° = ~15ft, 80° = ~6ft
    const depthFt = Math.round(((angle - 80) / 10) * 9 + 6)
    return <CaveProfile depthFt={depthFt} />
  }
  return <AngleOverhang angle={angle} />
}
