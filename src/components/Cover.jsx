import { useState } from 'react';
import { platformLabel } from '../lib/time.js';

function hueFor(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Capa do jogo; sem imagem, mostra um cartão gerado com o nome.
export default function Cover({ game, className = '' }) {
  const [brokenSrc, setBrokenSrc] = useState(null);
  if (game.cover && brokenSrc !== game.cover) {
    return (
      <img
        className={`cover-img ${className}`}
        src={game.cover}
        alt={game.name}
        draggable={false}
        loading="lazy"
        onError={() => setBrokenSrc(game.cover)}
      />
    );
  }
  const h = hueFor(game.name);
  return (
    <div
      className={`cover-placeholder ${className}`}
      style={{
        background: `linear-gradient(160deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 60% 14%))`,
      }}
    >
      <span className="cover-placeholder-name">{game.name}</span>
      <span className="cover-placeholder-source">{platformLabel(game.source)}</span>
      {game.coverPending && <span className="cover-loading" />}
    </div>
  );
}
