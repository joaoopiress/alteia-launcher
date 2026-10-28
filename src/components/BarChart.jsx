import { useLayoutEffect, useRef, useState } from 'react';
import { formatDuration, formatHoursAxis, HOUR, MIN } from '../lib/time.js';
import { OTHER_COLOR, OTHER_ID } from '../lib/colors.js';
import { t } from '../lib/i18n.js';

// Escolhe um passo "redondo" para o eixo do tempo.
function niceStep(maxMs) {
  const steps = [15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 5 * HOUR, 10 * HOUR, 20 * HOUR, 25 * HOUR, 50 * HOUR, 100 * HOUR];
  return steps.find((s) => maxMs / s <= 4) || 200 * HOUR;
}

// Arredonda para múltiplos de 2px, para as barras ficarem com arestas de pixel nítidas.
const snap = (v) => Math.round(v / 2) * 2;
const GAP = 2; // espaço entre jogos empilhados na mesma barra

// Agrupa o tempo de cada barra por série: jogos com cor própria e o resto em "Outros jogos".
// Ordem fixa (pela cor do jogo), para cada jogo ficar sempre à mesma altura da pilha.
function segmentsOf(bucket, colors) {
  const acc = new Map();
  for (const [id, ms] of bucket.byGame) {
    const key = colors.has(id) ? id : OTHER_ID;
    acc.set(key, (acc.get(key) || 0) + ms);
  }
  return [...acc.entries()].sort((a, b) => slotOf(a[0], colors) - slotOf(b[0], colors));
}

function slotOf(id, colors) {
  return colors.get(id)?.slot ?? 99;
}

function colorOf(id, colors) {
  return colors.get(id)?.color ?? OTHER_COLOR;
}

// Sem `colors`, desenha uma série única (cor de destaque). Com `colors`, empilha por jogo.
export default function BarChart({ buckets, gameNames, colors, height = 240, emptyText = t('stats.empty') }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nameOf = (id) => (id === OTHER_ID ? t('stats.other') : gameNames.get(id) || id);

  const max = Math.max(0, ...buckets.map((b) => b.value));
  const step = niceStep(max || HOUR);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const padL = 40;
  const padB = 26;
  const padT = 8;
  const plotW = Math.max(10, width - padL);
  const plotH = height - padB - padT;
  const slot = plotW / buckets.length;
  const barW = Math.max(2, Math.min(36, slot - 2 - slot * 0.25));
  const labelEvery = Math.ceil(buckets.length / Math.max(1, Math.floor(plotW / 44)));
  const ticks = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);

  const hb = hover !== null ? buckets[hover] : null;
  const tipLeft = hover !== null ? padL + slot * hover + slot / 2 : 0;

  // Séries presentes no período, para a legenda.
  const legend = [];
  if (colors) {
    const seen = new Set();
    for (const b of buckets) for (const [id] of segmentsOf(b, colors)) seen.add(id);
    legend.push(...[...seen].sort((a, b) => slotOf(a, colors) - slotOf(b, colors)));
  }

  function renderBar(b, i) {
    const x = snap(padL + slot * i + (slot - barW) / 2);
    const w = Math.max(2, snap(barW));
    const base = padT + plotH;
    if (!colors) {
      const h = snap(Math.max((b.value / top) * plotH, 4));
      return (
        <g shapeRendering="crispEdges">
          <rect x={x} y={base - h} width={w} height={h} className="chart-bar" />
          <rect x={x} y={base - h} width={w} height={Math.min(4, h)} className="chart-bar-hi" />
        </g>
      );
    }
    let y = base;
    return (
      <g shapeRendering="crispEdges">
        {segmentsOf(b, colors).map(([id, ms], k) => {
          const h = snap(Math.max((ms / top) * plotH, 2));
          const gap = k === 0 ? 0 : GAP;
          y -= h + gap;
          return (
            <g key={id}>
              <rect x={x} y={y} width={w} height={h} fill={colorOf(id, colors)} />
              <rect x={x} y={y} width={w} height={Math.min(2, h)} className="chart-bar-hi" />
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <div className="chart" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={t('stats.chartAria')}>
        {ticks.map((v) => {
          const y = padT + plotH - (v / top) * plotH;
          return (
            <g key={v}>
              <line x1={padL} x2={width} y1={y} y2={y} className={v === 0 ? 'chart-baseline' : 'chart-grid'} />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="chart-axis-label">
                {formatHoursAxis(v)}
              </text>
            </g>
          );
        })}
        {buckets.map((b, i) => (
          <g key={b.start}>
            {hover === i && <rect x={padL + slot * i} y={padT} width={slot} height={plotH} className="chart-hover-band" />}
            {b.value > 0 && renderBar(b, i)}
            {i % labelEvery === 0 && (
              <text x={padL + slot * i + slot / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">
                {b.label}
              </text>
            )}
            <rect x={padL + slot * i} y={0} width={slot} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
      </svg>
      {max === 0 && <div className="chart-empty">{emptyText}</div>}
      {hb && (
        <div className="chart-tooltip" style={{ left: Math.min(Math.max(tipLeft, 100), width - 100), top: padT }}>
          <div className="chart-tooltip-title">{hb.tip}</div>
          <div className="chart-tooltip-total">{formatDuration(hb.value)}</div>
          {(colors ? segmentsOf(hb, colors) : [...hb.byGame.entries()])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, ms]) => (
              <div key={id} className="chart-tooltip-row">
                <span className="chart-tooltip-name">
                  {colors && <span className="swatch" style={{ background: colorOf(id, colors) }} />}
                  {nameOf(id)}
                </span>
                <span>{formatDuration(ms)}</span>
              </div>
            ))}
        </div>
      )}
      {colors && legend.length > 0 && (
        <ul className="chart-legend">
          {legend.map((id) => (
            <li key={id}>
              <span className="swatch" style={{ background: colorOf(id, colors) }} />
              {nameOf(id)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
