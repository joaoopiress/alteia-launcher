import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { t } from '../lib/i18n.js';

// Pesquisa e escolha de imagens na SteamGridDB.
function SgdbPicker({ game, kind, api, run }) {
  const [term, setTerm] = useState(game.name);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search(e) {
    e?.preventDefault();
    setBusy(true);
    setImages(null);
    setSelected(null);
    const res = await run(api.sgdbSearch(term));
    setResults(res || []);
    setBusy(false);
    if (res?.length) pick(res[0]);
  }

  async function pick(r) {
    setSelected(r.id);
    setImages(null);
    const res = await run(kind === 'hero' ? api.sgdbHeroes(r.id) : api.sgdbGrids(r.id));
    setImages(res || []);
  }

  // Ao trocar entre capa e fundo, recarrega as imagens do jogo escolhido.
  useEffect(() => {
    if (selected) pick({ id: selected });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <div className="sgdb">
      <form className="row" onSubmit={search}>
        <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('sgdb.placeholder')} />
        <button className="btn" type="submit" disabled={busy || !term.trim()}>
          <Icon name="search" size={18} />
          {t('sgdb.search')}
        </button>
      </form>
      {results && results.length === 0 && <p className="muted">{t('sgdb.noGames')}</p>}
      {results && results.length > 0 && (
        <div className="sgdb-results">
          {results.slice(0, 8).map((r) => (
            <button key={r.id} className={`chip ${selected === r.id ? 'active' : ''}`} onClick={() => pick(r)}>
              {r.name}
              {r.year ? <span className="chip-count">{r.year}</span> : null}
            </button>
          ))}
        </div>
      )}
      {selected && !images && <p className="muted">{t('sgdb.loading')}</p>}
      {images && images.length === 0 && <p className="muted">{t('sgdb.noImages')}</p>}
      {images && images.length > 0 && (
        <div className={`sgdb-images ${kind === 'hero' ? 'wide' : ''}`}>
          {images.slice(0, 30).map((img) => (
            <button
              key={img.url}
              className="sgdb-image"
              title={t('sgdb.use')}
              onClick={() => run(api.artFromUrl(game.id, kind, img.url), kind === 'hero' ? t('sgdb.heroUpdated') : t('sgdb.coverUpdated'))}
            >
              <img src={img.thumb} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditGame({ game, lib, api, run, onClose }) {
  const [name, setName] = useState(game.name);
  const [kind, setKind] = useState('cover');
  const [url, setUrl] = useState('');
  const hasKey = !!lib.settings.sgdbKey;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function saveName(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === game.name) return;
    await run(api.updateGame(game.id, { name: trimmed }), t('edit.nameSaved'));
  }

  async function useUrl(e) {
    e.preventDefault();
    if (!url.trim()) return;
    const ok = await run(api.artFromUrl(game.id, kind, url.trim()), t('edit.imageUpdated'));
    if (ok !== undefined) setUrl('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={t('edit.aria', { name: game.name })}>
        <div className="dialog-head">
          <h2>{t('edit.title')}</h2>
          <button className="icon-btn" onClick={onClose} title={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        <form className="row" onSubmit={saveName}>
          <label className="field">
            <span>{t('edit.name')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!name.trim() || name.trim() === game.name}>
            {t('edit.saveName')}
          </button>
          {game.detectedName && game.name !== game.detectedName && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setName(game.detectedName);
                run(api.updateGame(game.id, { name: '' }), t('edit.resetDone'));
              }}
            >
              {t('edit.reset')}
            </button>
          )}
        </form>

        <div className="tabs">
          <button className={`tab ${kind === 'cover' ? 'active' : ''}`} onClick={() => setKind('cover')}>
            {t('edit.cover')}
          </button>
          <button className={`tab ${kind === 'hero' ? 'active' : ''}`} onClick={() => setKind('hero')}>
            {t('edit.hero')}
          </button>
        </div>

        <div className="art-editor">
          <div className={`art-preview ${kind}`}>
            {kind === 'cover' ? (
              <Cover game={game} />
            ) : game.hero ? (
              <img src={game.hero} alt="" />
            ) : (
              <div className="muted art-none">{t('edit.noHero')}</div>
            )}
          </div>
          <div className="art-actions">
            <button className="btn" onClick={() => run(api.pickArtFile(game.id, kind))}>
              <Icon name="image" size={18} />
              {t('edit.pickFile')}
            </button>
            <form className="row" onSubmit={useUrl}>
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('edit.urlPlaceholder')}
              />
              <button className="btn" type="submit" disabled={!url.trim()}>
                <Icon name="link" size={18} />
                {t('edit.use')}
              </button>
            </form>
            <button className="btn btn-ghost" onClick={() => run(api.refetchArt(game.id), t('edit.autoDone'))}>
              <Icon name="refresh" size={18} />
              {t('edit.auto')}
            </button>
          </div>
        </div>

        {hasKey ? (
          <SgdbPicker game={game} kind={kind} api={api} run={run} />
        ) : (
          <p className="note">
            {t('edit.needKey')}
          </p>
        )}
      </div>
    </div>
  );
}
