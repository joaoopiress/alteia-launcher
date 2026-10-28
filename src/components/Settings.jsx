import { useState } from 'react';
import Icon from './Icon.jsx';
import { PLATFORMS, formatClock } from '../lib/time.js';
import { LANGUAGES, t, tn } from '../lib/i18n.js';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function updateStatusText(update, s) {
  const text = updateStatusBase(update, s);
  if (!update.checkedAt || update.status === 'checking' || update.status === 'dev') return text;
  return `${text} ${t('upd.checkedAt', { time: formatClock(update.checkedAt) })}`;
}

function updateStatusBase(update, s) {
  switch (update.status) {
    case 'dev':
      return t('upd.dev');
    case 'checking':
      return t('upd.checking');
    case 'available':
      return t('upd.available', { version: update.version });
    case 'installing':
      return t('upd.installing', { version: update.version });
    case 'none':
      return update.latest ? t('upd.latest') : t('upd.nothing');
    case 'error':
      return update.error;
    default:
      return t('upd.version', { version: s.version });
  }
}

// Amostra de cada paleta (fundo, painel, destaque, texto); os valores completos estão no CSS.
const THEMES = [
  { id: 'fogueira', colors: ['#15100d', '#2a1d16', '#f0a830', '#f4e4c1'] },
  { id: 'floresta', colors: ['#0f1410', '#1c261c', '#79c99e', '#e9f0d8'] },
  { id: 'lua', colors: ['#0c1018', '#172033', '#6fb7ff', '#e3ecff'] },
  { id: 'sakura', colors: ['#160e14', '#2a1a25', '#ff8fb8', '#fbe7f0'] },
  { id: 'ameixa', colors: ['#120f1a', '#221b35', '#b48cff', '#ece6ff'] },
];

function CollectionRow({ tag, count, api, run }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag);
  return (
    <li>
      <Icon name="tag" size={18} />
      {editing ? (
        <form
          className="row collection-rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== tag) run(api.renameTag(tag, name.trim()));
            setEditing(false);
          }}
        >
          <input className="input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </form>
      ) : (
        <>
          <span className="hidden-name">
            {tag} <span className="muted">· {tn('app.games', count)}</span>
          </span>
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
            {t('settings.rename')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => confirm(t('settings.deleteConfirm', { tag })) && run(api.deleteTag(tag))}
          >
            <Icon name="trash" size={18} />
            {t('settings.delete')}
          </button>
        </>
      )}
    </li>
  );
}

