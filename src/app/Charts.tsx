/**
 * Bagimsiz SVG grafikleri (grafik kutuphanesi YOK).
 * =================================================
 * Cizgi grafigi, cubuk grafigi ve Campbell diyagrami. Hepsi olceklenebilir
 * SVG; ayri bir bagimlilik eklemeden tam kontrol saglar.
 */

import { useId } from 'react';

export interface Series {
  label: string;
  color: string;
  points: [number, number][];
  /** Kesikli cizgi (ornegin surukleme egrisi). */
  dashed?: boolean;
  /** Sag eksende olceklenir. */
  right?: boolean;
  /** Alan dolgusu. */
  fill?: boolean;
}

interface LineChartProps {
  title: string;
  note?: string;
  series: Series[];
  xLabel: string;
  yLabel: string;
  yLabelRight?: string;
  height?: number;
  /** Dikey imlec cizgisi (mevcut calisma noktasi). */
  marker?: number;
  /** Yatay esik cizgileri. */
  thresholds?: { y: number; label: string; color: string; right?: boolean }[];
  /** Y eksenini 0'dan baslat. */
  yZero?: boolean;
}

const W = 300;
const PAD = { t: 6, r: 30, b: 20, l: 34 };

function extent(vals: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(0);
  if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k';
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  return v.toFixed(2);
}

