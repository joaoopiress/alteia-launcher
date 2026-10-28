import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { formatDate, platformLabel } from '../lib/time.js';
import { allOwnedGames, formatPrice, normName } from '../lib/games.js';
import { t, tn } from '../lib/i18n.js';

const TIERS = [
  { id: 'S', color: '#ff7f7f' },
  { id: 'A', color: '#ffbf7f' },
  { id: 'B', color: '#ffdf7f' },
  { id: 'C', color: '#bfff7f' },
  { id: 'D', color: '#7fbfff' },
];

// Campo de pesquisa com sugestões de jogos da biblioteca (instalados ou não).
function GamePicker({ games, placeholder, onPick }) {
  const [q, setQ] = useState('');
  const matches = q.trim().length >= 2 ? games.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <div className="picker">
      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </div>
      {matches.length > 0 && (
        <ul className="picker-list">
          {matches.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => {
                  onPick(g);
                  setQ('');
                }}
              >
                <span className="picker-thumb">
                  <Cover game={g} />
                </span>
                {g.name}
                <span className="muted">· {platformLabel(g.source)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TierItem({ g, onOpen }) {
  return (
    <div
      className="tier-item"
      draggable
      title={g.completedAt ? `${g.name} · ${t('status.completedOn', { date: formatDate(g.completedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}` : g.name}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', g.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDoubleClick={() => onOpen(g)}
    >
      <Cover game={g} />
    </div>
  );
}

// Posição de inserção a partir do ponto onde a capa foi largada (antes de qual capa).
function dropIndex(e) {
  const items = [...e.currentTarget.querySelectorAll('.tier-item')];
  const i = items.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return e.clientY < r.bottom && e.clientX < r.left + r.width / 2;
  });
  return i === -1 ? items.length : i;
}

function TierList({ lib, api, run, openDetail }) {
  const owned = useMemo(() => allOwnedGames(lib), [lib]);
  const completed = [...owned.values()].filter((g) => g.status === 'completed');
  const inTiers = new Set(Object.values(lib.tierList).flat());
  const unranked = completed.filter((g) => !inTiers.has(g.id));
  const [over, setOver] = useState(null);

  const drop = (tier) => (e) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    run(api.setTier(id, tier, tier ? dropIndex(e) : undefined));
  };
  const zone = (tier) => ({
    onDragOver: (e) => {
      e.preventDefault();
      setOver(tier || 'none');
    },
    onDragLeave: () => setOver(null),
    onDrop: drop(tier),
  });
  const open = (g) => g.installed && openDetail(g.id);

  return (
    <>
      <div className="lists-head">
        <span className="lists-count">{tn('lists.completed', completed.length)}</span>
        <GamePicker
          games={[...owned.values()].filter((g) => g.status !== 'completed')}
          placeholder={t('lists.markCompleted')}
          onPick={(g) => run(api.updateGame(g.id, { status: 'completed' }), t('lists.markedCompleted', { name: g.name }))}
        />
      </div>
      <p className="muted">{t('lists.tierHint')}</p>

      <div className="tierlist">
        {TIERS.map((tier) => (
          <div key={tier.id} className={`tier-row ${over === tier.id ? 'over' : ''}`}>
            <div className="tier-label" style={{ background: tier.color }}>
              {tier.id}
            </div>
            <div className="tier-items" {...zone(tier.id)}>
              {lib.tierList[tier.id]
                .map((id) => owned.get(id))
                .filter(Boolean)
                .map((g) => (
                  <TierItem key={g.id} g={g} onOpen={open} />
                ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title tier-pool-title">{t('lists.unranked')}</h2>
      <div className={`tier-pool ${over === 'none' ? 'over' : ''}`} {...zone(null)}>
        {unranked.length === 0 ? (
          <span className="muted">{t('lists.unrankedEmpty')}</span>
        ) : (
          unranked.map((g) => <TierItem key={g.id} g={g} onOpen={open} />)
        )}
      </div>
    </>
  );
}

function Wishlist({ lib, api, run }) {
  const owned = useMemo(() => allOwnedGames(lib), [lib]);
  const ownedSteam = new Set([...owned.values()].map((g) => g.appid).filter(Boolean));
  const ownedNames = new Set([...owned.values()].map((g) => normName(g.name)));
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [prices, setPrices] = useState({});

  // Pesquisa na loja Steam, com uma pequena pausa enquanto se escreve.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    setResults('loading');
    const timer = setTimeout(async () => {
      const res = await run(api.searchStore(term));
      setResults(res || []);
    }, 400);
    return () => clearTimeout(timer);
  }, [q, api, run]);

  const steamIds = lib.wishlist.filter((w) => w.kind === 'steam').map((w) => w.appid);
  useEffect(() => {
    if (!steamIds.length) return;
    run(api.storePrices(steamIds)).then((p) => p && setPrices(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamIds.join(',')]);

  const inList = new Set(lib.wishlist.map((w) => w.key));
  const add = (item, name) => {
    run(api.addWish(item), t('wish.added', { name }));
    setQ('');
  };
  const localMatches = q.trim().length >= 2 ? [...owned.values()].filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];

  // Dados para mostrar cada entrada da lista.
  const view = (w) => {
    if (w.kind === 'owned') {
      const g = owned.get(w.id);
      return { name: g?.name || w.name, cover: g?.cover, source: g?.source || 'manual', owned: true, game: g };
    }
    if (w.kind === 'steam') {
      return { name: w.name, cover: `media://steamart/${w.appid}/cover`, source: 'steam', owned: ownedSteam.has(w.appid) || ownedNames.has(normName(w.name)), price: prices[w.appid] };
    }
    return { name: w.name, cover: null, source: 'manual', custom: true };
  };

  return (
    <>
      <div className="picker wish-search">
        <div className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wish.searchPlaceholder')} />
        </div>
        {q.trim().length >= 2 && (
          <div className="picker-list wish-results">
            {localMatches.length > 0 && <div className="picker-group">{t('wish.fromLibrary')}</div>}
            {localMatches.map((g) => (
              <button key={g.id} disabled={inList.has(g.id)} onClick={() => add({ kind: 'owned', id: g.id, name: g.name }, g.name)}>
                <span className="picker-thumb">
                  <Cover game={g} />
                </span>
                {g.name}
                <span className="muted">· {platformLabel(g.source)}</span>
                {inList.has(g.id) && <span className="badge-small">{t('wish.inList')}</span>}
              </button>
            ))}
            <div className="picker-group">{t('wish.fromSteam')}</div>
            {results === 'loading' && <div className="muted picker-note">{t('wish.searching')}</div>}
            {Array.isArray(results) &&
              results.slice(0, 8).map((r) => {
                const key = `steamstore:${r.appid}`;
                return (
                  <button key={r.appid} disabled={inList.has(key)} onClick={() => add({ kind: 'steam', appid: r.appid, name: r.name }, r.name)}>
                    <span className="picker-thumb">
                      <Cover game={{ name: r.name, source: 'steam', cover: r.cover }} />
                    </span>
                    {r.name}
                    <span className="muted">· {formatPrice(r.price, t('wish.free'))}</span>
                    {ownedSteam.has(r.appid) && <span className="badge-small">{t('wish.owned')}</span>}
                    {inList.has(key) && <span className="badge-small">{t('wish.inList')}</span>}
                  </button>
                );
              })}
            <button className="picker-custom" onClick={() => add({ kind: 'custom', name: q.trim() }, q.trim())}>
              <Icon name="plus" size={18} />
              {t('wish.addCustom', { name: q.trim() })}
            </button>
          </div>
        )}
      </div>

      {lib.wishlist.length === 0 ? (
        <div className="empty">{t('wish.empty')}</div>
      ) : (
        <div className="grid">
          {lib.wishlist.map((w) => {
            const v = view(w);
            const price = v.price;
            return (
              <div key={w.key} className="card wish-card">
                <div className="card-cover">
                  <Cover game={{ name: v.name, source: v.source, cover: v.cover }} />
                  {price?.discount > 0 && <span className="wish-discount">-{price.discount}%</span>}
                </div>
                <div className="card-name" title={v.name}>
                  {v.name}
                </div>
                <div className="card-meta">
                  {v.custom ? (
                    t('wish.custom')
                  ) : (
                    <>
                      <span className="dot" style={{ background: v.source === 'steam' ? '#3987e5' : v.source === 'epic' ? '#d95926' : '#c98500' }} />
                      {v.owned ? t('wish.owned') : formatPrice(price, t('wish.free')) || platformLabel(v.source)}
                      {price?.discount > 0 && <s className="muted">{formatPrice({ final: price.initial })}</s>}
                    </>
                  )}
                </div>
                <div className="card-actions">
                  {w.kind === 'steam' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(api.openSteamStore(w.appid))} title={t('wish.store')}>
                      <Icon name="store" size={18} />
                    </button>
                  )}
                  {w.kind === 'owned' && v.game && !v.game.installed && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(api.installOwned(w.id))} title={t('unin.install')}>
                      <Icon name="download" size={18} />
                    </button>
                  )}
                  {w.kind === 'owned' && v.game?.installed && (
                    <button className="btn btn-ghost btn-sm" onClick={() => run(api.launch(w.id), t('common.launching', { name: v.name }))} title={t('common.play')}>
                      <Icon name="play" size={18} />
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => run(api.removeWish(w.key))} title={t('wish.remove')}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Lists(props) {
  const [tab, setTab] = useState('tier');
  return (
    <div className="page">
      <h1 className="page-title">{t('nav.lists')}</h1>
      <div className="segmented lists-tabs">
        <button className={tab === 'tier' ? 'active' : ''} onClick={() => setTab('tier')}>
          {t('lists.tierTab')}
        </button>
        <button className={tab === 'wish' ? 'active' : ''} onClick={() => setTab('wish')}>
          {t('lists.wishTab')} · {props.lib.wishlist.length}
        </button>
      </div>
      {tab === 'tier' ? <TierList {...props} /> : <Wishlist {...props} />}
    </div>
  );
}
