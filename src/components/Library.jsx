import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import Shuffle from './Shuffle.jsx';
import { PLATFORMS, currentRanges, formatDuration, platformLabel, relativeTime, timeInRange } from '../lib/time.js';
import { t } from '../lib/i18n.js';

const FILTERS = ['all', 'favorite', 'steam', 'epic', 'riot', 'manual'];
const filterLabel = (id) => (PLATFORMS[id] ? platformLabel(id) : t(`filter.${id}`));

const SORTS = [
  { id: 'recent', label: 'sort.recent' },
  { id: 'name-asc', label: 'sort.nameAsc' },
  { id: 'name-desc', label: 'sort.nameDesc' },
  { id: 'time-desc', label: 'sort.timeDesc' },
  { id: 'time-asc', label: 'sort.timeAsc' },
];

const SORT_KEY = 'alteia.sort';

function savedSort() {
  try {
    const s = localStorage.getItem(SORT_KEY);
    return SORTS.some((x) => x.id === s) ? s : 'recent';
  } catch {
    return 'recent';
  }
}

// Chip "+ Nova coleção" que se transforma num campo com botão "Criar".
function NewCollection({ api, run }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return (
      <button className="chip chip-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} />
        {t('tags.new')}
      </button>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) run(api.createTag(name.trim()), t('tags.created', { name: name.trim() }));
    setName('');
    setOpen(false);
  };
  return (
    <form className="tag-form-inline" onSubmit={submit}>
      <input
        className="input"
        autoFocus
        value={name}
        maxLength={40}
        placeholder={t('tags.placeholder')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <button className="btn btn-primary btn-sm" type="submit" disabled={!name.trim()}>
        {t('tags.create')}
      </button>
    </form>
  );
}

