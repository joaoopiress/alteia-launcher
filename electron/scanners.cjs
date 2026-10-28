// Deteção dos jogos instalados em cada loja, a partir dos ficheiros locais.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseVdf } = require('./vdf.cjs');
const { readOwnedAppIds, readAppInfo } = require('./steamBinary.cjs');

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// ---------- Steam ----------

// Ferramentas e componentes que a Steam instala mas não são jogos.
const STEAM_TOOL_IDS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '250820']);
const STEAM_TOOL_NAME = /redistributable|proton|steam linux runtime|steamvr|steamworks/i;

function findSteamPath() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (m) return path.normalize(m[1].trim());
  } catch {}
  const fallback = 'C:\\Program Files (x86)\\Steam';
  return exists(fallback) ? fallback : null;
}

// Tempo de jogo e última sessão que a própria Steam guarda por utilizador.
function readSteamPlaytime(steamPath) {
  const result = {};
  const userdata = path.join(steamPath, 'userdata');
  let users = [];
  try {
    users = fs.readdirSync(userdata);
  } catch {
    return result;
  }
  for (const user of users) {
    const text = readText(path.join(userdata, user, 'config', 'localconfig.vdf'));
    if (!text) continue;
    const apps = parseVdf(text)?.userlocalconfigstore?.software?.valve?.steam?.apps || {};
    for (const [appid, info] of Object.entries(apps)) {
      const minutes = Number(info.playtime || 0);
      const lastPlayed = Number(info.lastplayed || 0) * 1000;
      const prev = result[appid] || { minutes: 0, lastPlayed: 0 };
      result[appid] = {
        minutes: prev.minutes + minutes,
        lastPlayed: Math.max(prev.lastPlayed, lastPlayed),
      };
    }
  }
  return result;
}

function findSteamCachedArt(steamPath, appid, fileName) {
  const base = path.join(steamPath, 'appcache', 'librarycache', appid);
  const direct = path.join(base, fileName);
  if (exists(direct)) return direct;
  // Versões recentes da Steam guardam a arte em subpastas com hash.
  try {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(base, entry.name, fileName);
      if (exists(candidate)) return candidate;
    }
  } catch {}
  // Formato antigo: librarycache/<appid>_library_600x900.jpg
  const legacy = path.join(steamPath, 'appcache', 'librarycache', `${appid}_${fileName}`);
  return exists(legacy) ? legacy : null;
}

