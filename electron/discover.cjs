// Ligação às lojas (sem chaves nem login): pesquisa e preços da Steam, etiquetas do SteamSpy,
// jogos grátis da Epic e o cálculo das recomendações a partir do que mais jogas.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const COUNTRY = 'PT';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ALTEIA' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ---------- Steam ----------

function priceOf(p) {
  if (!p) return null;
  return {
    final: p.final / 100,
    initial: (p.initial || p.final) / 100,
    discount: p.discount_percent ?? (p.initial ? Math.round((1 - p.final / p.initial) * 100) : 0),
    currency: p.currency || 'EUR',
  };
}

async function searchSteam(term, lang) {
  const json = await getJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=${lang === 'pt' ? 'portuguese' : 'english'}&cc=${COUNTRY}`
  );
  return (json.items || [])
    // A pesquisa também devolve bandas sonoras e outros extras vendidos como "app".
    .filter((it) => it.type === 'app' && !/\b(soundtrack|ost|artbook|wallpapers?)\b/i.test(it.name))
    .map((it) => ({
      appid: String(it.id),
      name: it.name,
      price: it.price ? priceOf(it.price) : { final: 0, initial: 0, discount: 0, currency: 'EUR' },
      cover: `media://steamart/${it.id}/cover`,
    }));
}

// Preços atuais (com desconto) de vários jogos de uma vez.
async function steamPrices(appids) {
  const out = {};
  for (let i = 0; i < appids.length; i += 40) {
    const chunk = appids.slice(i, i + 40);
    try {
      const json = await getJson(
        `https://store.steampowered.com/api/appdetails?appids=${chunk.join(',')}&filters=price_overview&cc=${COUNTRY}`
      );
      for (const id of chunk) {
        const entry = json[id];
        if (!entry?.success) continue;
        out[id] = Array.isArray(entry.data) ? { final: 0, initial: 0, discount: 0, currency: 'EUR' } : priceOf(entry.data?.price_overview);
      }
    } catch {}
  }
  return out;
}

// ---------- SteamSpy (etiquetas), com fila de 1 pedido por segundo e cache ----------

let spyQueue = Promise.resolve();
function spy(url) {
  const run = spyQueue.then(() => getJson(url));
  spyQueue = run.catch(() => {}).then(() => sleep(1100));
  return run;
}

async function appTags(appid, cache) {
  cache.spyApp ||= {};
  const hit = cache.spyApp[appid];
  if (hit && Date.now() - hit.at < 14 * DAY) return hit;
  try {
    const json = await spy(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
    const entry = { at: Date.now(), tags: Array.isArray(json.tags) ? {} : json.tags || {}, name: json.name || '' };
    cache.spyApp[appid] = entry;
    return entry;
  } catch {
    return { tags: {} };
  }
}

async function gamesWithTag(tag, cache) {
  cache.spyTag ||= {};
  const hit = cache.spyTag[tag];
  if (hit && Date.now() - hit.at < 3 * DAY) return hit.games;
  try {
    const json = await spy(`https://steamspy.com/api.php?request=tag&tag=${encodeURIComponent(tag)}`);
    // Guarda só o essencial dos jogos com muitas avaliações (o resto não é recomendado).
    const games = {};
    for (const [appid, g] of Object.entries(json)) {
      if ((g.positive || 0) + (g.negative || 0) >= 2000) games[appid] = { name: g.name, positive: g.positive, negative: g.negative };
    }
    cache.spyTag[tag] = { at: Date.now(), games };
    return games;
  } catch {
    return {};
  }
}

// Encontra o appid da Steam de um jogo de outra loja pelo nome (só se o nome coincidir).
async function steamAppidForName(name, cache) {
  cache.nameToAppid ||= {};
  const key = normName(name);
  if (key in cache.nameToAppid) return cache.nameToAppid[key];
  let appid = null;
  try {
    const items = await searchSteam(name, 'en');
    appid = items.find((it) => normName(it.name) === key)?.appid || null;
  } catch {}
  cache.nameToAppid[key] = appid;
  return appid;
}

// ---------- Epic: jogos grátis da semana ----------

async function epicFreeGames() {
  const json = await getJson(
    `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-PT&country=${COUNTRY}&allowCountries=${COUNTRY}`
  );
  const out = [];
  for (const el of json?.data?.Catalog?.searchStore?.elements || []) {
    const now = el.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    const next = el.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
    const offer = now || next;
    if (!offer || offer.discountSetting?.discountPercentage !== 0) continue;
    const img = (types) => types.map((t) => el.keyImages?.find((k) => k.type === t)?.url).find(Boolean) || null;
    const slug = el.productSlug || el.offerMappings?.[0]?.pageSlug || el.catalogNs?.mappings?.[0]?.pageSlug;
    out.push({
      title: el.title,
      cover: img(['OfferImageTall', 'DieselStoreFrontTall', 'Thumbnail', 'OfferImageWide']),
      url: slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/free-games',
      start: Date.parse(offer.startDate),
      end: Date.parse(offer.endDate),
      upcoming: !now,
    });
  }
  return out;
}

// ---------- Recomendações ----------

// Perfil de gosto: soma das etiquetas dos jogos mais jogados, pesadas pelas horas
// (em escala logarítmica, para um jogo de 300 h não apagar todos os outros).
async function buildProfile(played, cache) {
  const weights = {};
  const source = {}; // etiqueta -> jogo que mais contribuiu (para explicar a recomendação)
  for (const game of played) {
    const { tags } = await appTags(game.appid, cache);
    const top = Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const max = top[0]?.[1] || 1;
    const w = Math.log10(1 + game.ms / HOUR);
    for (const [tag, votes] of top) {
      const contrib = w * (votes / max);
      weights[tag] = (weights[tag] || 0) + contrib;
      if (!source[tag] || contrib > source[tag].contrib) source[tag] = { name: game.name, contrib };
    }
  }
  // Etiquetas genéricas demais (ou de modo de jogo) para distinguir gostos: contam pouco,
  // senão "Competitive" ou "Online Co-Op" juntam jogos que nada têm a ver (Tetris e CS2).
  for (const generic of ['Singleplayer', 'Multiplayer', 'Great Soundtrack', 'Free to Play', 'Early Access', 'Indie', 'Action', 'Adventure', ...BROAD_TAGS]) {
    if (weights[generic]) weights[generic] *= 0.3;
  }
  const tags = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, weight]) => ({ tag, weight, because: source[tag]?.name }));
  return { tags, weights, source };
}