export default function Library({ lib, totals, run, api, openDetail, openEdit }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSortState] = useState(savedSort);
  const [scanning, setScanning] = useState(false);
  const [shuffling, setShuffling] = useState(false);

  // A ordenação escolhida fica guardada para a próxima vez que abrires a app.
  function setSort(value) {
    setSortState(value);
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {}
  }

  const games = lib.games.filter((g) => !g.hidden);
  const running = new Set(lib.running);

  // Coleções (incluindo as vazias) e quantos jogos tem cada uma.
  const collections = useMemo(() => {
    const map = new Map(lib.collections.map((name) => [name, 0]));
    for (const g of games) for (const tag of g.tags) map.set(tag, (map.get(tag) || 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [games, lib.collections]);

  // Se a coleção filtrada deixar de existir (apagada ou renomeada), volta a mostrar todos.
  if (filter.startsWith('tag:') && !collections.some(([tag]) => `tag:${tag}` === filter)) setFilter('all');

  const counts = useMemo(() => {
    const c = { all: games.length, favorite: 0 };
    for (const g of games) {
      c[g.source] = (c[g.source] || 0) + 1;
      if (g.favorite) c.favorite += 1;
    }
    return c;
  }, [games]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = games.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (filter === 'favorite') return g.favorite;
      if (filter.startsWith('tag:')) return g.tags.includes(filter.slice(4));
      if (filter !== 'all') return g.source === filter;
      return true;
    });
    const tot = (g) => totals.get(g.id) || {};
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt');
    return filtered.sort((a, b) => {
      if (sort === 'name-asc') return byName(a, b);
      if (sort === 'name-desc') return byName(b, a);
      if (sort === 'time-desc') return (tot(b).total || 0) - (tot(a).total || 0) || byName(a, b);
      if (sort === 'time-asc') return (tot(a).total || 0) - (tot(b).total || 0) || byName(a, b);
      return (tot(b).lastPlayed || 0) - (tot(a).lastPlayed || 0) || byName(a, b);
    });
  }, [games, query, filter, sort, totals]);

  const recent = useMemo(
    () =>
      games
        .filter((g) => (totals.get(g.id)?.lastPlayed || 0) > 0)
        .sort((a, b) => totals.get(b.id).lastPlayed - totals.get(a.id).lastPlayed)
        .slice(0, 4),
    [games, totals]
  );

  const ranges = currentRanges();
  const showRecent = !query && filter === 'all' && recent.length > 0;
  const allTitle = filter.startsWith('tag:') ? filter.slice(4) : t('lib.all');

  async function rescan() {
    setScanning(true);
    await run(api.rescan(), t('lib.refreshed'));
    setScanning(false);
  }

  async function addGame() {
    const id = await run(api.addManual());
    if (id) openEdit(id);
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lib.search')} />
        </div>
        <div className="toolbar-spacer" />
        <button className="btn btn-ghost" onClick={rescan} disabled={scanning} title={t('lib.refreshTitle')}>
          <Icon name="refresh" size={18} className={scanning ? 'spin' : ''} />
          {t('lib.refresh')}
        </button>
        <button className="btn btn-primary" onClick={addGame}>
          <Icon name="plus" size={18} />
          {t('lib.add')}
        </button>
      </div>

      <div className="chips">
        {FILTERS.filter((f) => f === 'all' || f === 'favorite' || counts[f]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {PLATFORMS[f] && <span className="dot" style={{ background: PLATFORMS[f].color }} />}
            {filterLabel(f)}
            <span className="chip-count">{counts[f] || 0}</span>
          </button>
        ))}
      </div>
      {(
        <div className="chips chips-tags">
          {collections.map(([tag, n]) => {
            const id = `tag:${tag}`;
            return (
              <button
                key={tag}
                className={`chip chip-tag ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(filter === id ? 'all' : id)}
              >
                <Icon name="tag" size={18} />
                {tag}
                <span className="chip-count">{n}</span>
              </button>
            );
          })}
          <NewCollection api={api} run={run} />
        </div>
      )}

      {showRecent && (
        <section>
          <h2 className="section-title">{t('lib.recent')}</h2>
          <div className="recent-row">
            {recent.map((g) => {
              const week = timeInRange(lib.sessions, ranges.week, ranges.now, g.id);
              return (
                <button key={g.id} className="recent-card" onClick={() => openDetail(g.id)}>
                  {g.hero ? (
                    <img className="recent-bg" src={g.hero} alt="" draggable={false} />
                  ) : (
                    <div className="recent-bg recent-bg-cover">
                      <Cover game={g} />
                    </div>
                  )}
                  <div className="recent-shade" />
                  <div className="recent-info">
                    <div className="recent-name">{g.name}</div>
                    <div className="recent-meta">
                      {running.has(g.id) ? (
                        <span className="badge-live">{t('lib.playing')}</span>
                      ) : (
                        relativeTime(totals.get(g.id).lastPlayed)
                      )}
                      {week > 0 && <span> · {t('lib.thisWeek', { time: formatDuration(week) })}</span>}
                    </div>
                  </div>
                  <span
                    className="recent-play"
                    role="button"
                    title={t('common.play')}
                    onClick={(e) => {
                      e.stopPropagation();
                      run(api.launch(g.id), t('common.launching', { name: g.name }));
                    }}
                  >
                    <Icon name="play" size={18} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2 className="section-title">{allTitle}</h2>
          <div className="spacer" />
          <label className="sort">
            <Icon name="sort" size={18} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('sort.label')}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            disabled={list.length === 0}
            onClick={() => setShuffling(true)}
            title={t('lib.shuffleTitle')}
          >
            <Icon name="dice" size={18} />
            {t('lib.shuffle')}
          </button>
        </div>
        {list.length === 0 ? (
          <div className="empty">
            {games.length === 0
              ? t('lib.emptyNone')
              : t('lib.emptySearch')}
          </div>
        ) : (
          <div className="grid">
            {list.map((g) => {
              const tot = totals.get(g.id) || {};
              return (
                <div key={g.id} className="card" onClick={() => openDetail(g.id)}>
                  <div className="card-cover">
                    <Cover game={g} />
                    {running.has(g.id) && <span className="badge-live card-live">{t('lib.playing')}</span>}
                    {g.favorite && (
                      <span className="card-fav" title={t('lib.favorite')}>
                        <Icon name="heart" size={18} />
                      </span>
                    )}
                    <div className="card-overlay">
                      <button
                        className="play-fab"
                        title={t('common.play')}
                        onClick={(e) => {
                          e.stopPropagation();
                          run(api.launch(g.id), t('common.launching', { name: g.name }));
                        }}
                      >
                        <Icon name="play" size={27} />
                      </button>
                    </div>
                  </div>
                  <div className="card-name" title={g.name}>
                    {g.name}
                  </div>
                  <div className="card-meta">
                    <span className="dot" style={{ background: PLATFORMS[g.source].color }} />
                    {tot.total > 0 ? formatDuration(tot.total, { short: true }) : t('lib.noTime')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {shuffling && list.length > 0 && (
        <Shuffle
          pool={list}
          totals={totals}
          api={api}
          run={run}
          openDetail={openDetail}
          onClose={() => setShuffling(false)}
        />
      )}
    </div>
  );
}
