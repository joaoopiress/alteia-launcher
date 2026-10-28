import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './components/Icon.jsx';
import Library from './components/Library.jsx';
import GameDetail from './components/GameDetail.jsx';
import EditGame from './components/EditGame.jsx';
import Stats from './components/Stats.jsx';
import Settings from './components/Settings.jsx';
import Uninstalled from './components/Uninstalled.jsx';
import Achievements from './components/Achievements.jsx';
import TvMode from './components/TvMode.jsx';
import Lists from './components/Lists.jsx';
import Discover from './components/Discover.jsx';
import { formatDuration, perGameTotals } from './lib/time.js';
import { setLang, t, tn } from './lib/i18n.js';
import logo from './assets/logo.png';
import { SidebarScene } from './components/Pixel.jsx';

const api = window.api;

const NAV = [
  { id: 'library', icon: 'library' },
  { id: 'uninstalled', icon: 'download' },
  { id: 'lists', icon: 'list' },
  { id: 'discover', icon: 'compass' },
  { id: 'stats', icon: 'stats' },
  { id: 'achievements', icon: 'trophy' },
  { id: 'settings', icon: 'settings' },
];

const COLLAPSE_KEY = 'alteia.sidebarCollapsed';

function savedCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [lib, setLib] = useState(null);
  const [view, setView] = useState('library');
  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [update, setUpdate] = useState({ status: 'idle' });
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const [tv, setTv] = useState(false);
  const autoTv = !!lib?.settings.autoTvMode;

  const openTv = useCallback(() => {
    setTv(true);
    setDetailId(null);
    setEditId(null);
    api.setFullScreen(true);
  }, []);
  const closeTv = useCallback(() => {
    setTv(false);
    api.setFullScreen(false);
  }, []);

  // F11 abre o Modo TV (dentro dele, o próprio Modo TV trata do F11 para sair).
  useEffect(() => {
    if (tv) return;
    const onKey = (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        openTv();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tv, openTv]);

  // Com a opção ligada, qualquer botão do comando (com a ALTEIA à frente) abre o Modo TV.
  useEffect(() => {
    if (tv || !autoTv) return;
    let frame;
    let armed = false; // ignora botões que já estavam carregados quando a vigilância começou
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!document.hasFocus()) return;
      const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      const pressed = !!pad && pad.buttons.some((b) => b.pressed);
      if (!pressed) armed = true;
      else if (armed) openTv();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tv, autoTv, openTv]);

  useEffect(() => {
    api.getLibrary().then(setLib);
    api.getUpdateState().then(setUpdate);
    const offs = [
      api.onLibraryChanged(setLib),
      api.onRunningChanged((running) => setLib((l) => l && { ...l, running })),
      api.onNewGame((g) => setToast({ text: t('toast.newGame', { name: g.name }), kind: 'ok' })),
      api.onOpenGame((id) => {
        setView('library');
        setDetailId(id);
      }),
      api.onUpdateState(setUpdate),
    ];
    const onFocus = () => api.getUpdateState().then(setUpdate);
    window.addEventListener('focus', onFocus);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {}
      return !c;
    });
  }, []);

  // Ctrl+B recolhe ou expande a barra lateral.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Executa uma ação da API e mostra o erro (ou mensagem de sucesso) numa notificação.
  const run = useCallback(async (promise, success) => {
    try {
      const result = await promise;
      if (success) setToast({ text: success, kind: 'ok' });
      return result;
    } catch (err) {
      setToast({ text: err.message, kind: 'error' });
      return undefined;
    }
  }, []);

  const totals = useMemo(() => (lib ? perGameTotals(lib.games, lib.sessions) : new Map()), [lib]);

  if (!lib) return <div className="boot">{t('app.loading')}</div>;

  // O idioma tem de estar definido antes de desenhar qualquer texto.
  const lang = lib.settings.language;
  setLang(lang);
  document.documentElement.dataset.theme = lib.settings.theme || 'fogueira';

  const visible = lib.games.filter((g) => !g.hidden);
  const running = lib.running.map((id) => lib.games.find((g) => g.id === id)).filter(Boolean);
  const totalAll = visible.reduce((sum, g) => sum + (totals.get(g.id)?.total || 0), 0);
  const detailGame = lib.games.find((g) => g.id === detailId);
  const editGame = lib.games.find((g) => g.id === editId);
  const hasUpdate = update.status === 'available' || update.status === 'installing';
  const updateLabel = update.status === 'installing' ? t('update.installing') : t('update.installRestart');

  const ctx = { lib, totals, run, api, update, openDetail: setDetailId, openEdit: setEditId };

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <div className="titlebar">
        <span className="titlebar-title">ALTEIA</span>
      </div>
      {/* A key força os componentes a redesenhar todas as datas e textos ao mudar de idioma. */}
      <Fragment key={lang}>
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-mark" src={logo} alt="" draggable={false} />
            <div className="brand-text">
              <div className="brand-name">ALTEIA</div>
              <div className="brand-sub">
                {tn('app.games', visible.length)} · {formatDuration(totalAll, { short: true })}
              </div>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={18} />
          </button>
          <nav>
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`nav-item ${view === n.id ? 'active' : ''}`}
                onClick={() => setView(n.id)}
                title={collapsed ? t(`nav.${n.id}`) : undefined}
              >
                <Icon name={n.icon} size={18} />
                <span className="nav-label">{t(`nav.${n.id}`)}</span>
                {n.id === 'uninstalled' && lib.notInstalled.length > 0 && (
                  <span className="nav-count">{lib.notInstalled.length}</span>
                )}
                {n.id === 'achievements' && (
                  <span className="nav-count">
                    {lib.achievements.filter((a) => a.done).length}/{lib.achievements.length}
                  </span>
                )}
              </button>
            ))}
            <button className="nav-item nav-tv" onClick={openTv} title={`${t('nav.tv')} (F11)`}>
              <Icon name="gamepad" size={18} />
              <span className="nav-label">{t('nav.tv')}</span>
            </button>
          </nav>
          <div className="sidebar-spacer" />
          {hasUpdate &&
            (collapsed ? (
              <button
                className="rail-btn rail-update"
                disabled={update.status === 'installing'}
                onClick={() => run(api.installUpdate())}
                title={`${t('update.newVersion', { version: update.version })} · ${updateLabel}`}
              >
                <Icon name="refresh" size={18} className={update.status === 'installing' ? 'spin' : ''} />
              </button>
            ) : (
              <div className="update-card">
                <div className="update-title">{t('update.newVersion', { version: update.version })}</div>
                {update.notes && <div className="update-notes">{update.notes}</div>}
                <button className="btn btn-primary" disabled={update.status === 'installing'} onClick={() => run(api.installUpdate())}>
                  {updateLabel}
                </button>
              </div>
            ))}
          {running.length > 0 &&
            (collapsed ? (
              <button
                className="rail-btn rail-playing"
                onClick={() => setDetailId(running[0].id)}
                title={`${t('sidebar.nowPlaying')}: ${running.map((g) => g.name).join(', ')}`}
              >
                <span className="pulse" />
              </button>
            ) : (
              <div className="now-playing">
                <div className="now-playing-label">
                  <span className="pulse" /> {t('sidebar.nowPlaying')}
                </div>
                {running.map((g) => (
                  <button key={g.id} className="now-playing-game" onClick={() => setDetailId(g.id)}>
                    {g.name}
                  </button>
                ))}
              </div>
            ))}
          <SidebarScene theme={lib.settings.theme} small={collapsed} />
        </aside>
        <main className="content">
          {view === 'library' && <Library {...ctx} />}
          {view === 'uninstalled' && <Uninstalled {...ctx} />}
          {view === 'achievements' && <Achievements {...ctx} />}
          {view === 'lists' && <Lists {...ctx} />}
          {view === 'discover' && <Discover {...ctx} />}
          {view === 'stats' && <Stats {...ctx} />}
          {view === 'settings' && <Settings {...ctx} />}
        </main>
        {tv && <TvMode {...ctx} onExit={closeTv} />}
        {detailGame && <GameDetail {...ctx} game={detailGame} onClose={() => setDetailId(null)} />}
        {editGame && <EditGame {...ctx} game={editGame} onClose={() => setEditId(null)} />}
      </Fragment>
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
