type Props = {
  data: number[]
  width?: number
  height?: number
  color?: string
}

/**
 * Sparkline SVG minimaliste : trace la série `data` (0 = jour le plus ancien).
 * Utilisé pour montrer l'activité audit sur 30 jours dans le dashboard.
 * Aucun tick / label — c'est une microvisualisation, pas un vrai graphique.
 */
export function AuditSparkline({ data, width = 200, height = 42, color = 'var(--brand)' }: Props) {
  if (data.length === 0) return <div style={{ width, height }} />
  const max = Math.max(1, ...data)
  const step = data.length > 1 ? width / (data.length - 1) : width
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ')
  // Zone sous la courbe pour lecture rapide de l'intensité
  const area = `0,${height} ${points} ${width},${height}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polygon points={area} fill={color} opacity={0.15} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(height - (v / max) * height).toFixed(1)} r={1.6} fill={color} />
      ))}
    </svg>
  )
}
