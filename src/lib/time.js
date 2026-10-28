// Formatação de tempo e cálculo de estatísticas a partir das sessões registadas.
import { t, list, locale } from './i18n.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const PLATFORMS = {
  steam: { color: '#3987e5' },
  epic: { color: '#d95926' },
  riot: { color: '#199e70' },
  manual: { color: '#c98500' },
};

export function platformLabel(source) {
  return t(`platform.${source}`);
}

export function formatDuration(ms, { short = false } = {}) {
  const totalMin = Math.round(ms / MIN);
  if (totalMin < 1) return ms > 0 ? '< 1 min' : '0 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (h >= 100 || short || m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatHoursAxis(ms) {
  const h = ms / HOUR;
  if (h === 0) return '0';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export function relativeTime(ts) {
  if (!ts) return t('time.never');
  const diff = Date.now() - ts;
  if (diff < 2 * MIN) return t('time.justNow');
  if (diff < HOUR) return t('time.minAgo', { n: Math.floor(diff / MIN) });
  const today = startOfDay(new Date());
  if (ts >= today.getTime()) return t('time.todayAt', { time: formatClock(ts) });
  if (ts >= today.getTime() - DAY) return t('time.yesterday');
  const days = Math.floor((today.getTime() - ts) / DAY) + 1;
  if (days < 7) return t('time.daysAgo', { n: days });
  return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatClock(ts) {
  return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts, opts) {
  return new Date(ts).toLocaleDateString(locale(), opts);
}

export function formatBytes(bytes) {
  if (!bytes) return '—';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // segunda-feira = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export function overlap(s, a, b) {
  return Math.max(0, Math.min(s.end, b) - Math.max(s.start, a));
}

// Tempo total e última sessão de cada jogo.
export function perGameTotals(games, sessions) {
  const map = new Map(games.map((g) => [g.id, { tracked: 0, lastPlayed: g.baselineLastPlayed || 0, sessions: 0 }]));
  for (const s of sessions) {
    const entry = map.get(s.gameId);
    if (!entry) continue;
    entry.tracked += s.end - s.start;
    entry.sessions += 1;
    if (s.end > entry.lastPlayed) entry.lastPlayed = s.end;
  }
  for (const g of games) {
    const entry = map.get(g.id);
    entry.total = entry.tracked + g.baselineMinutes * MIN;
  }
  return map;
}


// Devolve o intervalo do período (com deslocamento para trás/frente) e as suas barras.
export function periodRange(mode, offset, sessions) {
  const now = new Date();
  let start;
  let end;
  let title;
  const buckets = [];
  const MONTHS = list('time.months');
  const WEEKDAYS = list('time.weekdays');
  const L = locale();

  if (mode === 'day') {
    start = startOfDay(now);
    start.setDate(start.getDate() + offset);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
    title =
      offset === 0
        ? t('time.today')
        : offset === -1
          ? t('time.yesterday')
          : start.toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long' });
    for (let h = 0; h < 24; h++) {
      const a = new Date(start);
      a.setHours(h);
      const b = new Date(start);
      b.setHours(h + 1);
      buckets.push({ start: a.getTime(), end: b.getTime(), label: `${h}h`, tip: `${h}:00 – ${h + 1}:00` });
    }
  } else if (mode === 'week') {
    start = startOfWeek(now);
    start.setDate(start.getDate() + offset * 7);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    const last = new Date(end.getTime() - DAY);
    title =
      offset === 0
        ? t('time.thisWeek')
        : `${start.toLocaleDateString(L, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(L, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    for (let i = 0; i < 7; i++) {
      const a = new Date(start);
      a.setDate(a.getDate() + i);
      const b = new Date(a);
      b.setDate(b.getDate() + 1);
      buckets.push({
        start: a.getTime(),
        end: b.getTime(),
        label: `${WEEKDAYS[i]} ${a.getDate()}`,
        tip: a.toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long' }),
      });
    }
  } else if (mode === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    title = start.toLocaleDateString(L, { month: 'long', year: 'numeric' });
    for (let a = new Date(start); a < end; a.setDate(a.getDate() + 1)) {
      const b = new Date(a);
      b.setDate(b.getDate() + 1);
      buckets.push({
        start: a.getTime(),
        end: b.getTime(),
        label: String(a.getDate()),
        tip: a.toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long' }),
      });
    }
  } else if (mode === 'year') {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear() + 1, 0, 1);
    title = String(start.getFullYear());
    for (let m = 0; m < 12; m++) {
      const a = new Date(start.getFullYear(), m, 1);
      const b = new Date(start.getFullYear(), m + 1, 1);
      buckets.push({ start: a.getTime(), end: b.getTime(), label: MONTHS[m], tip: a.toLocaleDateString(L, { month: 'long', year: 'numeric' }) });
    }
  } else {
    const first = sessions.reduce((min, s) => Math.min(min, s.start), Date.now());
    start = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    title = t('time.allTime');
    for (let a = new Date(start); a < end; a = new Date(a.getFullYear(), a.getMonth() + 1, 1)) {
      const b = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      buckets.push({
        start: a.getTime(),
        end: b.getTime(),
        label: `${MONTHS[a.getMonth()]}${a.getMonth() === 0 || buckets.length === 0 ? ' ' + String(a.getFullYear()).slice(2) : ''}`,
        tip: a.toLocaleDateString(L, { month: 'long', year: 'numeric' }),
      });
    }
  }
  return { start: start.getTime(), end: end.getTime(), title, buckets };
}

// Soma o tempo de cada barra e o detalhe por jogo dentro dela.
export function fillBuckets(buckets, sessions) {
  return buckets.map((b) => {
    const byGame = new Map();
    let value = 0;
    for (const s of sessions) {
      const o = overlap(s, b.start, b.end);
      if (o <= 0) continue;
      value += o;
      byGame.set(s.gameId, (byGame.get(s.gameId) || 0) + o);
    }
    return { ...b, value, byGame };
  });
}

export function sessionsInRange(sessions, a, b) {
  return sessions.filter((s) => s.end > a && s.start < b && s.end > s.start);
}

export function timeInRange(sessions, a, b, gameId) {
  let total = 0;
  for (const s of sessions) {
    if (gameId && s.gameId !== gameId) continue;
    total += overlap(s, a, b);
  }
  return total;
}

export function currentRanges() {
  const now = new Date();
  const day = startOfDay(now).getTime();
  const week = startOfWeek(now).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { day, week, month, now: Date.now() };
}

export { MIN, HOUR, DAY };
