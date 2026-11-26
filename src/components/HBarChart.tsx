// Horizontal bar chart in plain HTML. Thin bars (20 px), a 4 px rounded data-end,
// a 2 px surface gap between stacked segments, the total at the bar tip, a legend
// for 2+ series, a hover/focus tooltip on each row, and a table view.

export interface BarSeries {
  key: string
  label: string
  /** CSS custom property name holding the series color, e.g. "--viz-1". */
  colorVar: string
}

export interface BarRow {
  label: string
  values: Record<string, number>
}

interface Props {
  title: string
  series: BarSeries[]
  rows: BarRow[]
  /** Noun for the tooltip and table total, e.g. "requests". */
  unit: string
}

export function HBarChart({ title, series, rows, unit }: Props) {
  const totals = rows.map((r) => series.reduce((sum, s) => sum + (r.values[s.key] ?? 0), 0))
  const max = Math.max(1, ...totals)

  return (
    <figure className="hbar">
      {series.length > 1 && (
        <ul className="legend" aria-label={`${title} legend`}>
          {series.map((s) => (
            <li key={s.key}>
              <span className="swatch" style={{ background: `var(${s.colorVar})` }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <ul className="hbar-rows">
        {rows.map((row, i) => {
          const parts = series.map((s) => ({ ...s, value: row.values[s.key] ?? 0 })).filter((p) => p.value > 0)
          const description = `${row.label}: ${series.map((s) => `${row.values[s.key] ?? 0} ${s.label.toLowerCase()}`).join(', ')}`
          return (
            <li key={row.label} className="hbar-row" tabIndex={0} aria-label={series.length > 1 ? description : `${row.label}: ${totals[i]} ${unit}`}>
              <span className="hbar-label">{row.label}</span>
              <span className="hbar-track">
                <span className="hbar-bar" style={{ width: `${(totals[i] / max) * 100}%` }}>
                  {parts.map((p) => (
                    <span key={p.key} className="hbar-seg" style={{ flexGrow: p.value, background: `var(${p.colorVar})` }} />
                  ))}
                </span>
                <span className="hbar-value mono">{totals[i]}</span>
              </span>
              <span className="tooltip" role="presentation">
                <strong>{row.label}</strong>
                {series.map((s) => (
                  <span key={s.key} className="tooltip-line">
                    <span className="swatch" style={{ background: `var(${s.colorVar})` }} aria-hidden="true" />
                    {s.label} <span className="mono">{row.values[s.key] ?? 0}</span>
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>

      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">{title.split(' by ')[1] ?? 'Item'}</th>
                {series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}
                {series.length > 1 && <th scope="col">Total</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {series.map((s) => <td key={s.key} className="mono">{row.values[s.key] ?? 0}</td>)}
                  {series.length > 1 && <td className="mono">{totals[i]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
