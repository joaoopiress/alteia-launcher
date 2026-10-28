import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { formatClock, formatDuration, platformLabel, relativeTime } from '../lib/time.js';
import { t } from '../lib/i18n.js';
import logo from '../assets/logo.png';

// Botões do comando no "standard mapping" do Gamepad API (Xbox / PlayStation).
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const REPEAT_DELAY = 380; // ms até começar a repetir ao manter uma direção
const REPEAT_RATE = 110;
const STICK = 0.55;

const GAP = 26;
// Largura das capas proporcional à altura do ecrã (cabe sempre a fila e a barra de botões).
const itemWidth = (h) => Math.round(Math.min(230, Math.max(130, h * 0.2)));

function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Modo de ecrã inteiro para jogar no sofá: uma fila de capas navegável com o comando.
export default function TvMode({ lib, totals, api, run, onExit }) {
  const games = lib.games.filter((g) => !g.hidden);
  const now = useClock();

  // Categorias (só aparecem as que têm jogos, exceto "Todos").
  const categories = useMemo(() => {
    const asItem = (g) => ({ key: g.id, kind: 'game', game: g, name: g.name, cover: g.cover, hero: g.hero, source: g.source });
    const tot = (g) => totals.get(g.id) || {};
    const byName = (a, b) => a.name.localeCompare(b.name);
    const cats = [];
    const recent = games.filter((g) => tot(g).lastPlayed > 0).sort((a, b) => tot(b).lastPlayed - tot(a).lastPlayed);
    if (recent.length) cats.push({ id: 'recent', label: t('tv.recent'), items: recent.map(asItem) });
    cats.push({ id: 'all', label: t('tv.all'), items: [...games].sort(byName).map(asItem) });
    const favs = games.filter((g) => g.favorite).sort(byName);
    if (favs.length) cats.push({ id: 'fav', label: t('tv.favorites'), items: favs.map(asItem) });
    for (const tag of lib.collections) {
      const inTag = games.filter((g) => g.tags.includes(tag)).sort(byName);
      if (inTag.length) cats.push({ id: `tag:${tag}`, label: tag, items: inTag.map(asItem) });
    }
    if (lib.notInstalled.length) {
      cats.push({
        id: 'uninstalled',
        label: t('tv.uninstalled'),
        items: [...lib.notInstalled].sort(byName).map((g) => ({
          key: `owned:${g.id}`,
          kind: 'owned',
          ownedId: g.id,
          name: g.name,
          cover: g.cover,
          hero: g.hero,
          source: g.store,
          minutes: g.minutes,
          lastPlayed: g.lastPlayed,
        })),
      });
    }
    return cats;
  }, [games, totals, lib.collections, lib.notInstalled]);

  const [catIndex, setCatIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [usingPad, setUsingPad] = useState(false);
  const randomKey = useRef(null);
  const rowRef = useRef(null);
  const [rowWidth, setRowWidth] = useState(1200);
  const [itemW, setItemW] = useState(() => itemWidth(window.innerHeight));
  useEffect(() => {
    const onResize = () => setItemW(itemWidth(window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cat = categories[Math.min(catIndex, categories.length - 1)];
  const items = cat.items;
  const sel = items[Math.min(index, items.length - 1)];

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRowWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const changeCat = useCallback(
    (dir) => {
      if (rolling) return;
      setCatIndex((c) => (c + dir + categories.length) % categories.length);
      setIndex(0);
    },
    [categories.length, rolling]
  );

  const move = useCallback(
    (dir) => {
      if (rolling) return;
      setIndex((i) => Math.max(0, Math.min(items.length - 1, i + dir)));
    },
    [items.length, rolling]
  );

  const activate = useCallback(() => {
    if (!sel || rolling) return;
    if (sel.kind === 'owned') {
      run(api.installOwned(sel.ownedId), t('unin.installing', { name: sel.name }));
      return;
    }
    if (randomKey.current === sel.key) api.achievementEvent('dice');
    run(api.launch(sel.game.id), t('common.launching', { name: sel.name }));
  }, [sel, rolling, api, run]);

  const toggleFavorite = useCallback(() => {
    if (sel?.kind === 'game') run(api.updateGame(sel.game.id, { favorite: !sel.game.favorite }));
  }, [sel, api, run]);

  // Roleta: a seleção salta por várias capas, cada vez mais devagar, até parar numa ao calhas.
  const randomPick = useCallback(() => {
    if (rolling || items.length < 2) return;
    setRolling(true);
    const steps = [60, 60, 70, 80, 90, 110, 130, 160, 200, 250, 320];
    let elapsed = 0;
    let current = index;
    steps.forEach((ms, i) => {
      elapsed += ms;
      setTimeout(() => {
        let next;
        do next = Math.floor(Math.random() * items.length);
        while (next === current);
        current = next;
        setIndex(next);
        if (i === steps.length - 1) {
          randomKey.current = items[next].key;
          setRolling(false);
        }
      }, elapsed);
    });
  }, [rolling, items, index]);

  // Uma única função trata comando, teclado e rato.
  const handlers = useRef({});
  handlers.current = {
    left: () => move(-1),
    right: () => move(1),
    up: () => changeCat(-1),
    down: () => changeCat(1),
    lb: () => changeCat(-1),
    rb: () => changeCat(1),
    a: activate,
    x: randomPick,
    y: toggleFavorite,
    menu: onExit,
  };

  // Teclado.
  useEffect(() => {
    const keys = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      q: 'lb',
      e: 'rb',
      Enter: 'a',
      ' ': 'a',
      r: 'x',
      f: 'y',
      Escape: 'menu',
      F11: 'menu',
    };
    const onKey = (ev) => {
      const action = keys[ev.key] || keys[ev.key.toLowerCase?.()];
      if (!action) return;
      ev.preventDefault();
      setUsingPad(false);
      handlers.current[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Comando: lê o estado em cada frame e trata "carregar" e "manter" das direções.
  useEffect(() => {
    let frame;
    const prev = {};
    const held = {};
    const tick = () => {
      frame = requestAnimationFrame(tick);
      // Com um jogo à frente, a ALTEIA não reage ao comando.
      if (!document.hasFocus()) return;
      const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      if (!pad) return;
      const b = (i) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const state = {
        left: b(BTN.LEFT) || ax < -STICK,
        right: b(BTN.RIGHT) || ax > STICK,
        up: b(BTN.UP) || ay < -STICK,
        down: b(BTN.DOWN) || ay > STICK,
        lb: b(BTN.LB),
        rb: b(BTN.RB),
        a: b(BTN.A),
        x: b(BTN.X),
        y: b(BTN.Y),
        menu: b(BTN.MENU),
      };
      const t0 = performance.now();
      for (const [name, pressed] of Object.entries(state)) {
        if (pressed && !prev[name]) {
          setUsingPad(true);
          handlers.current[name]();
          held[name] = t0 + REPEAT_DELAY;
        } else if (pressed && ['left', 'right'].includes(name) && t0 >= held[name]) {
          handlers.current[name]();
          held[name] = t0 + REPEAT_RATE;
        }
        prev[name] = pressed;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // A fila desliza para manter a capa escolhida a cerca de um terço do ecrã.
  const selIndex = Math.min(index, items.length - 1);
  const offset = Math.max(0, selIndex * (itemW + GAP) - rowWidth * 0.3);

  const tot = sel?.kind === 'game' ? totals.get(sel.game.id) || {} : null;
  const isRunning = sel?.kind === 'game' && lib.running.includes(sel.game.id);
  const hours = sel?.kind === 'game' ? tot.total : (sel?.minutes || 0) * 60_000;
  const lastPlayed = sel?.kind === 'game' ? tot.lastPlayed : sel?.lastPlayed;

  const hint = (btn, label, action) => (
    <button className="tv-hint" onClick={() => handlers.current[action]()}>
      <span className={`tv-btn tv-btn-${btn.toLowerCase()}`}>{btn}</span>
      {label}
    </button>
  );

  return (
    <div className={`tv ${usingPad ? 'pad' : ''}`} onMouseMove={() => usingPad && setUsingPad(false)}>
      <div className="tv-bg" key={sel?.key}>
        {sel?.hero || sel?.cover ? <img src={sel.hero || sel.cover} alt="" /> : null}
      </div>
      <div className="tv-shade" />

      <header className="tv-top">
        <img className="tv-logo" src={logo} alt="" />
        <nav className="tv-tabs">
          <span className="tv-btn tv-btn-lb">LB</span>
          {categories.map((c, i) => (
            <button
              key={c.id}
              className={`tv-tab ${i === catIndex ? 'active' : ''}`}
              onClick={() => {
                setCatIndex(i);
                setIndex(0);
              }}
            >
              {c.id.startsWith('tag:') && <Icon name="tag" size={18} />}
              {c.label}
            </button>
          ))}
          <span className="tv-btn tv-btn-rb">RB</span>
        </nav>
        <div className="tv-clock">{formatClock(now)}</div>
      </header>

      <section className="tv-info">
        {sel ? (
          <>
            <div className="tv-platform">{platformLabel(sel.source)}</div>
            <h1 className="tv-name">{sel.name}</h1>
            <div className="tv-meta">
              {isRunning ? (
                <span className="badge-live">{t('tv.playingNow')}</span>
              ) : (
                <>
                  {hours > 0 && <span>{t('tv.hours', { time: formatDuration(hours, { short: true }) })}</span>}
                  {lastPlayed > 0 && <span>{t('tv.lastPlayed', { when: relativeTime(lastPlayed) })}</span>}
                </>
              )}
              {sel.kind === 'game' && sel.game.favorite && (
                <span className="tv-fav">
                  <Icon name="heart" size={18} />
                </span>
              )}
            </div>
          </>
        ) : (
          <h1 className="tv-name">{t('tv.empty')}</h1>
        )}
      </section>

      <div className="tv-row" ref={rowRef}>
        <div className="tv-track" style={{ transform: `translateX(${-offset}px)` }}>
          {items.map((it, i) => (
            <button
              key={it.key}
              className={`tv-item ${i === selIndex ? 'selected' : ''} ${it.kind === 'owned' ? 'not-installed' : ''}`}
              style={{ width: itemW }}
              onClick={() => (i === selIndex ? activate() : setIndex(i))}
            >
              <Cover game={{ name: it.name, source: it.source, cover: it.cover }} />
            </button>
          ))}
        </div>
      </div>

      <footer className="tv-hints">
        {hint('A', sel?.kind === 'owned' ? t('tv.install') : t('tv.play'), 'a')}
        {hint('X', t('tv.random'), 'x')}
        {sel?.kind === 'game' && hint('Y', t('tv.favorite'), 'y')}
        {hint('☰', t('tv.exit'), 'menu')}
        <span className="tv-keys">{t('tv.keyboardHint')}</span>
      </footer>
    </div>
  );
}
