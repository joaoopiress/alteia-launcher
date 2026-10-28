// Obtenção de capas (600x900) e imagens de fundo (hero) para cada jogo.
// Ordem: cache local da Steam -> CDN da Steam -> SteamGridDB (se houver chave).
const fs = require('fs');
const path = require('path');
const { t } = require('./i18n.cjs');

const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const SGDB_API = 'https://www.steamgriddb.com/api/v2';

function fileBase(gameId) {
  return gameId.replace(/[^a-z0-9_-]/gi, '_');
}

function extFromType(contentType, url) {
  if (/png/i.test(contentType || '')) return '.png';
  if (/webp/i.test(contentType || '')) return '.webp';
  const m = (url || '').match(/\.(png|jpe?g|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
}

async function download(url, destNoExt, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) return null;
  const file = destNoExt + extFromType(type, url);
  fs.writeFileSync(file, buf);
  return path.basename(file);
}

function copyLocal(src, destNoExt) {
  const file = destNoExt + path.extname(src).toLowerCase();
  fs.copyFileSync(src, file);
  return path.basename(file);
}

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, '');
}

// ---------- Steam Store ----------

async function steamAppName(appid) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=portuguese`);
    const json = await res.json();
    return json?.[appid]?.data?.name || null;
  } catch {
    return null;
  }
}

// Jogos que saíram da loja Steam (a pesquisa já não os encontra) mas cuja arte continua no CDN.
const KNOWN_APPIDS = {
  rocketleague: '252950',
};

// Arte escolhida na SteamGridDB para jogos que não existem na Steam. Os ficheiros do CDN
// são públicos, por isso funcionam mesmo sem chave da API.
const SGDB_CDN = 'https://cdn2.steamgriddb.com';
const KNOWN_ART = {
  valorant: {
    cover: `${SGDB_CDN}/grid/9edb6b9b7fc3b263b86740c635839dc4.png`,
    hero: `${SGDB_CDN}/hero/fb6c84779f12283a81d739d8f088fc12.jpg`,
  },
  leagueoflegends: {
    cover: `${SGDB_CDN}/grid/cf29ee336b07c0572c810f62f5543525.png`,
    hero: `${SGDB_CDN}/hero/d69116f8b0140cdeb1f99a4d5096ffe4.png`,
  },
  teamfighttactics: {
    cover: `${SGDB_CDN}/grid/7de938e934f13201785d12b0ebcd4b96.png`,
    hero: `${SGDB_CDN}/hero/c31cd9eb0233c998e5d682c4d826d8c6.png`,
  },
};

// Procura um jogo na loja Steam pelo nome e devolve o appid se o nome coincidir.
async function steamSearchAppid(name) {
  const known = KNOWN_APPIDS[normalizeName(name)];
  if (known) return known;
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=PT`
    );
    const json = await res.json();
    const target = normalizeName(name);
    const hit = (json.items || []).find((it) => normalizeName(it.name) === target);
    return hit ? String(hit.id) : null;
  } catch {
    return null;
  }
}

// ---------- SteamGridDB ----------

function sgdbHeaders(key) {
  return { Authorization: `Bearer ${key}` };
}

async function sgdbGet(key, endpoint) {
  const res = await fetch(SGDB_API + endpoint, { headers: sgdbHeaders(key) });
  if (res.status === 401) throw new Error(t('err.sgdbKey'));
  if (!res.ok) return [];
  const json = await res.json();
  return json.success ? json.data || [] : [];
}

async function sgdbSearch(key, term) {
  const data = await sgdbGet(key, `/search/autocomplete/${encodeURIComponent(term)}`);
  return data.map((g) => ({ id: g.id, name: g.name, year: g.release_date ? new Date(g.release_date * 1000).getFullYear() : null }));
}

