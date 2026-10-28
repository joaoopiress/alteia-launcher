import { useEffect, useMemo } from 'react';
import Icon from './Icon.jsx';
import Cover from './Cover.jsx';
import BarChart from './BarChart.jsx';
import TagEditor from './TagEditor.jsx';
import StatusPicker from './StatusPicker.jsx';
import {
  PLATFORMS,
  currentRanges,
  fillBuckets,
  formatBytes,
  formatClock,
  formatDate,
  formatDuration,
  platformLabel,
  relativeTime,
  timeInRange,
} from '../lib/time.js';
import { t } from '../lib/i18n.js';

function lastDays(n) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const a = new Date(today);
    a.setDate(a.getDate() - i);
    const b = new Date(a);
    b.setDate(b.getDate() + 1);
    out.push({
      start: a.getTime(),
      end: b.getTime(),
      label: String(a.getDate()),
      tip: formatDate(a, { weekday: 'long', day: 'numeric', month: 'long' }),
    });
  }
  return out;
}

export default function GameDetail({ game, lib, totals, run, api, openEdit, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sessions = useMemo(() => lib.sessions.filter((s) => s.gameId === game.id && s.end > s.start), [lib.sessions, game.id]);
  const buckets = useMemo(() => fillBuckets(lastDays(30), sessions), [sessions]);
  const names = useMemo(() => new Map([[game.id, game.name]]), [game]);

  const tot = totals.get(game.id) || { total: 0, tracked: 0, lastPlayed: 0 };
  const r = currentRanges();
  const isRunning = lib.running.includes(game.id);
  const platform = PLATFORMS[game.source];
  const recentSessions = [...sessions].sort((a, b) => b.start - a.start).slice(0, 6);

  const stats = [
    { label: t('detail.total'), value: tot.total > 0 ? formatDuration(tot.total) : '—' },
    { label: t('detail.today'), value: formatDuration(timeInRange(sessions, r.day, r.now)) },
    { label: t('detail.week'), value: formatDuration(timeInRange(sessions, r.week, r.now)) },
    { label: t('detail.month'), value: formatDuration(timeInRange(sessions, r.month, r.now)) },
    { label: t('detail.last'), value: isRunning ? t('detail.playingNow') : relativeTime(tot.lastPlayed) },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail" role="dialog" aria-label={game.name}>
        <div className="detail-hero">
          {game.hero ? <img src={game.hero} alt="" draggable={false} /> : <div className="detail-hero-blur"><Cover game={game} /></div>}
          <div className="detail-hero-shade" />
          <button className="icon-btn detail-close" onClick={onClose} title={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-head">
            <div className="detail-cover">
              <Cover game={game} />
            </div>
            <div className="detail-title">
              <span className="platform-tag" style={{ '--c': platform.color }}>
                {platformLabel(game.source)}
              </span>
              <h1>{game.name}</h1>
              <div className="detail-actions">
                <button className="btn btn-primary btn-lg" onClick={() => run(api.launch(game.id), t('common.launching', { name: game.name }))}>
                  <Icon name="play" size={18} />
                  {isRunning ? t('detail.running') : t('common.play')}
                </button>
                <button
                  className={`icon-btn ${game.favorite ? 'is-fav' : ''}`}
                  title={game.favorite ? t('detail.favRemove') : t('detail.favAdd')}
                  onClick={() => run(api.updateGame(game.id, { favorite: !game.favorite }))}
                >
                  <Icon name="heart" />
                </button>
                <button className="icon-btn" title={t('detail.openFolder')} onClick={() => run(api.openFolder(game.id))}>
                  <Icon name="folder" />
                </button>
                <button className="icon-btn" title={t('detail.edit')} onClick={() => openEdit(game.id)}>
                  <Icon name="edit" />
                </button>
                <button
                  className="icon-btn"
                  title={t('detail.hide')}
                  onClick={() => {
                    run(api.updateGame(game.id, { hidden: true }), t('detail.hidden', { name: game.name }));
                    onClose();
                  }}
                >
                  <Icon name="eyeOff" />
                </button>
                {game.source === 'manual' && (
                  <button
                    className="icon-btn danger"
                    title={t('detail.remove')}
                    onClick={() => {
                      if (confirm(t('detail.removeConfirm', { name: game.name }))) {
                        run(api.removeGame(game.id));
                        onClose();
                      }
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <StatusPicker game={game} api={api} run={run} />
          <TagEditor game={game} lib={lib} api={api} run={run} />

          <div className="stat-row">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>
          {game.baselineMinutes > 0 && (
            <p className="note">
              {t('detail.baseline', { time: formatDuration(game.baselineMinutes * 60_000) })}
            </p>
          )}

          <h3 className="sub-title">{t('detail.last30')}</h3>
          <BarChart buckets={buckets} gameNames={names} height={170} emptyText={t('detail.last30Empty')} />

          <div className="detail-columns">
            <div>
              <h3 className="sub-title">{t('detail.recentSessions')}</h3>
              {recentSessions.length === 0 ? (
                <p className="muted">{t('detail.noSessions')}</p>
              ) : (
                <ul className="session-list">
                  {recentSessions.map((s) => (
                    <li key={s.start}>
                      <span>
                        {formatDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatClock(s.start)}
                      </span>
                      <span className="session-dur">{formatDuration(s.end - s.start)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="sub-title">{t('detail.info')}</h3>
              <dl className="info">
                <dt>{t('detail.folder')}</dt>
                <dd title={game.installDir}>{game.installDir}</dd>
                {game.exePath && (
                  <>
                    <dt>{t('detail.exe')}</dt>
                    <dd title={game.exePath}>{game.exePath.split('\\').pop()}</dd>
                  </>
                )}
                <dt>{t('detail.size')}</dt>
                <dd>{formatBytes(game.sizeOnDisk)}</dd>
                <dt>{t('detail.sessions')}</dt>
                <dd>{sessions.length}</dd>
                <dt>{t('detail.avg')}</dt>
                <dd>{sessions.length ? formatDuration(tot.tracked / sessions.length) : '—'}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
