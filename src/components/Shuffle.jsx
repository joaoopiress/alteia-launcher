import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import { formatDuration, relativeTime } from '../lib/time.js';
import { t } from '../lib/i18n.js';

// Intervalos entre capas durante o sorteio: começa rápido e vai abrandando, como uma roleta.
const STEPS = [60, 60, 60, 70, 70, 80, 90, 100, 120, 140, 170, 210, 260, 330];

function randomIndex(n, avoid) {
  if (n <= 1) return 0;
  let i;
  do {
    i = Math.floor(Math.random() * n);
  } while (i === avoid);
  return i;
}

export default function Shuffle({ pool, totals, api, run, openDetail, onClose }) {
  const [index, setIndex] = useState(() => randomIndex(pool.length));
  const [rolling, setRolling] = useState(true);
  const timers = useRef([]);

  const roll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRolling(true);
    let elapsed = 0;
    STEPS.forEach((ms, step) => {
      elapsed += ms;
      timers.current.push(
        setTimeout(() => {
          setIndex((prev) => randomIndex(pool.length, prev));
          if (step === STEPS.length - 1) setRolling(false);
        }, elapsed)
      );
    });
  }, [pool.length]);

  useEffect(() => {
    roll();
    return () => timers.current.forEach(clearTimeout);
  }, [roll]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A lista pode encolher enquanto o diálogo está aberto (ex.: um jogo desinstalado).
  const game = pool[Math.min(index, pool.length - 1)];
  const tot = totals.get(game.id) || {};

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog shuffle ${rolling ? 'rolling' : 'done'}`} role="dialog" aria-label={t('lib.shuffle')}>
        <h2>{t('shuffle.title')}</h2>
        <p className="shuffle-sub">{rolling ? t('shuffle.rolling') : t('shuffle.done')}</p>
        <div className="shuffle-cover">
          <Cover game={game} />
        </div>
        <div className="shuffle-name">{game.name}</div>
        <div className="shuffle-meta">
          {rolling
            ? ' '
            : tot.total > 0
              ? t('shuffle.played', { time: formatDuration(tot.total, { short: true }), when: relativeTime(tot.lastPlayed) })
              : t('shuffle.fresh')}
        </div>
        <div className="shuffle-actions">
          <button
            className="btn btn-primary"
            disabled={rolling}
            onClick={() => {
              api.achievementEvent('dice');
              run(api.launch(game.id), t('common.launching', { name: game.name }));
              onClose();
            }}
          >
            <Icon name="play" size={18} />
            {t('common.play')}
          </button>
          <button className="btn" disabled={rolling || pool.length < 2} onClick={roll}>
            <Icon name="dice" size={18} />
            {t('shuffle.again')}
          </button>
          <button
            className="btn btn-ghost"
            disabled={rolling}
            onClick={() => {
              onClose();
              openDetail(game.id);
            }}
          >
            {t('shuffle.details')}
          </button>
        </div>
      </div>
    </div>
  );
}