export default function Settings({ lib, api, run, update }) {
  const s = lib.settings;
  const [key, setKey] = useState(s.sgdbKey || '');
  const hidden = lib.games.filter((g) => g.hidden);
  const [newTag, setNewTag] = useState('');
  const collections = [
    ...lib.games.flatMap((g) => g.tags).reduce((m, tag) => m.set(tag, (m.get(tag) || 0) + 1), new Map(lib.collections.map((n) => [n, 0]))),
  ].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="page settings">
      <h1 className="page-title">{t('settings.title')}</h1>

      <section className="panel">
        <div className="setting setting-first">
          <div>
            <div className="setting-name">{t('settings.language')}</div>
            <div className="muted">{t('settings.languageDesc')}</div>
          </div>
          <div className="segmented">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                className={s.language === l.id ? 'active' : ''}
                onClick={() => run(api.setSettings({ language: l.id }))}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.appearance')}</h3>
        <p className="muted">{t('settings.appearanceDesc')}</p>
        <div className="themes">
          {THEMES.map((th) => (
            <button
              key={th.id}
              className={`theme-card ${s.theme === th.id ? 'active' : ''}`}
              onClick={() => run(api.setSettings({ theme: th.id }))}
              aria-pressed={s.theme === th.id}
            >
              <span className="theme-swatches">
                {th.colors.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
              {t(`theme.${th.id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.collections')}</h3>
        <p className="muted">{t('settings.collectionsDesc')}</p>
        <form
          className="row collection-create"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTag.trim()) run(api.createTag(newTag.trim()), t('tags.created', { name: newTag.trim() }));
            setNewTag('');
          }}
        >
          <input
            className="input"
            value={newTag}
            maxLength={40}
            placeholder={t('tags.placeholder')}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!newTag.trim()}>
            <Icon name="plus" size={18} />
            {t('tags.create')}
          </button>
        </form>
        {collections.length === 0 ? (
          <p className="muted">{t('settings.noCollections')}</p>
        ) : (
          <ul className="hidden-list collection-list">
            {collections.map(([tag, count]) => (
              <CollectionRow key={tag} tag={tag} count={count} api={api} run={run} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.achievements')}</h3>
        <div className="setting setting-first">
          <div>
            <div className="setting-name">{t('settings.achPopup')}</div>
            <div className="muted">{t('settings.achPopupDesc')}</div>
          </div>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => run(api.previewAchievement())}>
              <Icon name="trophy" size={18} />
              {t('settings.achPreview')}
            </button>
            <Toggle checked={s.achievementPopup !== false} onChange={(v) => run(api.setSettings({ achievementPopup: v }))} />
          </div>
        </div>
        <div className="setting">
          <div className="setting-name">{t('settings.achSound')}</div>
          <Toggle checked={s.achievementSound !== false} onChange={(v) => run(api.setSettings({ achievementSound: v }))} />
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.tv')}</h3>
        <p className="muted">{t('settings.tvDesc')}</p>
        <div className="setting">
          <div>
            <div className="setting-name">{t('settings.autoTv')}</div>
            <div className="muted">{t('settings.autoTvDesc')}</div>
          </div>
          <Toggle checked={!!s.autoTvMode} onChange={(v) => run(api.setSettings({ autoTvMode: v }))} />
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.coversTitle')}</h3>
        <p className="muted">{t('settings.coversDesc')}</p>
        <div className="row">
          <input
            className="input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('settings.keyPlaceholder')}
          />
          <button
            className="btn btn-primary"
            disabled={key.trim() === (s.sgdbKey || '')}
            onClick={() => run(api.setSettings({ sgdbKey: key.trim() }), t('settings.keySaved'))}
          >
            {t('common.save')}
          </button>
          <button className="btn btn-ghost" onClick={() => api.openExternal('https://www.steamgriddb.com/profile/preferences/api')}>
            <Icon name="external" size={18} />
            {t('settings.getKey')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.trackingTitle')}</h3>
        <p className="muted">{t('settings.trackingDesc')}</p>
        <div className="setting">
          <div>
            <div className="setting-name">{t('settings.tray')}</div>
            <div className="muted">{t('settings.trayDesc')}</div>
          </div>
          <Toggle checked={s.closeToTray} onChange={(v) => run(api.setSettings({ closeToTray: v }))} />
        </div>
        <div className="setting">
          <div>
            <div className="setting-name">{t('settings.startup')}</div>
            <div className="muted">{s.isPackaged ? t('settings.startupDesc') : t('settings.startupDev')}</div>
          </div>
          <Toggle
            checked={s.startWithWindows}
            disabled={!s.isPackaged}
            onChange={(v) => run(api.setSettings({ startWithWindows: v }))}
          />
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.updatesTitle')}</h3>
        <p className="muted">{t('settings.updatesDesc', { version: s.version })}</p>
        <div className="setting">
          <div className="setting-main">
            <div className="setting-name">{t('settings.updatesDir')}</div>
            <div className="muted path" title={s.updatesDir}>
              {s.updatesDir}
            </div>
          </div>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => run(api.openUpdatesDir())}>
              <Icon name="folder" size={18} />
              {t('common.open')}
            </button>
            <button className="btn btn-ghost" onClick={() => run(api.chooseUpdatesDir())}>
              {t('settings.change')}
            </button>
          </div>
        </div>
        <div className="setting">
          <div className="setting-main">
            <div className="setting-name">{t('settings.status')}</div>
            <div className={`muted ${update.status === 'error' ? 'error-text' : ''}`}>{updateStatusText(update, s)}</div>
          </div>
          {update.status === 'available' ? (
            <button className="btn btn-primary" onClick={() => run(api.installUpdate())}>
              {t('update.installRestart')}
            </button>
          ) : (
            <button
              className="btn"
              disabled={!s.isPackaged || update.status === 'checking' || update.status === 'installing'}
              onClick={() => run(api.checkUpdates())}
            >
              <Icon name="refresh" size={18} className={update.status === 'checking' ? 'spin' : ''} />
              {t('settings.checkUpdates')}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h3 className="sub-title">{t('settings.hiddenTitle')}</h3>
        {hidden.length === 0 ? (
          <p className="muted">{t('settings.noHidden')}</p>
        ) : (
          <ul className="hidden-list">
            {hidden.map((g) => (
              <li key={g.id}>
                <span className="dot" style={{ background: PLATFORMS[g.source].color }} />
                <span className="hidden-name">{g.name}</span>
                <button className="btn btn-ghost" onClick={() => run(api.updateGame(g.id, { hidden: false }))}>
                  <Icon name="eye" size={18} />
                  {t('settings.show')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
