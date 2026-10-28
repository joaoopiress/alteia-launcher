// Todos os jogos que tens, instalados ou só na conta (Steam/Epic), num formato comum.
// Os não instalados usam o mesmo id que terão quando forem instalados (steam:<appid>, epic:<appName>).
export function allOwnedGames(lib) {
  const map = new Map();
  for (const g of lib.games) {
    if (g.hidden) continue;
    map.set(g.id, {
      id: g.id,
      name: g.name,
      cover: g.cover,
      source: g.source,
      installed: true,
      status: g.status,
      completedAt: g.completedAt,
      appid: g.id.startsWith('steam:') ? g.id.slice(6) : null,
      game: g,
    });
  }
  for (const n of lib.notInstalled) {
    if (map.has(n.id)) continue;
    map.set(n.id, {
      id: n.id,
      name: n.name,
      cover: n.cover,
      source: n.store,
      installed: false,
      status: n.status,
      completedAt: n.completedAt,
      appid: n.appid || null,
      owned: n,
    });
  }
  return map;
}

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Formata um preço da Steam (em euros).
export function formatPrice(price, freeLabel) {
  if (!price) return null;
  if (!price.final) return freeLabel;
  return `${price.final.toFixed(2).replace('.', ',')} €`;
}