// Etiquetas que descrevem o modo de jogo e não o género: servem para pontuar, mas não para
// explicar ("porque jogas FIFA 22" diz mais num jogo de futebol do que "porque é competitivo").
const BROAD_TAGS = new Set(['Competitive', 'PvP', 'Multiplayer', 'Online Co-Op', 'Co-op', 'Controller', 'Casual', 'Team-Based', 'Fast-Paced', 'First-Person', 'Third Person']);

function specificFirst(tags) {
  return [...tags].sort((a, b) => BROAD_TAGS.has(a) - BROAD_TAGS.has(b));
}

function scoreTags(tags, profile) {
  const top = Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const max = top[0]?.[1] || 1;
  let score = 0;
  const matched = [];
  for (const [tag, votes] of top) {
    const w = profile.weights[tag];
    if (!w) continue;
    score += w * (votes / max);
    matched.push({ tag, w });
  }
  matched.sort((a, b) => b.w - a.w);
  return { score, matched: specificFirst(matched.slice(0, 3).map((m) => m.tag)) };
}

// Jogos da loja Steam com as tuas etiquetas favoritas que ainda não tens.
async function storeRecommendations(profile, ownedAppids, ownedNames, cache) {
  const topTags = profile.tags.filter((tg) => !BROAD_TAGS.has(tg.tag)).slice(0, 5);
  const candidates = new Map();
  for (const { tag, weight } of topTags) {
    const games = await gamesWithTag(tag, cache);
    for (const [appid, g] of Object.entries(games)) {
      if (ownedAppids.has(appid) || ownedNames.has(normName(g.name))) continue;
      const c = candidates.get(appid) || { appid, name: g.name, positive: g.positive, negative: g.negative, score: 0, tags: [] };
      c.score += weight;
      c.tags.push(tag);
      candidates.set(appid, c);
    }
  }
  // A lista por etiqueta do SteamSpy inclui jogos onde alguém pôs a etiqueta com poucos votos
  // (há "FPS" em jogos que não o são). Por isso serve só para escolher candidatos: os mais
  // populares que aparecem em várias das tuas etiquetas. Depois, cada um é pontuado com as
  // suas etiquetas reais (com votos), como os jogos da biblioteca.
  const shortlist = [...candidates.values()]
    .map((c) => ({ ...c, quality: c.positive / (c.positive + c.negative) }))
    .filter((c) => c.quality >= 0.75)
    .sort((a, b) => b.score * Math.log10(b.positive) - a.score * Math.log10(a.positive))
    .slice(0, 40);
  const scored = [];
  for (const c of shortlist) {
    const { tags } = await appTags(c.appid, cache);
    const { score, matched } = scoreTags(tags, profile);
    if (score > 0 && matched.length) scored.push({ ...c, score: score * c.quality * c.quality, tags: matched });
  }
  const seen = new Set();
  const ranked = scored
    .sort((a, b) => b.score - a.score)
    // A Steam tem por vezes duas entradas com o mesmo nome (ex.: versões antigas).
    .filter((c) => !seen.has(normName(c.name)) && seen.add(normName(c.name)))
    .slice(0, 18);
  const prices = await steamPrices(ranked.map((c) => c.appid));
  return ranked.map((c) => ({
    appid: c.appid,
    name: c.name,
    cover: `media://steamart/${c.appid}/cover`,
    price: prices[c.appid] || null,
    rating: Math.round(c.quality * 100),
    tags: c.tags.slice(0, 3),
    because: profile.source[c.tags[0]]?.name || null,
  }));
}

// Jogos que já tens (instalados ou não) e quase não jogaste, que combinam com o teu gosto.
async function libraryRecommendations(profile, candidates, cache, maxLookups = 30) {
  const out = [];
  let lookups = 0;
  for (const c of candidates) {
    let appid = c.appid;
    if (!appid) {
      const key = normName(c.name);
      if (!(cache.nameToAppid && key in cache.nameToAppid) && lookups >= maxLookups) continue;
      if (!(cache.nameToAppid && key in cache.nameToAppid)) lookups++;
      appid = await steamAppidForName(c.name, cache);
    }
    if (!appid) continue;
    const { tags } = await appTags(appid, cache);
    const { score, matched } = scoreTags(tags, profile);
    if (score > 0 && matched.length) out.push({ ...c, score, tags: matched, because: profile.source[matched[0]]?.name || null });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

module.exports = {
  searchSteam,
  steamPrices,
  epicFreeGames,
  buildProfile,
  storeRecommendations,
  libraryRecommendations,
  steamAppidForName,
  normName,
};
