import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import BarChart from './BarChart.jsx';
import ActivityCalendar from './ActivityCalendar.jsx';
import {
  PLATFORMS,
  DAY,
  fillBuckets,
  formatClock,
  formatDate,
  formatDuration,
  overlap,
  periodRange,
  platformLabel,
  sessionsInRange,
} from '../lib/time.js';
import { gameColorMap, OTHER_COLOR } from '../lib/colors.js';
import { t, tn } from '../lib/i18n.js';

const MODES = ['day', 'week', 'month', 'year', 'all'];

function totalsByGame(sessions, a, b) {
  const map = new Map();
  for (const s of sessions) {
    const o = overlap(s, a, b);
    if (o <= 0) continue;
    const cur = map.get(s.gameId) || { ms: 0, sessions: 0 };
    cur.ms += o;
    cur.sessions += 1;
    map.set(s.gameId, cur);
  }
  return map;
}

export default function Stats({ lib, openDetail }) {
  const [mode, setMode] = useState('week');
  const [offset, setOffset] = useState(0);
  const sessions = useMemo(() => lib.sessions.filter((s) => s.end > s.start), [lib.sessions]);
  const gameById = useMemo(() => new Map(lib.games.map((g) => [g.id, g])), [lib.games]);
  const names = useMemo(() => new Map(lib.games.map((g) => [g.id, g.name])), [lib.games]);
  const colors = useMemo(() => gameColorMap(sessions), [sessions]);

  // Do calendário para a vista "Dia" desse dia.
  function pickDay(ts) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setMode('day');
    setOffset(Math.round((ts - today.getTime()) / DAY));
    document.querySelector('.content')?.scrollTo({ top: 0 });
  }

  const range = useMemo(() => periodRange(mode, offset, sessions), [mode, offset, sessions]);
  const buckets = useMemo(() => fillBuckets(range.buckets, sessions), [range, sessions]);
  const inRange = useMemo(() => sessionsInRange(sessions, range.start, range.end), [sessions, range]);
  const byGame = useMemo(() => totalsByGame(inRange, range.start, range.end), [inRange, range]);

  const total = [...byGame.values()].reduce((s, v) => s + v.ms, 0);
  const ranking = [...byGame.entries()].sort((a, b) => b[1].ms - a[1].ms);
  const top = ranking[0];
  const maxGame = top ? top[1].ms : 0;

  // Comparação com o período anterior. No período atual (ainda a decorrer), compara
  // apenas com a mesma parte do anterior, ex.: segunda a terça desta semana vs. da passada.
  const prev = useMemo(() => {
    if (mode === 'all') return null;
    const p = periodRange(mode, offset - 1, sessions);
    const pEnd = offset === 0 ? Math.min(p.end, p.start + (Date.now() - range.start)) : p.end;
    return sessions.reduce((sum, s) => sum + overlap(s, p.start, pEnd), 0);
  }, [mode, offset, sessions, range]);

  const elapsedEnd = Math.min(range.end, Date.now());
  const days = Math.max(1, Math.ceil((elapsedEnd - range.start) / DAY));
  const activeDays = useMemo(() => {
    if (mode === 'day') return null;
    const set = new Set();
    for (const s of inRange) {
      for (let x = Math.max(s.start, range.start); x < Math.min(s.end, range.end); x += DAY / 2) {
        set.add(new Date(x).toDateString());
      }
      set.add(new Date(Math.min(s.end, range.end) - 1).toDateString());
    }
    return set.size;
  }, [inRange, range, mode]);

  const byPlatform = {};
  for (const [id, v] of byGame) {
    const src = gameById.get(id)?.source || 'manual';
    byPlatform[src] = (byPlatform[src] || 0) + v.ms;
  }
  const platformEntries = Object.keys(PLATFORMS)
    .filter((k) => byPlatform[k] > 0)
    .sort((a, b) => byPlatform[b] - byPlatform[a])
    .map((k) => [k, byPlatform[k]]);
  const maxPlatform = platformEntries[0]?.[1] || 0;

  let delta = null;
  if (prev !== null && prev > 0) delta = Math.round(((total - prev) / prev) * 100);

  const recentSessions = [...inRange].sort((a, b) => b.start - a.start).slice(0, 8);
  const baselineTotal = lib.games.reduce((s, g) => s + (g.hidden ? 0 : g.baselineMinutes), 0) * 60_000;
  const colorOf = (id) => colors.get(id)?.color ?? OTHER_COLOR;

  return (
    <div className="page">
      <div className="stats-head">
        <div className="segmented">
          {MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setOffset(0);
              }}
            >
              {t(`stats.${m}`)}
            </button>
          ))}
        </div>
        {mode !== 'all' && (
          <div className="period-nav">
            <button className="icon-btn" onClick={() => setOffset(offset - 1)} title={t('stats.prev')}>
              <Icon name="chevronLeft" />
            </button>
            <span className="period-title">{range.title}</span>
            <button className="icon-btn" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} title={t('stats.next')}>
              <Icon name="chevronRight" />
            </button>
          </div>
        )}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">{t('stats.playtime')}</div>
          <div className="kpi-value">{formatDuration(total)}</div>
          {delta !== null && (
            <div className="kpi-sub">
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% {t(`stats.vs.${mode}`)}
            </div>
          )}
          {prev === 0 && total > 0 && <div className="kpi-sub">{t(`stats.none.${mode}`)}</div>}
        </div>
        {mode !== 'day' && (
          <div className="kpi">
            <div className="kpi-label">{t('stats.avgDay')}</div>
            <div className="kpi-value">{formatDuration(total / days)}</div>
            <div className="kpi-sub">{tn('stats.activeDays', days, { a: activeDays })}</div>
          </div>
        )}
        <div className="kpi">
          <div className="kpi-label">{t('stats.top')}</div>
          <div className="kpi-value kpi-text">
            {top && <span className="swatch swatch-lg" style={{ background: colorOf(top[0]) }} />}
            {top ? names.get(top[0]) : '—'}
          </div>
          {top && <div className="kpi-sub">{formatDuration(top[1].ms)}</div>}
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('stats.sessions')}</div>
          <div className="kpi-value">{inRange.length}</div>
          {inRange.length > 0 && (
            <div className="kpi-sub">{t('stats.avgSession', { time: formatDuration(total / inRange.length) })}</div>
          )}
        </div>
      </div>

      <div className="panel">
        <BarChart buckets={buckets} gameNames={names} colors={colors} />
      </div>

      <div className="panel calendar-panel">
        <ActivityCalendar sessions={sessions} onPickDay={pickDay} />
      </div>

      <div className="stats-columns">
        <div className="panel">
          <h3 className="sub-title">{t('stats.byGame')}</h3>
          {ranking.length === 0 ? (
            <p className="muted">{t('stats.empty')}</p>
          ) : (
            <ul className="rank-list">
              {ranking.map(([id, v]) => {
                const g = gameById.get(id);
                if (!g) return null;
                return (
                  <li key={id} onClick={() => openDetail(id)}>
                    <div className="rank-thumb" style={{ borderColor: colorOf(id) }}>
                      <Cover game={g} />
                    </div>
                    <div className="rank-main">
                      <div className="rank-line">
                        <span className="rank-name">
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {g.name}
                        </span>
                        <span className="rank-time">{formatDuration(v.ms)}</span>
                      </div>
                      <div className="rank-track">
                        <div className="rank-bar" style={{ width: `${(v.ms / maxGame) * 100}%`, background: colorOf(id) }} />
                      </div>
                      <div className="rank-sub">
                        {t('stats.share', {
                          pct: Math.round((v.ms / total) * 100),
                          sessions: tn('common.sessions', v.sessions),
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="stats-side">
          <div className="panel">
            <h3 className="sub-title">{t('stats.byPlatform')}</h3>
            {platformEntries.length === 0 ? (
              <p className="muted">—</p>
            ) : (
              /* Uma só cor: as cores ficam reservadas aos jogos, para não haver duas legendas a competir. */
              <ul className="platform-list">
                {platformEntries.map(([k, ms]) => (
                  <li key={k}>
                    <div className="rank-line">
                      <span>{platformLabel(k)}</span>
                      <span className="legend-value">
                        {formatDuration(ms)} · {Math.round((ms / total) * 100)}%
                      </span>
                    </div>
                    <div className="rank-track">
                      <div className="rank-bar platform-bar" style={{ width: `${(ms / maxPlatform) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3 className="sub-title">{t('stats.inPeriod')}</h3>
            {recentSessions.length === 0 ? (
              <p className="muted">—</p>
            ) : (
              <ul className="session-list">
                {recentSessions.map((s) => (
                  <li key={s.gameId + s.start}>
                    <span>
                      <span className="session-game">
                        <span className="swatch" style={{ background: colorOf(s.gameId) }} />
                        {names.get(s.gameId) || '?'}
                      </span>
                      <span className="muted">
                        {formatDate(s.start, { day: 'numeric', month: 'short' })}, {formatClock(s.start)}
                      </span>
                    </span>
                    <span className="session-dur">{formatDuration(s.end - s.start)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {mode === 'all' && baselineTotal > 0 && (
        <p className="note">{t('stats.baselineNote', { time: formatDuration(baselineTotal) })}</p>
      )}
    </div>
  );
}