export function LineChart(props: LineChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const H = props.height ?? 118;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const left = props.series.filter((s) => !s.right);
  const right = props.series.filter((s) => s.right);

  const xs = props.series.flatMap((s) => s.points.map((p) => p[0]));
  const [x0, x1] = extent(xs);

  const lTh = (props.thresholds ?? []).filter((t) => !t.right).map((t) => t.y);
  const rTh = (props.thresholds ?? []).filter((t) => t.right).map((t) => t.y);
  let [yl0, yl1] = extent([...left.flatMap((s) => s.points.map((p) => p[1])), ...lTh]);
  let [yr0, yr1] = extent([...right.flatMap((s) => s.points.map((p) => p[1])), ...rTh]);
  if (props.yZero !== false) {
    yl0 = Math.min(0, yl0);
    yr0 = Math.min(0, yr0);
  }
  // ust bosluk
  yl1 += (yl1 - yl0) * 0.08;
  yr1 += (yr1 - yr0) * 0.08;

  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * iw;
  const syL = (v: number) => PAD.t + ih - ((v - yl0) / (yl1 - yl0 || 1)) * ih;
  const syR = (v: number) => PAD.t + ih - ((v - yr0) / (yr1 - yr0 || 1)) * ih;

  const path = (s: Series) => {
    const sy = s.right ? syR : syL;
    return s.points
      .filter((p) => Number.isFinite(p[1]))
      .map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`)
      .join(' ');
  };

  return (
    <div className="chart">
      <h4>
        {props.title}
        {props.note && <em>{props.note}</em>}
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title}>
        <defs>
          {props.series.map(
            (s, i) =>
              s.fill && (
                <linearGradient key={i} id={`${uid}f${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ),
          )}
        </defs>

        {/* izgara + sol eksen */}
        {niceTicks(yl0, yl1).map((t) => (
          <g key={`gy${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={syL(t)} y2={syL(t)} stroke="#1e2634" strokeWidth="1" />
            <text x={PAD.l - 4} y={syL(t) + 3} textAnchor="end" fontSize="8" fill="#5d6878">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* sag eksen */}
        {right.length > 0 &&
          niceTicks(yr0, yr1).map((t) => (
            <text key={`ry${t}`} x={W - PAD.r + 4} y={syR(t) + 3} fontSize="8" fill="#5d6878">
              {fmt(t)}
            </text>
          ))}
        {/* x eksen */}
        {niceTicks(x0, x1, 4).map((t) => (
          <g key={`gx${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={PAD.t + ih} stroke="#161d28" strokeWidth="1" />
            <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize="8" fill="#5d6878">
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* esikler */}
        {(props.thresholds ?? []).map((t, i) => {
          const y = t.right ? syR(t.y) : syL(t.y);
          return (
            <g key={`t${i}`}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y}
                y2={y}
                stroke={t.color}
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.75"
              />
              <text x={W - PAD.r - 2} y={y - 3} textAnchor="end" fontSize="7.5" fill={t.color}>
                {t.label}
              </text>
            </g>
          );
        })}

        {/* alanlar + cizgiler */}
        {props.series.map((s, i) =>
          s.fill ? (
            <path
              key={`a${i}`}
              d={`${path(s)} L${sx(s.points[s.points.length - 1][0]).toFixed(1)},${(PAD.t + ih).toFixed(1)} L${sx(s.points[0][0]).toFixed(1)},${(PAD.t + ih).toFixed(1)} Z`}
              fill={`url(#${uid}f${i})`}
              stroke="none"
            />
          ) : null,
        )}
        {props.series.map((s, i) => (
          <path
            key={`p${i}`}
            d={path(s)}
            fill="none"
            stroke={s.color}
            strokeWidth="1.7"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 3' : undefined}
          />
        ))}

        {/* calisma noktasi imleci */}
        {props.marker !== undefined && Number.isFinite(props.marker) && (
          <g>
            <line
              x1={sx(props.marker)}
              x2={sx(props.marker)}
              y1={PAD.t}
              y2={PAD.t + ih}
              stroke="#ffb020"
              strokeWidth="1.2"
            />
            <circle cx={sx(props.marker)} cy={PAD.t} r="2.4" fill="#ffb020" />
          </g>
        )}

        {/* eksen adlari */}
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="7.5" fill="#465366">
          {props.xLabel}
        </text>
        <text x={PAD.l - 4} y={PAD.t - 0.5} textAnchor="end" fontSize="7.5" fill="#465366">
          {props.yLabel}
        </text>
        {props.yLabelRight && (
          <text x={W - PAD.r + 4} y={PAD.t - 0.5} fontSize="7.5" fill="#465366">
            {props.yLabelRight}
          </text>
        )}
      </svg>
      <div className="lg">
        {props.series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yatay cubuk grafigi (kutle butcesi, ariza modlari)
// ---------------------------------------------------------------------------

export function BarChart(props: {
  title: string;
  note?: string;
  bars: { label: string; value: number; color?: string; text?: string }[];
  /** Deger logaritmik mi olceklenecek (olasiliklar icin)? */
  log?: boolean;
}) {
  const max = Math.max(...props.bars.map((b) => b.value), 1e-30);
  const min = Math.min(...props.bars.filter((b) => b.value > 0).map((b) => b.value), max);
  const frac = (v: number) => {
    if (!props.log) return Math.max(0, v / max);
    if (v <= 0) return 0;
    const lo = Math.log10(min) - 1;
    return Math.max(0.02, (Math.log10(v) - lo) / (Math.log10(max) - lo));
  };

  return (
    <div className="chart">
      <h4>
        {props.title}
        {props.note && <em>{props.note}</em>}
      </h4>
      <div style={{ paddingBottom: 6 }}>
        {props.bars.map((b) => (
          <div key={b.label} style={{ marginBottom: 5 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10.5,
                marginBottom: 2,
              }}
            >
              <span style={{ color: '#8b97a8' }}>{b.label}</span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  color: b.color ?? '#39a7ff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {b.text ?? b.value.toFixed(2)}
              </span>
            </div>
            <div style={{ height: 4, background: '#1e2634', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(frac(b.value) * 100).toFixed(1)}%`,
                  height: '100%',
                  background: b.color ?? '#39a7ff',
                  borderRadius: 2,
                  transition: 'width .25s',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campbell diyagrami — rezonans haritasi
// ---------------------------------------------------------------------------

export function CampbellChart(props: {
  rpmMax: number;
  /** Kanat modlari: ad + frekans [Hz]. */
  modes: { label: string; freq: number; color: string }[];
  /** Tahrik mertebeleri. */
  orders: { order: number; severity: string }[];
  /** Mevcut devir. */
  rpm: number;
  crossings: { rpm: number; order: number; severity: string }[];
}) {
  const H = 168;
  const P = { t: 8, r: 8, b: 22, l: 34 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const fMax = Math.max(...props.modes.map((m) => m.freq)) * 1.45;
  const rMax = props.rpmMax * 1.04;

  const sx = (rpm: number) => P.l + (rpm / rMax) * iw;
  const sy = (f: number) => P.t + ih - (f / fMax) * ih;

  const sevColor = (s: string) =>
    s === 'yuksek' ? '#ff4d5e' : s === 'orta' ? '#ffb020' : '#5d6878';

  return (
    <div className="chart">
      <h4>
        Campbell diyagrami
        <em>rezonans haritasi</em>
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Campbell diyagrami">
        {niceTicks(0, fMax, 4).map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={sy(f)} y2={sy(f)} stroke="#1e2634" />
            <text x={P.l - 4} y={sy(f) + 3} textAnchor="end" fontSize="8" fill="#5d6878">
              {fmt(f)}
            </text>
          </g>
        ))}
        {niceTicks(0, rMax, 4).map((r) => (
          <text key={r} x={sx(r)} y={H - 8} textAnchor="middle" fontSize="8" fill="#5d6878">
            {fmt(r)}
          </text>
        ))}

        {/* motor mertebesi cizgileri: f = order * rpm / 60 */}
        {props.orders.map((o) => {
          const fAtMax = (o.order * rMax) / 60;
          const rpmAtFMax = (fMax * 60) / o.order;
          const endRpm = Math.min(rMax, rpmAtFMax);
          const endF = Math.min(fMax, fAtMax);
          return (
            <g key={o.order}>
              <line
                x1={sx(0)}
                y1={sy(0)}
                x2={sx(endRpm)}
                y2={sy(endF)}
                stroke={sevColor(o.severity)}
                strokeWidth="0.9"
                opacity="0.6"
              />
              <text
                x={sx(endRpm) - 2}
                y={sy(endF) - 2}
                fontSize="7"
                fill={sevColor(o.severity)}
                textAnchor="end"
              >
                {o.order}E
              </text>
            </g>
          );
        })}

        {/* kanat modlari (yatay) */}
        {props.modes.map((m) => (
          <g key={m.label}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={sy(m.freq)}
              y2={sy(m.freq)}
              stroke={m.color}
              strokeWidth="1.8"
            />
            <text x={P.l + 3} y={sy(m.freq) - 3} fontSize="7.5" fill={m.color}>
              {m.label} {m.freq.toFixed(0)} Hz
            </text>
          </g>
        ))}

        {/* kesismeler */}
        {props.crossings.map((c, i) => (
          <circle
            key={i}
            cx={sx(c.rpm)}
            cy={sy((c.order * c.rpm) / 60)}
            r="2.6"
            fill={sevColor(c.severity)}
            stroke="#0a0d12"
            strokeWidth="0.8"
          />
        ))}

        {/* mevcut devir */}
        <line x1={sx(props.rpm)} x2={sx(props.rpm)} y1={P.t} y2={P.t + ih} stroke="#00d8a7" strokeWidth="1.3" />
        <text x={sx(props.rpm) - 3} y={P.t + 8} fontSize="7.5" fill="#00d8a7" textAnchor="end">
          {props.rpm.toFixed(0)} rpm
        </text>

        {/* kirmizi cizgi */}
        <line
          x1={sx(props.rpmMax)}
          x2={sx(props.rpmMax)}
          y1={P.t}
          y2={P.t + ih}
          stroke="#ff4d5e"
          strokeWidth="1"
          strokeDasharray="3 2"
        />

        <text x={W - P.r} y={H - 8} textAnchor="end" fontSize="7.5" fill="#465366">
          rpm
        </text>
        <text x={P.l - 4} y={P.t - 0.5} textAnchor="end" fontSize="7.5" fill="#465366">
          Hz
        </text>
      </svg>
      <div className="lg">
        <span>
          <i style={{ background: '#ff4d5e' }} />
          yuksek siddet
        </span>
        <span>
          <i style={{ background: '#ffb020' }} />
          orta
        </span>
        <span>
          <i style={{ background: '#5d6878' }} />
          dusuk
        </span>
      </div>
    </div>
  );
}
