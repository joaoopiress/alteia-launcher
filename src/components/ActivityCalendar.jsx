import { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { HOUR, MIN, formatDate, formatDuration } from '../lib/time.js';
import { list, t, tn } from '../lib/i18n.js';

const CELL = 13;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 34; // espaço para os dias da semana
const TOP = 18; // espaço para os meses
const TIP_HALF = 115; // metade da largura do tooltip

// Limites dos 5 tons: menos de 30 min, 1 h, 2 h, 4 h e 4 h ou mais.
const LEVELS = [30 * MIN, HOUR, 2 * HOUR, 4 * HOUR];

function levelOf(ms) {
  if (ms <= 0) return 0;
  const i = LEVELS.findIndex((limit) => ms < limit);
  return i === -1 ? 5 : i + 1;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Tempo jogado em cada dia (uma sessão que passa da meia-noite conta em ambos os dias).
function dailyTotals(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (s.end <= s.start) continue;
    for (let d = startOfDay(s.start); d.getTime() < s.end; d.setDate(d.getDate() + 1)) {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const ms = Math.min(s.end, next.getTime()) - Math.max(s.start, d.getTime());
      if (ms > 0) map.set(dayKey(d), (map.get(dayKey(d)) || 0) + ms);
    }
  }
  return map;
}

export default function ActivityCalendar({ sessions, onPickDay }) {
  const thisYear = new Date().getFullYear();
  const firstYear = useMemo(
    () => sessions.reduce((y, s) => Math.min(y, new Date(s.start).getFullYear()), thisYear),
    [sessions, thisYear]
  );
  const [year, setYear] = useState(thisYear);
  const [hover, setHover] = useState(null);
  const boxRef = useRef(null);
  const scrollRef = useRef(null);
  const totals = useMemo(() => dailyTotals(sessions), [sessions]);

  const { cells, months, cols, stats } = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const start = new Date(jan1);
    start.setDate(start.getDate() - ((jan1.getDay() + 6) % 7)); // segunda-feira anterior
    const out = [];
    const monthCols = [];
    let col = 0;
    for (const d = new Date(start); d.getFullYear() <= year; d.setDate(d.getDate() + 1)) {
      const row = (d.getDay() + 6) % 7;
      if (row === 0 && d > start) col++;
      if (d.getFullYear() === year) {
        if (d.getDate() === 1) monthCols.push({ month: d.getMonth(), col });
        out.push({ ts: d.getTime(), row, col, ms: totals.get(dayKey(d)) || 0 });
      }
    }

    // Sequências: a atual conta até hoje (ou até ontem, se ainda não jogaste hoje).
    const today = startOfDay(Date.now()).getTime();
    let best = 0;
    let run = 0;
    let played = 0;
    for (const c of out) {
      if (c.ts > today) break;
      if (c.ms > 0) {
        played++;
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    let streak = 0;
    const d = new Date(today);
    if (!totals.get(dayKey(d))) d.setDate(d.getDate() - 1);
    while (totals.get(dayKey(d)) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return { cells: out, months: monthCols, cols: col + 1, stats: { played, best, streak } };
  }, [year, totals]);

  // O tooltip fica fora da área com scroll (que o cortaria) e é posicionado em relação ao
  // calendário: por baixo do dia nas filas de cima, por cima nas de baixo, sem sair pelos lados.
  function showTip(c) {
    const box = boxRef.current;
    const sc = scrollRef.current;
    if (!box || !sc) return;
    const cellX = sc.offsetLeft + LEFT + c.col * STEP + CELL / 2 - sc.scrollLeft;
    const cellY = sc.offsetTop + TOP + c.row * STEP;
    const below = c.row <= 3;
    const x = Math.min(Math.max(cellX, TIP_HALF), box.clientWidth - TIP_HALF);
    setHover({ ...c, x, y: below ? cellY + CELL + 8 : cellY - 8, below });
  }

  const MONTHS = list('time.months');
  const WEEKDAYS = list('time.weekdays');
  const width = LEFT + cols * STEP;
  const height = TOP + 7 * STEP;
  const todayTs = startOfDay(Date.now()).getTime();

  return (
    <div className="calendar" ref={boxRef}>
      <div className="calendar-head">
        <h3 className="sub-title">{t('cal.title')}</h3>
        <div className="calendar-stats">
          <span>
            {t('cal.daysPlayed')}: <strong>{stats.played}</strong>
          </span>
          {year === thisYear && (
            <span>
              {t('cal.streak')}: <strong>{tn('cal.days', stats.streak)}</strong>
            </span>
          )}
          <span>
            {t('cal.best')}: <strong>{tn('cal.days', stats.best)}</strong>
          </span>
        </div>
        <div className="period-nav">
          <button className="icon-btn" onClick={() => setYear(year - 1)} disabled={year <= firstYear} title={t('cal.prevYear')}>
            <Icon name="chevronLeft" />
          </button>
          <span className="calendar-year">{year}</span>
          <button className="icon-btn" onClick={() => setYear(year + 1)} disabled={year >= thisYear} title={t('cal.nextYear')}>
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      <div className="calendar-scroll" ref={scrollRef} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} shapeRendering="crispEdges" role="img" aria-label={`${t('cal.title')} ${year}`}>
          {months.map((m) => (
            <text key={m.month} x={LEFT + m.col * STEP} y={11} className="chart-axis-label">
              {MONTHS[m.month]}
            </text>
          ))}
          {[0, 2, 4].map((row) => (
            <text key={row} x={0} y={TOP + row * STEP + CELL - 2} className="chart-axis-label">
              {WEEKDAYS[row]}
            </text>
          ))}
          {cells.map((c) => {
            const future = c.ts > todayTs;
            return (
              <rect
                key={c.ts}
                x={LEFT + c.col * STEP}
                y={TOP + c.row * STEP}
                width={CELL}
                height={CELL}
                className={`cal-cell lvl-${levelOf(c.ms)} ${c.ts === todayTs ? 'today' : ''} ${future ? 'future' : ''}`}
                onMouseEnter={() => showTip(c)}
                onClick={() => !future && onPickDay(c.ts)}
              />
            );
          })}
        </svg>
      </div>
      {hover && (
        <div className={`chart-tooltip calendar-tip ${hover.below ? 'below' : 'above'}`} style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tooltip-title">{formatDate(hover.ts, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="chart-tooltip-total">{hover.ms > 0 ? formatDuration(hover.ms) : t('cal.nothing')}</div>
        </div>
      )}

      <div className="calendar-foot">
        <span className="muted">{t('cal.hint')}</span>
        <span className="calendar-legend">
          {t('cal.less')}
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <svg key={l} width={CELL} height={CELL} shapeRendering="crispEdges">
              <rect width={CELL} height={CELL} className={`cal-cell lvl-${l}`} />
            </svg>
          ))}
          {t('cal.more')}
        </span>
      </div>
    </div>
  );
}
