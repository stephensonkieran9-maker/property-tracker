"use client";

interface Point {
  date: string;
  count: number;
}

export default function LineChart({ data }: { data: Point[] }) {
  const W = 960;
  const H = 300;
  const pad = { top: 20, right: 20, bottom: 34, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  if (data.length === 0) {
    return <div className="empty">No history yet — snapshots will appear here.</div>;
  }

  const counts = data.map((d) => d.count);
  const maxY = Math.max(...counts);
  const minY = Math.min(...counts);
  // Pad the y-range a little so the line isn't glued to the edges.
  const top = maxY + Math.max(1, Math.ceil((maxY - minY) * 0.15));
  const bottom = Math.max(0, minY - Math.max(1, Math.ceil((maxY - minY) * 0.15)));
  const range = Math.max(1, top - bottom);

  const x = (i: number) =>
    pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - bottom) / range) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.count).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${x(data.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)} ` +
    `L ${x(0).toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;

  // ~5 horizontal gridlines
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round(bottom + (range * i) / ticks)
  );

  // A handful of evenly spaced date labels
  const labelCount = Math.min(6, data.length);
  const labelIdx = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i / Math.max(1, labelCount - 1)) * (data.length - 1))
  );

  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Property count over time">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#24c083" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#24c083" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border-soft)"
              strokeWidth="1"
            />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke="#16a56f" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Last-point marker */}
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].count)} r="4" fill="#16a56f" />

        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {fmt(data[i].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
