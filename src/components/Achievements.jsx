import Icon from './Icon.jsx';
import { formatDate } from '../lib/time.js';
import { t } from '../lib/i18n.js';

// Cores dos troféus por nível, como nas consolas.
export const TIER_COLORS = {
  bronze: '#d08a4a',
  silver: '#c9d2dc',
  gold: '#f5c542',
  platinum: '#a7e3ff',
};

// Progresso em texto: horas, minutos (Maratona) ou contagem simples.
function progressText(a) {
  if (a.goal === undefined) return null;
  if (a.id === 'marathon') return `${Math.floor(a.current / 60)} h ${a.current % 60} min / 4 h`;
  if (a.id.startsWith('hours_')) return `${a.current} / ${a.goal} h`;
  return `${a.current} / ${a.goal}`;
}

function Card({ a }) {
  const pct = a.goal ? Math.round((a.current / a.goal) * 100) : 0;
  return (
    <li className={`ach-card ${a.done ? 'done' : 'locked'} tier-${a.tier}`}>
      <div className="ach-icon" style={{ color: a.done ? TIER_COLORS[a.tier] : undefined }}>
        <Icon name={a.done ? 'trophy' : 'lock'} size={36} />
      </div>
      <div className="ach-body">
        <div className="ach-name">{t(`ach.${a.id}.name`)}</div>
        <div className="ach-desc">{t(`ach.${a.id}.desc`)}</div>
        {a.done ? (
          <div className="ach-meta">
            <span className="ach-tier" style={{ color: TIER_COLORS[a.tier] }}>
              {t(`ach.tier.${a.tier}`)}
            </span>
            {a.unlockedAt && <span> · {t('ach.unlockedOn', { date: formatDate(a.unlockedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>}
          </div>
        ) : (
          a.goal !== undefined && (
            <div className="ach-progress">
              <div className="rank-track">
                <div className="rank-bar" style={{ width: `${pct}%` }} />
              </div>
              <span>{progressText(a)}</span>
            </div>
          )
        )}
      </div>
    </li>
  );
}

export default function Achievements({ lib }) {
  const list = lib.achievements;
  const done = list.filter((a) => a.done).sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0));
  // As que faltam aparecem primeiro as mais perto de serem desbloqueadas.
  const locked = list
    .filter((a) => !a.done)
    .sort((a, b) => (b.goal ? b.current / b.goal : 0) - (a.goal ? a.current / a.goal : 0));
  const byTier = (tier) => done.filter((a) => a.tier === tier).length;

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.achievements')}</h1>
      <div className="panel ach-summary">
        <div className="ach-summary-text">{t('ach.summary', { done: done.length, total: list.length })}</div>
        <div className="rank-track ach-summary-bar">
          <div className="rank-bar" style={{ width: `${(done.length / list.length) * 100}%` }} />
        </div>
        <div className="ach-tiers">
          {Object.keys(TIER_COLORS).map((tier) => (
            <span key={tier} style={{ color: TIER_COLORS[tier] }}>
              <Icon name="trophy" size={18} /> {byTier(tier)} {t(`ach.tier.${tier}`)}
            </span>
          ))}
        </div>
      </div>

      {done.length > 0 && (
        <section>
          <h2 className="section-title">{t('ach.unlockedTitle')}</h2>
          <ul className="ach-grid">
            {done.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
      {locked.length > 0 && (
        <section>
          <h2 className="section-title">{t('ach.lockedTitle')}</h2>
          <ul className="ach-grid">
            {locked.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
