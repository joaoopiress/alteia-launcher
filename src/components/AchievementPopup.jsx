import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { TIER_COLORS } from './Achievements.jsx';
import { setLang, t } from '../lib/i18n.js';
import sound from '../assets/achievement.mp3';

// Conteúdo da janelinha que aparece no canto do ecrã quando uma conquista é desbloqueada.
// O processo principal passa no endereço (#popup=...) qual conquista mostrar.
export default function AchievementPopup({ item }) {
  const [settings, setSettings] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    window.api.getLibrary().then((lib) => {
      setLang(lib.settings.language);
      document.documentElement.dataset.theme = lib.settings.theme || 'fogueira';
      setSettings(lib.settings);
      if (lib.settings.achievementSound !== false) {
        const audio = new Audio(sound);
        audio.volume = 0.8;
        audio.play().catch(() => {});
      }
    });
    // Sai de cena um pouco antes de a janela fechar.
    const timer = setTimeout(() => setLeaving(true), 5200);
    return () => clearTimeout(timer);
  }, []);

  if (!settings) return null;
  const tier = item.summary ? 'gold' : item.tier || 'platinum';
  return (
    <div className={`ach-popup ${leaving ? 'leaving' : ''}`}>
      <div className="ach-popup-icon" style={{ color: TIER_COLORS[tier] }}>
        <Icon name="trophy" size={45} />
      </div>
      <div className="ach-popup-text">
        <div className="ach-popup-title">{item.summary ? t('ach.popupTitle') : t('ach.popupTitle')}</div>
        <div className="ach-popup-name">
          {item.summary ? t('ach.popupSummary', { n: item.summary }) : t(`ach.${item.id}.name`)}
        </div>
        <div className="ach-popup-desc">
          {item.summary ? t('ach.popupSummaryHint') : t(`ach.${item.id}.desc`)}
        </div>
      </div>
    </div>
  );
}