// Todas as pastas de biblioteca da Steam (a principal e as de outros discos).
function steamLibraries(steamPath) {
  const text = readText(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'));
  const libraries = [steamPath];
  if (text) {
    const folders = parseVdf(text).libraryfolders || {};
    for (const f of Object.values(folders)) {
      if (f && f.path && !libraries.some((l) => l.toLowerCase() === path.normalize(f.path).toLowerCase())) {
        libraries.push(path.normalize(f.path));
      }
    }
  }
  return libraries;
}

// Bit 4 de StateFlags = totalmente instalado (enquanto descarrega, o jogo ainda não aparece).
const STEAM_FULLY_INSTALLED = 4;

function scanSteam() {
  const steamPath = findSteamPath();
  if (!steamPath) return [];
  const libraries = steamLibraries(steamPath);

  const playtime = readSteamPlaytime(steamPath);
  const games = [];
  for (const lib of libraries) {
    const steamapps = path.join(lib, 'steamapps');
    let files = [];
    try {
      files = fs.readdirSync(steamapps).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      const manifest = parseVdf(readText(path.join(steamapps, file)) || '').appstate;
      if (!manifest) continue;
      const appid = manifest.appid;
      const name = manifest.name || '';
      if (STEAM_TOOL_IDS.has(appid) || STEAM_TOOL_NAME.test(name)) continue;
      if (!(Number(manifest.stateflags || 0) & STEAM_FULLY_INSTALLED)) continue;
      const installDir = path.join(steamapps, 'common', manifest.installdir || '');
      if (!manifest.installdir || !exists(installDir)) continue;
      const pt = playtime[appid] || { minutes: 0, lastPlayed: 0 };
      games.push({
        id: `steam:${appid}`,
        source: 'steam',
        appid,
        // Algumas manifests vêm sem nome ("appid_730"); o nome real é obtido depois.
        name: /^appid_\d+$/.test(name) ? '' : name,
        installDir,
        sizeOnDisk: Number(manifest.sizeondisk || 0),
        launch: { type: 'uri', uri: `steam://rungameid/${appid}` },
        externalMinutes: pt.minutes,
        externalLastPlayed: Math.max(pt.lastPlayed, Number(manifest.lastplayed || 0) * 1000),
        localCover: findSteamCachedArt(steamPath, appid, 'library_600x900.jpg'),
        localHero: findSteamCachedArt(steamPath, appid, 'library_hero.jpg'),
      });
    }
  }
  return games;
}

// Jogos da conta Steam (licenças guardadas pelo cliente), instalados ou não.
// 480 é o "Spacewar", uma app de testes que a Steam dá a toda a gente.
const STEAM_IGNORED_OWNED = new Set(['480']);

function scanSteamOwned() {
  const steamPath = findSteamPath();
  if (!steamPath) return [];
  const cache = path.join(steamPath, 'appcache');
  const owned = readOwnedAppIds(path.join(cache, 'packageinfo.vdf'));
  const info = readAppInfo(path.join(cache, 'appinfo.vdf'));
  const playtime = readSteamPlaytime(steamPath);
  const games = [];
  for (const appid of owned) {
    const app = info.get(appid);
    if (!app || app.type !== 'game' || !app.name || STEAM_IGNORED_OWNED.has(appid)) continue;
    const pt = playtime[appid] || { minutes: 0, lastPlayed: 0 };
    games.push({ appid, name: app.name, minutes: pt.minutes, lastPlayed: pt.lastPlayed });
  }
  return games;
}

// Caminho da arte que a Steam guarda localmente para uma app (ou null).
function steamCachedArt(appid, fileName) {
  const steamPath = findSteamPath();
  return steamPath ? findSteamCachedArt(steamPath, appid, fileName) : null;
}

// ---------- Epic Games ----------

// A variável de ambiente permite testar com uma pasta de manifestos falsa.
const EPIC_MANIFESTS = process.env.ALTEIA_EPIC_MANIFESTS || 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

function scanEpic() {
  const dir = EPIC_MANIFESTS;
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const file of files) {
    let item;
    try {
      item = JSON.parse(readText(path.join(dir, file)));
    } catch {
      continue;
    }
    if (!item || item.bIsApplication === false) continue;
    // DLCs têm MainGameAppName diferente do próprio AppName.
    if (item.MainGameAppName && item.MainGameAppName !== item.AppName) continue;
    if (item.bIsIncompleteInstall) continue;
    const installDir = path.normalize(item.InstallLocation || '');
    if (!item.InstallLocation || !exists(installDir)) continue;
    const launchId = encodeURIComponent(`${item.CatalogNamespace}:${item.CatalogItemId}:${item.AppName}`);
    games.push({
      id: `epic:${item.AppName}`,
      source: 'epic',
      name: (item.DisplayName || item.AppName).replace(/[®™]/g, '').trim(),
      installDir,
      sizeOnDisk: Number(item.InstallSize || 0),
      launch: {
        type: 'uri',
        uri: `com.epicgames.launcher://apps/${launchId}?action=launch&silent=true`,
      },
    });
  }
  return games;
}

// ---------- Riot Games ----------

const RIOT_NAMES = {
  league_of_legends: 'League of Legends',
  valorant: 'VALORANT',
  teamfighttactics: 'Teamfight Tactics',
  bacon: 'Legends of Runeterra',
  lion: '2XKO',
};

// Executável que conta como "a jogar" (no LoL, a partida e não o cliente). O anti-cheat da Riot
// esconde o caminho destes processos, por isso o registo de tempo também os reconhece pelo nome.
const RIOT_PROCESSES = {
  league_of_legends: ['league of legends.exe'],
  valorant: ['valorant-win64-shipping.exe'],
  teamfighttactics: ['tftclient.exe'],
};

const RIOT_ROOT = 'C:\\ProgramData\\Riot Games';

