import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { PLATFORMS, formatDuration, platformLabel, relativeTime } from '../lib/time.js';
import { t, tn } from '../lib/i18n.js';

const SORTS = [
  { id: 'name-asc', label: 'sort.nameAsc' },
  { id: 'time-desc', label: 'sort.timeDesc' },
  { id: 'recent', label: 'sort.recent' },
];

// Jogos das contas Steam e Epic que não estão instalados.
export default function Uninstalled({ lib, api, run }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [store, setStore] = useState('all');

  const counts = useMemo(() => {
    const c = { all: lib.notInstalled.length, steam: 0, epic: 0 };
    for (const g of lib.notInstalled) c[g.store]++;
    return c;
  }, [lib.notInstalled]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byName = (a, b) => a.name.localeCompare(b.name);
    return lib.notInstalled
      .filter((g) => (store === 'all' || g.store === store) && (!q || g.name.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === 'time-desc') return b.minutes - a.minutes || byName(a, b);
        if (sort === 'recent') return b.lastPlayed - a.lastPlayed || byName(a, b);
        return byName(a, b);
      });
  }, [lib.notInstalled, query, sort, store]);

  const inWishlist = new Set(lib.wishlist.map((w) => w.key));

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.uninstalled')}</h1>
      <p className="muted page-desc">
        {t('unin.descAll')} · {tn('unin.count', lib.notInstalled.length)}
      </p>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lib.search')} />
        </div>
        <div className="toolbar-spacer" />
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
      </div>

      <div className="chips">
        {['all', 'steam', 'epic'].map((s) => (
          <button key={s} className={`chip ${store === s ? 'active' : ''}`} onClick={() => setStore(s)}>
            {PLATFORMS[s] && <span className="dot" style={{ background: PLATFORMS[s].color }} />}
            {s === 'all' ? t('unin.allStores') : platformLabel(s)}
            <span className="chip-count">{counts[s]}</span>
          </button>
        ))}
      </div>

      {lib.notInstalled.length === 0 ? (
        <div className="empty">{t('unin.empty')}</div>
      ) : list.length === 0 ? (
        <div className="empty">{t('lib.emptySearch')}</div>
      ) : (
        <div className="grid">
          {list.map((g) => {
            const completed = g.status === 'completed';
            return (
              <div key={g.id} className="card card-uninstalled">
                <div className="card-cover">
                  <Cover game={{ name: g.name, source: g.store, cover: g.cover }} />
                  {completed && <span className="badge-completed">{t('status.completed')}</span>}
                  <div className="card-overlay">
                    <button
                      className="play-fab"
                      title={t('unin.install')}
                      onClick={() => run(api.installOwned(g.id), t('unin.installing', { name: g.name }))}
                    >
                      <Icon name="download" size={27} />
                    </button>
                  </div>
                </div>
                <div className="card-name" title={g.name}>
                  {g.name}
                </div>
                <div className="card-meta">
                  <span className="dot" style={{ background: PLATFORMS[g.store].color }} />
                  {g.minutes > 0
                    ? `${t('unin.played', { time: formatDuration(g.minutes * 60_000, { short: true }) })} · ${relativeTime(g.lastPlayed)}`
                    : t('unin.never')}
                </div>
                <div className="card-actions">
                  {g.store === 'steam' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(api.openSteamStore(g.appid))} title={t('unin.store')}>
                      <Icon name="store" size={18} />
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={inWishlist.has(g.id)}
                    onClick={() => run(api.addWish({ kind: 'owned', id: g.id, name: g.name }), t('wish.added', { name: g.name }))}
                    title={t('wish.add')}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                  <button
                    className={`btn btn-ghost btn-sm ${completed ? 'is-on' : ''}`}
                    onClick={() => run(api.updateGame(g.id, { status: completed ? null : 'completed' }))}
                    title={completed ? t('lists.notCompleted') : t('status.completed')}
                  >
                    <Icon name="trophy" size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