async function sgdbGrids(key, sgdbGameId) {
  const data = await sgdbGet(key, `/grids/game/${sgdbGameId}?dimensions=600x900,342x482,660x930&types=static`);
  return data.map((g) => ({ url: g.url, thumb: g.thumb }));
}

async function sgdbHeroes(key, sgdbGameId) {
  const data = await sgdbGet(key, `/heroes/game/${sgdbGameId}?types=static`);
  return data.map((g) => ({ url: g.url, thumb: g.thumb }));
}

// ---------- Orquestração ----------

async function resolveArt(game, store) {
  const meta = store.meta(game.id);
  const dir = store.coversDir;
  const base = path.join(dir, fileBase(game.id));
  const has = (f) => f && fs.existsSync(path.join(dir, f));
  let changed = false;

  // Nome em falta (acontece em algumas manifests da Steam).
  if (game.source === 'steam' && !game.name && !meta.storeName) {
    const name = await steamAppName(game.appid);
    if (name) {
      meta.storeName = name;
      changed = true;
    }
  }

  const needCover = !has(meta.cover) && !meta.coverTried;
  const needHero = !has(meta.hero) && !meta.heroTried;
  if (!needCover && !needHero) return changed;

  const name = meta.name || game.name || meta.storeName || '';
  const known = KNOWN_ART[normalizeName(game.name || name)] || {};
  let appid = game.source === 'steam' ? game.appid : meta.steamAppid;
  if (!appid && game.source !== 'steam' && name) {
    appid = await steamSearchAppid(name);
    if (appid) meta.steamAppid = appid;
  }

  if (needCover) {
    let cover = null;
    if (game.localCover) cover = copyLocal(game.localCover, base + '_cover');
    if (!cover && appid) {
      cover =
        (await download(`${STEAM_CDN}/${appid}/library_600x900_2x.jpg`, base + '_cover')) ||
        (await download(`${STEAM_CDN}/${appid}/library_600x900.jpg`, base + '_cover'));
    }
    if (!cover && known.cover) cover = await download(known.cover, base + '_cover');
    const key = store.data.settings.sgdbKey;
    if (!cover && key && name) {
      try {
        const [hit] = await sgdbSearch(key, name);
        if (hit) {
          meta.sgdbId = hit.id;
          const [grid] = await sgdbGrids(key, hit.id);
          if (grid) cover = await download(grid.url, base + '_cover');
        }
      } catch {}
    }
    meta.cover = cover;
    meta.coverTried = Date.now();
    changed = true;
  }

  if (needHero) {
    let hero = null;
    if (game.localHero) hero = copyLocal(game.localHero, base + '_hero');
    if (!hero && appid) hero = await download(`${STEAM_CDN}/${appid}/library_hero.jpg`, base + '_hero');
    if (!hero && known.hero) hero = await download(known.hero, base + '_hero');
    const key = store.data.settings.sgdbKey;
    if (!hero && key && meta.sgdbId) {
      try {
        const [h] = await sgdbHeroes(key, meta.sgdbId);
        if (h) hero = await download(h.url, base + '_hero');
      } catch {}
    }
    meta.hero = hero;
    meta.heroTried = Date.now();
    changed = true;
  }
  return changed;
}

// Substitui a capa ou o fundo de um jogo a partir de um URL ou ficheiro escolhido pelo utilizador.
async function setArt(store, gameId, kind, { url, file }) {
  const meta = store.meta(gameId);
  const base = path.join(store.coversDir, `${fileBase(gameId)}_${kind}_${Date.now()}`);
  const saved = url ? await download(url, base) : copyLocal(file, base);
  if (!saved) throw new Error(t('err.image'));
  const old = meta[kind];
  meta[kind] = saved;
  meta[kind + 'Tried'] = Date.now();
  if (old && old !== saved) fs.rm(path.join(store.coversDir, old), { force: true }, () => {});
  return saved;
}

module.exports = { resolveArt, setArt, sgdbSearch, sgdbGrids, sgdbHeroes };