function scanRiot() {
  const root = RIOT_ROOT;
  let riotClient = null;
  try {
    const installs = JSON.parse(readText(path.join(root, 'RiotClientInstalls.json')));
    riotClient = installs.rc_default || installs.rc_live || null;
  } catch {}
  if (!riotClient || !exists(riotClient)) return [];

  const metaDir = path.join(root, 'Metadata');
  let entries = [];
  try {
    entries = fs.readdirSync(metaDir);
  } catch {
    return [];
  }
  const games = [];
  for (const entry of entries) {
    const m = entry.match(/^(.+)\.(live|pbe)$/);
    if (!m) continue;
    const [, product, patchline] = m;
    const yaml = readText(path.join(metaDir, entry, `${entry}.product_settings.yaml`));
    if (!yaml) continue;
    const pathMatch = yaml.match(/product_install_full_path:\s*"?([^"\r\n]+)"?/);
    if (!pathMatch) continue;
    const installDir = path.normalize(pathMatch[1].trim());
    if (!exists(installDir)) continue;
    const baseName = RIOT_NAMES[product] || product;
    const icon = path.join(metaDir, entry, `${entry}.ico`);
    games.push({
      id: `riot:${entry}`,
      source: 'riot',
      name: patchline === 'pbe' ? `${baseName} (PBE)` : baseName,
      installDir,
      processNames: RIOT_PROCESSES[product],
      icon: exists(icon) ? icon : null,
      launch: {
        type: 'exe',
        exe: path.normalize(riotClient),
        args: [`--launch-product=${product}`, `--launch-patchline=${patchline}`],
      },
    });
  }
  return games;
}

function scanAll() {
  const safe = (fn) => {
    try {
      return fn();
    } catch (err) {
      console.error(err);
      return [];
    }
  };
  return [...safe(scanSteam), ...safe(scanEpic), ...safe(scanRiot)];
}

// Pastas onde as lojas escrevem quando um jogo é instalado ou removido.
function watchTargets() {
  const targets = [];
  const steamPath = findSteamPath();
  if (steamPath) {
    // packageinfo.vdf muda quando a conta recebe um jogo novo (compra ou oferta).
    targets.push({ dir: path.join(steamPath, 'appcache'), recursive: false, match: /packageinfo.vdf$/i });
    for (const lib of steamLibraries(steamPath)) {
      targets.push({ dir: path.join(lib, 'steamapps'), recursive: false, match: /appmanifest_\d+\.acf$|libraryfolders\.vdf$/i });
    }
  }
  targets.push({ dir: EPIC_MANIFESTS, recursive: false, match: /\.item$/i });
  // O catálogo da Epic muda quando a conta recebe um jogo (compra ou jogo grátis resgatado).
  targets.push({ dir: path.dirname(EPIC_CATALOG), recursive: false, match: /catcache\.bin$/i });
  // Na Riot, ignora os lockfiles que mudam constantemente enquanto o cliente está aberto.
  targets.push({ dir: path.join(RIOT_ROOT, 'Metadata'), recursive: true, match: /product_settings\.yaml$|\.ok$/i });
  return targets.filter((t) => exists(t.dir));
}

// ---------- Jogos da conta Epic (instalados ou não) ----------

// O launcher guarda o catálogo da conta em base64 (JSON). Neste ficheiro, ™, ® e travessões
// aparecem como "?", por isso os nomes são limpos.
const EPIC_CATALOG = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Catalog\\catcache.bin';
const EPIC_NOT_GAMES = /\b(beta|public test|testing|editor|archiver|content|demo|soundtrack|server)\b/i;

function cleanEpicTitle(title) {
  return String(title || '')
    .replace(/(\w)\?s\b/g, "$1's")
    .replace(/ \? /g, ' – ')
    .replace(/\?(?=[\s:]|$)/g, '')
    .trim();
}

function scanEpicOwned() {
  const raw = readText(EPIC_CATALOG);
  if (!raw) return [];
  let items;
  try {
    items = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return [];
  }
  const image = (item, types) => {
    for (const type of types) {
      const img = (item.keyImages || []).find((k) => k.type === type);
      if (img?.url) return img.url;
    }
    return null;
  };
  const games = [];
  for (const item of items) {
    const isGame = (item.categories || []).some((c) => c.path === 'games');
    const isAddon = !!item.mainGameItem?.id;
    const appName = item.releaseInfo?.[0]?.appId;
    if (!isGame || isAddon || !appName || EPIC_NOT_GAMES.test(item.title || '')) continue;
    games.push({
      appName,
      namespace: item.namespace,
      catalogId: item.id,
      name: cleanEpicTitle(item.title),
      cover: image(item, ['DieselGameBoxTall', 'OfferImageTall', 'Thumbnail']),
      hero: image(item, ['DieselGameBox', 'OfferImageWide']),
    });
  }
  return games;
}

module.exports = { scanAll, scanSteamOwned, scanEpicOwned, steamCachedArt, watchTargets };
