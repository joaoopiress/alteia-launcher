import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { formatDate, platformLabel, relativeTime } from '../lib/time.js';
import { formatPrice } from '../lib/games.js';
import { t } from '../lib/i18n.js';

// Recomendações: da tua biblioteca, da loja Steam e os jogos grátis da semana na Epic.
export default function Discover({ lib, api, run, openDetail }) {
  const [recs, setRecs] = useState(null);

  useEffect(() => {
    api.getRecs(false).then(setRecs);
    return api.onRecs(setRecs);
  }, [api]);

  const wishKeys = new Set(lib.wishlist.map((w) => w.key));
  const loading = !recs || recs.loading;

  const because = (r) => (r.because ? t('disc.because', { name: r.because }) : null);

  return (
    <div className="page">
      <div className="discover-head">
        <div>
          <h1 className="page-title">{t('nav.discover')}</h1>
          <p className="muted page-desc">
            {t('disc.desc')}
            {recs?.at && !recs.loading && <> · {t('disc.updated', { when: relativeTime(recs.at) })}</>}
          </p>
        </div>
        <button className="btn" disabled={loading} onClick={() => api.getRecs(true).then((r) => r && setRecs({ ...r, loading: true }))}>
          <Icon name="refresh" size={18} className={loading ? 'spin' : ''} />
          {t('disc.refresh')}
        </button>
      </div>

      {recs?.tags?.length > 0 && (
        <div className="panel taste">
          <span className="taste-label">{t('disc.taste')}</span>
          {recs.tags.map((tg) => (
            <span key={tg.tag} className="chip chip-tag" title={tg.because ? t('disc.because', { name: tg.because }) : ''}>
              {tg.tag}
            </span>
          ))}
        </div>
      )}

      {!recs && <div className="empty">{t('disc.loading')}</div>}

      {recs?.epicFree?.length > 0 && (
        <section>
          <h2 className="section-title">{t('disc.epic')}</h2>
          <div className="grid">
            {recs.epicFree.map((f) => (
              <div key={f.title} className={`card disc-card ${f.upcoming ? 'upcoming' : ''}`} onClick={() => api.openExternal(f.url)}>
                <div className="card-cover">
                  <Cover game={{ name: f.title, source: 'epic', cover: f.cover }} />
                </div>
                <div className="card-name" title={f.title}>
                  {f.title}
                </div>
                <div className="card-meta">
                  {f.upcoming
                    ? t('disc.epicFrom', { date: formatDate(f.start, { day: 'numeric', month: 'short' }) })
                    : t('disc.epicUntil', { date: formatDate(f.end, { day: 'numeric', month: 'short' }) })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recs?.store?.length > 0 && (
        <section>
          <h2 className="section-title">{t('disc.store')}</h2>
          <div className="grid">
            {recs.store.map((r) => {
              const key = `steamstore:${r.appid}`;
              return (
                <div key={r.appid} className="card disc-card" onClick={() => run(api.openSteamStore(r.appid))}>
                  <div className="card-cover">
                    <Cover game={{ name: r.name, source: 'steam', cover: r.cover }} />
                    {r.price?.discount > 0 && <span className="wish-discount">-{r.price.discount}%</span>}
                  </div>
                  <div className="card-name" title={r.name}>
                    {r.name}
                  </div>
                  <div className="card-meta">
                    {formatPrice(r.price, t('wish.free')) || '—'} · {t('disc.rating', { n: r.rating })}
                  </div>
                  <div className="disc-reason">{because(r)}</div>
                  <div className="disc-tags">{r.tags.join(' · ')}</div>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={wishKeys.has(key)}
                    onClick={(e) => {
                      e.stopPropagation();
                      run(api.addWish({ kind: 'steam', appid: r.appid, name: r.name }), t('wish.added', { name: r.name }));
                    }}
                  >
                    <Icon name={wishKeys.has(key) ? 'heart' : 'plus'} size={18} />
                    {wishKeys.has(key) ? t('wish.inList') : t('wish.add')}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">{t('disc.library')}</h2>
        {recs?.library?.length > 0 ? (
          <div className="grid">
            {recs.library.map((r) => (
              <div
                key={r.id}
                className={`card disc-card ${r.installed ? '' : 'card-uninstalled'}`}
                onClick={() => (r.installed ? openDetail(r.id) : run(api.installOwned(r.id)))}
              >
                <div className="card-cover">
                  <Cover game={{ name: r.name, source: r.store, cover: r.cover }} />
                  <div className="card-overlay">
                    <span className="play-fab">
                      <Icon name={r.installed ? 'play' : 'download'} size={27} />
                    </span>
                  </div>
                </div>
                <div className="card-name" title={r.name}>
                  {r.name}
                </div>
                <div className="card-meta">{platformLabel(r.store)}</div>
                <div className="disc-reason">{because(r)}</div>
                <div className="disc-tags">{r.tags.join(' · ')}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{loading ? t('disc.loadingLibrary') : t('disc.empty')}</div>
        )}
      </section>
    </div>
  );
}
