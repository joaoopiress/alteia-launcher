import { useState } from 'react';
import Icon from './Icon.jsx';
import { list, t } from '../lib/i18n.js';

// Coleções de um jogo: etiquetas removíveis e um campo para juntar o jogo a uma coleção
// (nova ou já existente).
export default function TagEditor({ game, lib, api, run }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  const has = (tag) => game.tags.some((x) => x.toLowerCase() === tag.toLowerCase());
  const suggestions = [...new Set([...lib.collections, ...list('tags.suggestions')])].filter((tag) => !has(tag));

  function save(tags) {
    run(api.updateGame(game.id, { tags }));
  }

  function add(tag) {
    const clean = tag.trim();
    if (!clean) return;
    if (!has(clean)) save([...game.tags, clean]);
    setValue('');
    setAdding(false);
  }

  return (
    <div className="tags">
      <span className="tags-label">
        <Icon name="tag" size={18} />
        {t('tags.title')}
      </span>
      {game.tags.map((tag) => (
        <span key={tag} className="chip chip-tag tag-pill">
          {tag}
          <button
            className="tag-remove"
            title={t('tags.remove', { tag })}
            aria-label={t('tags.remove', { tag })}
            onClick={() => save(game.tags.filter((x) => x !== tag))}
          >
            <Icon name="close" size={9} />
          </button>
        </span>
      ))}
      {adding ? (
        <form
          className="tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            add(value);
          }}
        >
          <input
            className="input"
            autoFocus
            value={value}
            maxLength={40}
            placeholder={t('tags.placeholder')}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setAdding(false);
              }
            }}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={!value.trim()}>
            {t('tags.addButton')}
          </button>
          {suggestions.slice(0, 8).map((tag) => (
            <button key={tag} type="button" className="chip chip-tag" onClick={() => add(tag)}>
              <Icon name="plus" size={9} />
              {tag}
            </button>
          ))}
        </form>
      ) : (
        <button className="chip chip-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          {t('tags.add')}
        </button>
      )}
    </div>
  );
}
