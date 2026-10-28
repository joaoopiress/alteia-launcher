// Regras das conquistas. Cada regra recebe um resumo dos dados da biblioteca e devolve
// { done, current?, goal? } (current/goal servem para mostrar o progresso na página).
// Os nomes e descrições estão nas traduções da interface (ach.<id>.name / ach.<id>.desc).

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function count(current, goal) {
  return { done: current >= goal, current: Math.min(current, goal), goal };
}

const RULES = [
  { id: 'first_session', tier: 'bronze', check: (c) => count(c.sessions.length, 1) },
  { id: 'hours_10', tier: 'bronze', check: (c) => count(Math.floor(c.totalMs / HOUR), 10) },
  { id: 'hours_100', tier: 'silver', check: (c) => count(Math.floor(c.totalMs / HOUR), 100) },
  { id: 'hours_500', tier: 'gold', check: (c) => count(Math.floor(c.totalMs / HOUR), 500) },
  { id: 'hours_1000', tier: 'gold', check: (c) => count(Math.floor(c.totalMs / HOUR), 1000) },
  { id: 'marathon', tier: 'silver', check: (c) => count(Math.floor(c.longestMs / MIN), 240) },
  { id: 'night_owl', tier: 'silver', check: (c) => ({ done: c.nightOwl }) },
  { id: 'early_bird', tier: 'silver', check: (c) => ({ done: c.earlyBird }) },
  { id: 'weekend', tier: 'silver', check: (c) => ({ done: c.fullWeekend }) },
  { id: 'streak_7', tier: 'silver', check: (c) => count(c.bestStreak, 7) },
  { id: 'streak_30', tier: 'gold', check: (c) => count(c.bestStreak, 30) },
  { id: 'explorer', tier: 'bronze', check: (c) => count(c.playedGames, 5) },
  { id: 'collector', tier: 'silver', check: (c) => count(c.libraryGames, 10) },
  { id: 'curator', tier: 'bronze', check: (c) => count(c.collections, 3) },
  { id: 'favorite', tier: 'bronze', check: (c) => count(c.favorites, 1) },
  { id: 'multiplatform', tier: 'silver', check: (c) => count(c.platforms, 3) },
  { id: 'comeback', tier: 'silver', check: (c) => ({ done: c.comeback }) },
  { id: 'dice', tier: 'bronze', check: (c) => ({ done: !!c.events.dice }) },
  { id: 'decorator', tier: 'bronze', check: (c) => ({ done: !!c.events.decorator }) },
  { id: 'new_adventure', tier: 'silver', check: (c) => ({ done: !!c.events.install }) },
];

const PLATINUM = { id: 'platinum', tier: 'platinum' };

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Junta num só objeto tudo o que as regras precisam.
function buildContext({ games, sessions, meta, collections, events }) {
  const valid = sessions.filter((s) => s.end - s.start >= MIN);
  const sorted = [...valid].sort((a, b) => a.start - b.start);

  let totalMs = 0;
  let longestMs = 0;
  const playedIds = new Set();
  const days = new Set();
  let nightOwl = false;
  let earlyBird = false;
  for (const s of sorted) {
    const ms = s.end - s.start;
    totalMs += ms;
    longestMs = Math.max(longestMs, ms);
    playedIds.add(s.gameId);
    for (let t = s.start; t < s.end; t += HOUR / 2) days.add(dayKey(t));
    days.add(dayKey(s.end - 1));
    // Noctívago: a sessão passa pelas 2h–5h; Madrugador: começa entre as 5h e as 8h.
    for (let t = s.start; t < s.end; t += 5 * MIN) {
      const h = new Date(t).getHours();
      if (h >= 2 && h < 5) nightOwl = true;
    }
    const startHour = new Date(s.start).getHours();
    if (startHour >= 5 && startHour < 8) earlyBird = true;
  }
  // As conquistas só contam o que foi jogado com a ALTEIA aberta: as horas que a Steam
  // já tinha registado antes (baseline) ficam de fora de propósito.

  // Maior sequência de dias seguidos com jogo.
  let bestStreak = 0;
  if (days.size) {
    const first = sorted[0].start;
    const last = sorted[sorted.length - 1].end;
    let run = 0;
    for (let d = new Date(first); d.getTime() <= last + DAY; d.setDate(d.getDate() + 1)) {
      if (days.has(dayKey(d.getTime()))) {
        run++;
        bestStreak = Math.max(bestStreak, run);
      } else run = 0;
    }
  }

  // Fim de semana completo: jogou num sábado e no domingo seguinte.
  let fullWeekend = false;
  for (const s of sorted) {
    const d = new Date(s.start);
    if (d.getDay() === 6) {
      const sunday = new Date(d);
      sunday.setDate(sunday.getDate() + 1);
      if (days.has(dayKey(sunday.getTime()))) fullWeekend = true;
    }
  }

  // Regresso: uma sessão começa mais de 30 dias depois da sessão anterior desse jogo
  // (ambas registadas pela ALTEIA).
  let comeback = false;
  const lastEnd = new Map();
  for (const s of sorted) {
    const prev = lastEnd.get(s.gameId) || 0;
    if (prev && s.start - prev >= 30 * DAY) comeback = true;
    lastEnd.set(s.gameId, Math.max(prev, s.end));
  }

  const bySource = new Map(games.map((g) => [g.id, g.source]));
  const platforms = new Set([...playedIds].map((id) => bySource.get(id)).filter(Boolean));

  return {
    sessions: valid,
    totalMs,
    longestMs,
    nightOwl,
    earlyBird,
    fullWeekend,
    bestStreak,
    comeback,
    playedGames: playedIds.size,
    platforms: platforms.size,
    libraryGames: games.filter((g) => !g.hidden).length,
    favorites: Object.values(meta).filter((m) => m.favorite).length,
    collections: collections.length,
    events,
  };
}

// Estado de todas as conquistas, com a data em que cada uma foi desbloqueada.
function evaluate(data, unlocked) {
  const ctx = buildContext(data);
  const list = RULES.map((rule) => {
    const res = rule.check(ctx);
    return { id: rule.id, tier: rule.tier, ...res, done: !!(unlocked[rule.id] || res.done) };
  });
  const others = list.filter((a) => a.done).length;
  list.push({
    id: PLATINUM.id,
    tier: PLATINUM.tier,
    done: !!unlocked.platinum || others === RULES.length,
    current: others,
    goal: RULES.length,
  });
  return list.map((a) => ({ ...a, unlockedAt: unlocked[a.id] || null }));
}

module.exports = { evaluate };
