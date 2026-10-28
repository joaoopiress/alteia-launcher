import { formatDate } from '../lib/time.js';
import { t } from '../lib/i18n.js';

const STATUSES = ['backlog', 'playing', 'completed', 'dropped'];

// Estado do jogo; carregar no estado já escolhido tira-o.
export default function StatusPicker({ game, api, run }) {
  return (
    <div className="status-picker">
      <span className="tags-label">{t('status.title')}</span>
      <div className="segmented">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`status-${s} ${game.status === s ? 'active' : ''}`}
            onClick={() => run(api.updateGame(game.id, { status: game.status === s ? null : s }))}
          >
            {t(`status.${s}`)}
          </button>
        ))}
      </div>
      {game.status === 'completed' && game.completedAt && (
        <span className="muted">{t('status.completedOn', { date: formatDate(game.completedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
      )}
    </div>
  );
}
