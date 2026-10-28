const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  protocol,
  net,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  Notification,
  screen,
} = require('electron');
const { Store } = require('./store.cjs');
const { scanAll, scanSteamOwned, scanEpicOwned, steamCachedArt, watchTargets } = require('./scanners.cjs');
const covers = require('./covers.cjs');
const { PlayTracker } = require('./tracker.cjs');
const updater = require('./updater.cjs');
const achievements = require('./achievements.cjs');
const discover = require('./discover.cjs');
const i18n = require('./i18n.cjs');
const { t } = i18n;

const APP_NAME = 'ALTEIA';

// Cor de fundo e dos botões da barra de título do Windows para cada paleta.
const THEMES = {
  fogueira: { night: '#15100d', cream: '#f4e4c1' },
  floresta: { night: '#0f1410', cream: '#e9f0d8' },
  lua: { night: '#0c1018', cream: '#e3ecff' },
  sakura: { night: '#160e14', cream: '#fbe7f0' },
  ameixa: { night: '#120f1a', cream: '#ece6ff' },
};

function currentTheme() {
  return THEMES[store?.data.settings.theme] ? store.data.settings.theme : 'fogueira';
}
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let tray = null;
let store = null;
let tracker = null;
let games = []; // jogos detetados + manuais, com dados internos (caminhos, forma de lançar)
let quitting = false;
const startHidden = process.argv.includes('--hidden');

// ---------- Biblioteca ----------

const GENERIC_EXE = /^(game|launcher|start|play|run|main|app|client|bin|win64|win32|x64)$/i;

function guessName(exePath) {
  const exe = path.basename(exePath, path.extname(exePath)).replace(/-win64-shipping$/i, '');
  const folder = path.basename(path.dirname(exePath));
  const raw = GENERIC_EXE.test(exe) || exe.length <= 3 ? folder : exe;
  return raw.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function manualGames() {
  return store.data.manual.map((m) => ({
    id: m.id,
    source: 'manual',
    name: m.name,
    exePath: m.exePath,
    installDir: path.dirname(m.exePath),
    launch: { type: 'path', path: m.exePath },
  }));
}

let steamOwned = []; // jogos da conta Steam (instalados ou não)
let epicOwned = []; // jogos da conta Epic (instalados ou não)

function rescan() {
  games = [...scanAll(), ...manualGames()];
  try {
    steamOwned = scanSteamOwned();
  } catch (err) {
    console.error('Não foi possível ler os jogos da conta Steam:', err);
    steamOwned = [];
  }
  try {
    epicOwned = scanEpicOwned();
  } catch (err) {
    console.error('Não foi possível ler os jogos da conta Epic:', err);
    epicOwned = [];
  }
  // Guarda uma única vez o tempo que a Steam já tinha registado, para não contar a dobrar
  // as horas que esta app passa a registar a partir de agora.
  for (const g of games) {
    if (g.externalMinutes === undefined) continue;
    const meta = store.meta(g.id);
    if (!meta.baseline) {
      meta.baseline = { minutes: g.externalMinutes, lastPlayed: g.externalLastPlayed || 0, at: Date.now() };
    }
  }
  store.save();
}

function mediaUrl(file) {
  return file ? `media://img/${encodeURIComponent(file)}` : null;
}

function publicGame(g) {
  const meta = store.data.meta[g.id] || {};
  return {
    id: g.id,
    source: g.source,
    name: meta.name || g.name || meta.storeName || t('game.unnamed'),
    detectedName: g.name || meta.storeName || '',
    installDir: g.installDir,
    exePath: g.exePath || null,
    sizeOnDisk: g.sizeOnDisk || 0,
    favorite: !!meta.favorite,
    tags: meta.tags || [],
    status: meta.status || null,
    completedAt: meta.completedAt || null,
    hidden: !!meta.hidden,
    cover: mediaUrl(meta.cover),
    hero: mediaUrl(meta.hero),
    coverPending: !meta.cover && !meta.coverTried,
    baselineMinutes: meta.baseline?.minutes || 0,
    baselineLastPlayed: meta.baseline?.lastPlayed || 0,
    sgdbId: meta.sgdbId || null,
  };
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Jogos das contas Steam e Epic que não estão instalados. Usam o mesmo id que teriam
// instalados (steam:<appid>, epic:<appName>), por isso o estado, as coleções e a tier list
// acompanham o jogo quando é instalado. Assim que um acaba de instalar, sai desta lista.
function notInstalledGames() {
  const installedIds = new Set(games.map((g) => g.id));
  // Também esconde jogos instalados por outra loja (ex.: VALORANT da Riot que aparece na Epic).
  const installedNames = new Set(games.map((g) => normName(publicGame(g).name)));
  const withMeta = (item) => {
    const meta = store.data.meta[item.id] || {};
    return { ...item, status: meta.status || null, completedAt: meta.completedAt || null, tags: meta.tags || [] };
  };
  const steam = steamOwned.map((g) => ({
    id: `steam:${g.appid}`,
    store: 'steam',
    appid: g.appid,
    name: g.name,
    minutes: g.minutes,
    lastPlayed: g.lastPlayed,
    cover: `media://steamart/${g.appid}/cover`,
    hero: `media://steamart/${g.appid}/hero`,
  }));
  const epic = epicOwned.map((g) => ({
    id: `epic:${g.appName}`,
    store: 'epic',
    appName: g.appName,
    namespace: g.namespace,
    catalogId: g.catalogId,
    name: g.name,
    minutes: 0,
    lastPlayed: 0,
    cover: g.cover,
    hero: g.hero,
  }));
  return [...steam, ...epic]
    .filter((g) => !installedIds.has(g.id) && !installedNames.has(normName(g.name)))
    .map(withMeta);
}

// Ids de todos os jogos conhecidos (instalados ou só na conta), para validar pedidos.
function knownGameIds() {
  return new Set([...games.map((g) => g.id), ...steamOwned.map((g) => `steam:${g.appid}`), ...epicOwned.map((g) => `epic:${g.appName}`)]);
}

// Coleções criadas + as que só existem como etiqueta em algum jogo, por ordem alfabética.
function allCollections() {
  const names = [...store.data.collections];
  for (const meta of Object.values(store.data.meta)) {
    for (const tag of meta.tags || []) if (!names.some((n) => n.toLowerCase() === tag.toLowerCase())) names.push(tag);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function snapshot() {
  return {
    games: games.map(publicGame),
    sessions: store.data.sessions,
    running: tracker ? tracker.runningIds() : [],
    notInstalled: notInstalledGames(),
    tierList: store.data.tierList,
    wishlist: store.data.wishlist,
    collections: allCollections(),
    achievements: achievementState(),
    settings: {
      ...store.data.settings,
      language: currentLanguage(),
      theme: currentTheme(),
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      updatesDir: updatesDir(),
    },
  };
}

let notifyTimer = null;
function notifyLibrary() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    win?.webContents.send('library:changed', snapshot());
  }, 150);
}

let artQueue = Promise.resolve();
function fetchMissingArt(list = games) {
  artQueue = artQueue.then(async () => {
    for (const g of list) {
      try {
        if (await covers.resolveArt(g, store)) {
          store.save();
          notifyLibrary();
        }
      } catch (err) {
        console.error('Erro a obter arte de', g.id, err);
      }
    }
  });
  return artQueue;
}

// ---------- Deteção automática de jogos novos ----------

const watchers = new Map(); // pasta (minúsculas) -> FSWatcher
let rescanTimer = null;

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON_PATH });
  if (onClick) n.on('click', onClick);
  n.show();
}

// Volta a ler as lojas e avisa dos jogos que apareceram desde a última leitura.
async function refreshLibrary() {
  const before = new Set(games.map((g) => g.id));
  const ownedBefore = steamOwned.length + epicOwned.length;
  rescan();
  const added = games.filter((g) => !before.has(g.id));
  const removed = [...before].some((id) => !games.some((g) => g.id === id));
  watchLibraries();
  if (!added.length && !removed && steamOwned.length + epicOwned.length === ownedBefore) return;
  notifyLibrary();
  // Espera pela capa e pelo nome (alguns jogos da Steam vêm sem nome) antes de avisar.
  await fetchMissingArt(added);
  if (added.length) recordEvent('install');
  for (const g of added) {
    const { name } = publicGame(g);
    win?.webContents.send('library:newGame', { id: g.id, name });
    notify(t('notify.newGameTitle'), t('notify.newGameBody', { name }), () => {
      showWindow();
      win?.webContents.send('library:openGame', g.id);
    });
  }
}

function scheduleRescan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => refreshLibrary().catch(console.error), 3000);
}

function watchLibraries() {
  const targets = watchTargets();
  const wanted = new Set(targets.map((target) => target.dir.toLowerCase()));
  for (const [key, w] of watchers) {
    if (!wanted.has(key)) {
      w.close();
      watchers.delete(key);
    }
  }
  for (const target of targets) {
    const key = target.dir.toLowerCase();
    if (watchers.has(key)) continue;
    try {
      const w = fs.watch(target.dir, { recursive: target.recursive, persistent: false }, (_event, file) => {
        if (!file || target.match.test(String(file))) scheduleRescan();
      });
      w.on('error', () => {
        w.close();
        watchers.delete(key);
      });
      watchers.set(key, w);
    } catch (err) {
      console.error('Não foi possível vigiar', target.dir, err.message);
    }
  }
}

// ---------- Atualizações ----------

let updateState = { status: 'idle' };
let updateInfo = null;
let updatesWatcher = null;
let lastUpdateCheck = 0;
let updateTrayMenu = () => {};

function updatesDir() {
  return store.data.settings.updatesDir || updater.defaultUpdatesDir();
}

function setUpdateState(state) {
  updateState = { ...state, checkedAt: Date.now() };
  win?.webContents.send('update:state', updateState);
  updateTrayMenu();
}

// Regista cada verificação em updates.log (na pasta de dados), para diagnosticar falhas.
function logUpdate(message) {
  try {
    const file = path.join(app.getPath('userData'), 'updates.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 200_000) fs.writeFileSync(file, '');
    fs.appendFileSync(file, `${new Date().toISOString()} v${app.getVersion()} ${message}\n`);
  } catch {}
}

async function checkForUpdates({ silent = true, retry = true } = {}) {
  if (!app.isPackaged) return setUpdateState({ status: 'dev' });
  if (updateState.status === 'installing') return;
  lastUpdateCheck = Date.now();
  if (!silent) setUpdateState({ status: 'checking' });
  try {
    const info = await updater.checkFolder(updatesDir(), app.getVersion());
    logUpdate(`${updatesDir()} -> ${info.missing ? 'latest.json em falta' : info.available ? `disponível ${info.version}` : `atual (${info.latest})`}`);
    if (info.missing) {
      // Pode ser o instante em que o latest.json está a ser substituído: tenta de novo daqui a pouco
      // e nunca esconde um aviso de atualização que já estava visível.
      if (retry) {
        setTimeout(() => checkForUpdates({ silent, retry: false }), 3000);
        return;
      }
      if (updateInfo) {
        const { version, notes, date } = updateInfo;
        setUpdateState({ status: 'available', version, notes, date });
        return;
      }
    }
    if (info.available) {
      const isNew = updateInfo?.version !== info.version;
      updateInfo = info;
      setUpdateState({ status: 'available', version: info.version, notes: info.notes, date: info.date });
      if (isNew) {
        notify(t('notify.updateTitle', { version: info.version }), t('notify.updateBody'), showWindow);
      }
    } else {
      updateInfo = null;
      setUpdateState({ status: 'none', latest: info.latest });
    }
  } catch (err) {
    logUpdate(`erro: ${err.message}`);
    setUpdateState({ status: 'error', error: err.message });
  }
}

async function installAvailableUpdate() {
  if (!updateInfo) throw new Error(t('err.noUpdate'));
  setUpdateState({ status: 'installing', version: updateInfo.version });
  try {
    await updater.installUpdate(updateInfo);
  } catch (err) {
    setUpdateState({ status: 'error', error: err.message });
    throw err;
  }
  // O instalador só consegue substituir os ficheiros depois de a app fechar.
  quitting = true;
  store.saveNow();
  setTimeout(() => app.quit(), 300);
}

// Vigia a pasta de atualizações para saber de uma versão nova assim que é publicada.
function watchUpdatesDir() {
  updatesWatcher?.close();
  updatesWatcher = null;
  if (!app.isPackaged) return;
  const dir = updatesDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    updatesWatcher = fs.watch(dir, { persistent: false }, (_e, file) => {
      if (String(file) === 'latest.json') setTimeout(() => checkForUpdates(), 1500);
    });
    updatesWatcher.on('error', () => {
      updatesWatcher?.close();
      updatesWatcher = null;
    });
  } catch {}
}

const STATUSES = ['backlog', 'playing', 'completed', 'dropped'];

// Etiquetas sem espaços a mais, sem repetidas (ignorando maiúsculas) e com no máximo 40 letras.
function cleanTags(tags) {
  const out = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw).trim().slice(0, 40);
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.length ? out : undefined;
}

// ---------- Recomendações ----------

let recsRunning = null;

// Calcula as recomendações por fases e envia cada fase à interface assim que fica pronta:
// jogos grátis da Epic, depois a loja Steam, por fim a tua biblioteca (a fase mais lenta).
async function computeRecs() {
  const cache = store.data.cache;
  const prev = cache.recs || {};
  const result = { at: Date.now(), loading: true, tags: prev.tags || [], store: prev.store || [], library: prev.library || [], epicFree: prev.epicFree || [] };
  const publish = () => {
    cache.recs = { ...result };
    store.save();
    win?.webContents.send('recs:update', cache.recs);
  };

  try {
    result.epicFree = await discover.epicFreeGames();
  } catch {}
  publish();

  // Tempo total de cada jogo instalado (sessões registadas + horas que a Steam já tinha).
  const tracked = new Map();
  for (const s of store.data.sessions) tracked.set(s.gameId, (tracked.get(s.gameId) || 0) + Math.max(0, s.end - s.start));
  const library = games.map((g) => {
    const pub = publicGame(g);
    return { g, pub, ms: (tracked.get(g.id) || 0) + pub.baselineMinutes * 60_000 };
  });

  // Jogos mais jogados, com o appid da Steam (para as etiquetas do SteamSpy).
  const played = [];
  for (const { g, pub, ms } of library) {
    if (ms < 3_600_000) continue;
    const appid = g.appid || store.data.meta[g.id]?.steamAppid || (await discover.steamAppidForName(pub.name, cache));
    if (appid) played.push({ appid, name: pub.name, ms });
  }
  for (const o of steamOwned) {
    if (o.minutes >= 60 && !played.some((p) => p.appid === o.appid)) played.push({ appid: o.appid, name: o.name, ms: o.minutes * 60_000 });
  }
  played.sort((a, b) => b.ms - a.ms);
  const profile = await discover.buildProfile(played.slice(0, 12), cache);
  result.tags = profile.tags.slice(0, 8).map(({ tag, because }) => ({ tag, because }));

  const notInstalled = notInstalledGames();
  const ownedAppids = new Set([...steamOwned.map((o) => o.appid), ...played.map((p) => p.appid)]);
  const ownedNames = new Set([...library.map((l) => discover.normName(l.pub.name)), ...notInstalled.map((n) => discover.normName(n.name))]);
  result.store = await discover.storeRecommendations(profile, ownedAppids, ownedNames, cache);
  publish();

  // Da biblioteca: jogos com menos de 2 h (instalados ou só na conta).
  const candidates = [
    ...library
      .filter(({ pub, ms }) => !pub.hidden && ms < 2 * 3_600_000)
      .map(({ g, pub }) => ({ id: g.id, name: pub.name, cover: pub.cover, store: g.source, appid: g.appid || null, installed: true })),
    ...notInstalled
      .filter((n) => n.minutes < 120)
      .map((n) => ({ id: n.id, name: n.name, cover: n.cover, store: n.store, appid: n.appid || null, installed: false })),
  ];
  result.library = await discover.libraryRecommendations(profile, candidates, cache);
  result.loading = false;
  result.at = Date.now();
  publish();
}

// ---------- Conquistas ----------

function achievementState() {
  return achievements.evaluate(
    {
      games: games.map(publicGame),
      sessions: store.data.sessions,
      meta: store.data.meta,
      collections: allCollections(),
      events: store.data.achievementEvents,
    },
    store.data.achievements
  );
}

function recordEvent(name) {
  if (store.data.achievementEvents[name]) return;
  store.data.achievementEvents[name] = Date.now();
  store.save();
  checkAchievements();
}

// Marca as conquistas recém-cumpridas e mostra o pop-up. Na primeira verificação depois de
// instalar esta versão, as que já estavam cumpridas aparecem num só pop-up de resumo.
// Versão das regras das conquistas. Ao mudar as regras, as conquistas que deixaram de estar
// cumpridas voltam a ficar bloqueadas (uma só vez), em vez de ficarem ganhas para sempre.
const ACHIEVEMENT_RULES = 2;

function migrateAchievementRules() {
  if ((store.data.achievementRules || 1) >= ACHIEVEMENT_RULES) return;
  const fresh = achievements.evaluate(
    { games: games.map(publicGame), sessions: store.data.sessions, meta: store.data.meta, collections: allCollections(), events: store.data.achievementEvents },
    {}
  );
  for (const id of Object.keys(store.data.achievements)) {
    if (!fresh.find((a) => a.id === id)?.done) delete store.data.achievements[id];
  }
  store.data.achievementRules = ACHIEVEMENT_RULES;
  store.save();
}

function checkAchievements() {
  migrateAchievementRules();
  const now = Date.now();
  const fresh = achievementState().filter((a) => a.done && !store.data.achievements[a.id]);
  const firstRun = !store.data.achievementsReady;
  store.data.achievementsReady = true;
  if (!fresh.length) {
    if (firstRun) store.save();
    return;
  }
  for (const a of fresh) store.data.achievements[a.id] = now;
  store.save();
  notifyLibrary();
  if (firstRun && fresh.length > 1) showAchievementPopup({ summary: fresh.length });
  else for (const a of fresh) showAchievementPopup({ id: a.id, tier: a.tier });
}

// Pop-up ao estilo das consolas: uma janela pequena, sem moldura e por cima de tudo,
// que não rouba o foco ao jogo. Vários desbloqueios aparecem um de cada vez.
const POPUP = { width: 440, height: 132, duration: 6000 };
const popupQueue = [];
let popupWin = null;

function showAchievementPopup(item) {
  if (!item.preview && !store.data.settings.achievementPopup) return;
  popupQueue.push(item);
  if (!popupWin) nextPopup();
}

function nextPopup() {
  const item = popupQueue.shift();
  if (!item) {
    popupWin = null;
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  popupWin = new BrowserWindow({
    width: POPUP.width,
    height: POPUP.height,
    x: workArea.x + workArea.width - POPUP.width - 24,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  popupWin.setAlwaysOnTop(true, 'screen-saver');
  popupWin.setIgnoreMouseEvents(true);
  const hash = `popup=${encodeURIComponent(JSON.stringify(item))}`;
  if (process.env.VITE_DEV_SERVER_URL) popupWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${hash}`);
  else popupWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash });
  const current = popupWin;
  current.once('ready-to-show', () => current.showInactive());
  setTimeout(() => {
    if (!current.isDestroyed()) current.destroy();
    nextPopup();
  }, POPUP.duration);
}

function findGame(id) {
  const g = games.find((x) => x.id === id);
  if (!g) throw new Error(t('err.gameNotFound'));
  return g;
}

async function launchGame(id) {
  const g = findGame(id);
  const l = g.launch;
  if (l.type === 'uri') {
    await shell.openExternal(l.uri);
  } else if (l.type === 'exe') {
    spawn(l.exe, l.args || [], { detached: true, stdio: 'ignore', cwd: path.dirname(l.exe) }).unref();
  } else {
    const err = await shell.openPath(l.path);
    if (err) throw new Error(err);
  }
}

// ---------- IPC ----------

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc() {
  handle('library:get', () => snapshot());

  handle('library:rescan', async () => {
    await refreshLibrary();
    fetchMissingArt();
    return snapshot();
  });

  handle('update:get', () => updateState);
  handle('update:check', () => checkForUpdates({ silent: false }));
  handle('update:install', () => installAvailableUpdate());
  handle('update:chooseDir', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: t('dialog.updatesDir'),
      defaultPath: updatesDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    store.data.settings.updatesDir = res.filePaths[0];
    store.save();
    watchUpdatesDir();
    notifyLibrary();
    await checkForUpdates({ silent: false });
    return res.filePaths[0];
  });
  handle('update:openDir', async () => {
    fs.mkdirSync(updatesDir(), { recursive: true });
    const err = await shell.openPath(updatesDir());
    if (err) throw new Error(err);
  });

  handle('game:launch', (id) => launchGame(id));

  // Abre a instalação ou a página da loja na própria Steam.
  handle('steam:install', async (appid) => {
    if (!/^\d+$/.test(String(appid))) throw new Error(t('err.gameNotFound'));
    await shell.openExternal(`steam://install/${appid}`);
  });
  // Tier list: põe um jogo num nível (ou tira-o, com tier null), numa posição opcional.
  handle('tier:set', (id, tier, index) => {
    const list = store.data.tierList;
    for (const key of Object.keys(list)) list[key] = list[key].filter((x) => x !== id);
    if (tier && list[tier]) {
      const at = Number.isInteger(index) ? Math.max(0, Math.min(index, list[tier].length)) : list[tier].length;
      list[tier].splice(at, 0, id);
    }
    store.save();
    notifyLibrary();
  });

  // Lista "Quero jogar": jogos da conta, da loja Steam ou escritos à mão.
  handle('wish:add', (item) => {
    const kind = item?.kind;
    let entry;
    if (kind === 'owned' && knownGameIds().has(item.id)) entry = { key: item.id, kind, id: item.id, name: item.name };
    else if (kind === 'steam' && /^\d+$/.test(String(item.appid))) entry = { key: `steamstore:${item.appid}`, kind, appid: String(item.appid), name: item.name };
    else if (kind === 'custom' && String(item.name || '').trim()) entry = { key: `custom:${Date.now()}`, kind, name: String(item.name).trim().slice(0, 80) };
    if (!entry) throw new Error(t('err.gameNotFound'));
    if (store.data.wishlist.some((w) => w.key === entry.key)) return;
    store.data.wishlist.push({ ...entry, addedAt: Date.now() });
    store.save();
    notifyLibrary();
  });
  handle('wish:remove', (key) => {
    store.data.wishlist = store.data.wishlist.filter((w) => w.key !== key);
    store.save();
    notifyLibrary();
  });

  handle('store:search', (term) => discover.searchSteam(String(term || '').slice(0, 80), currentLanguage()));
  handle('store:prices', (appids) => discover.steamPrices((appids || []).filter((a) => /^\d+$/.test(String(a)))));
  handle('recs:get', (force) => {
    const cached = store.data.cache.recs;
    const stale = !cached || cached.loading || Date.now() - cached.at > 12 * 3_600_000;
    if (!recsRunning && (force || stale)) {
      recsRunning = computeRecs()
        .catch((err) => console.error('Recomendações:', err))
        .finally(() => (recsRunning = null));
    }
    return cached ? { ...cached, loading: !!recsRunning || cached.loading } : null;
  });

  // Instala um jogo da conta (Steam ou Epic) a partir do seu id.
  handle('store:install', async (id) => {
    const g = notInstalledGames().find((x) => x.id === id);
    if (!g) throw new Error(t('err.gameNotFound'));
    if (g.store === 'steam') return shell.openExternal(`steam://install/${g.appid}`);
    const launchId = encodeURIComponent(`${g.namespace}:${g.catalogId}:${g.appName}`);
    return shell.openExternal(`com.epicgames.launcher://apps/${launchId}?action=install`);
  });
  handle('steam:store', async (appid) => {
    if (!/^\d+$/.test(String(appid))) throw new Error(t('err.gameNotFound'));
    await shell.openExternal(`steam://store/${appid}`);
  });

  handle('game:openFolder', async (id) => {
    const g = findGame(id);
    const err = await shell.openPath(g.installDir);
    if (err) throw new Error(err);
  });

  handle('game:update', (id, patch) => {
    // Também aceita jogos que só estão na conta (não instalados), para o estado e as listas.
    if (!knownGameIds().has(id)) throw new Error(t('err.gameNotFound'));
    const meta = store.meta(id);
    for (const key of ['name', 'favorite', 'hidden']) {
      if (key in patch) meta[key] = patch[key] || undefined;
    }
    if ('status' in patch) {
      meta.status = STATUSES.includes(patch.status) ? patch.status : undefined;
      if (meta.status === 'completed') meta.completedAt = meta.completedAt || Date.now();
      else delete meta.completedAt;
    }
    if ('tags' in patch) meta.tags = cleanTags(patch.tags);
    const manual = store.data.manual.find((m) => m.id === id);
    if (manual && patch.name) manual.name = patch.name;
    store.save();
    notifyLibrary();
    checkAchievements();
  });

  // Modo TV: a janela ocupa o ecrã inteiro (sem barra de título nem barra de tarefas).
  handle('window:fullscreen', (on) => {
    if (!win) return;
    win.setFullScreen(!!on);
    if (on) showWindow();
  });

  // Ações que contam para conquistas e que só a interface conhece.
  handle('achievements:event', (name) => {
    if (['dice'].includes(name)) recordEvent(name);
  });
  handle('achievements:preview', () => showAchievementPopup({ id: 'platinum', preview: true }));

  // Coleções: criar (mesmo vazia), mudar o nome ou apagar em todos os jogos de uma vez.
  handle('tags:create', (name) => {
    store.data.collections = cleanTags([...store.data.collections, name]) || [];
    store.save();
    notifyLibrary();
    checkAchievements();
  });

  handle('tags:rename', (from, to) => {
    const name = String(to || '').trim();
    if (!name) return;
    for (const meta of Object.values(store.data.meta)) {
      if (meta.tags?.includes(from)) meta.tags = cleanTags(meta.tags.map((tg) => (tg === from ? name : tg)));
    }
    store.data.collections = cleanTags(store.data.collections.map((tg) => (tg === from ? name : tg))) || [];
    store.save();
    notifyLibrary();
  });

  handle('tags:delete', (tag) => {
    for (const meta of Object.values(store.data.meta)) {
      if (meta.tags?.includes(tag)) meta.tags = cleanTags(meta.tags.filter((tg) => tg !== tag));
    }
    store.data.collections = store.data.collections.filter((tg) => tg !== tag);
    store.save();
    notifyLibrary();
  });

  handle('game:remove', (id) => {
    store.data.manual = store.data.manual.filter((m) => m.id !== id);
    delete store.data.meta[id];
    games = games.filter((g) => g.id !== id);
    store.save();
    notifyLibrary();
  });

  handle('manual:add', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: t('dialog.exeTitle'),
      filters: [{ name: t('dialog.exeFilter'), extensions: ['exe', 'lnk', 'bat', 'url'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    let exePath = res.filePaths[0];
    if (exePath.toLowerCase().endsWith('.lnk')) {
      try {
        exePath = shell.readShortcutLink(exePath).target || exePath;
      } catch {}
    }
    const existing = store.data.manual.find((m) => m.exePath.toLowerCase() === exePath.toLowerCase());
    if (existing) return existing.id;
    const entry = {
      id: `manual:${Date.now().toString(36)}`,
      name: guessName(exePath),
      exePath,
      addedAt: Date.now(),
    };
    store.data.manual.push(entry);
    store.save();
    const [g] = manualGames().filter((m) => m.id === entry.id);
    games.push(g);
    notifyLibrary();
    fetchMissingArt([g]);
    return entry.id;
  });

  handle('art:pickFile', async (id, kind) => {
    const res = await dialog.showOpenDialog(win, {
      title: kind === 'hero' ? t('dialog.heroTitle') : t('dialog.coverTitle'),
      filters: [{ name: t('dialog.images'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    await covers.setArt(store, id, kind, { file: res.filePaths[0] });
    store.save();
    notifyLibrary();
  });

  handle('art:fromUrl', async (id, kind, url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error(t('err.url'));
    await covers.setArt(store, id, kind, { url });
    store.save();
    notifyLibrary();
    return true;
  });

  handle('art:refetch', async (id) => {
    const g = findGame(id);
    const meta = store.meta(id);
    for (const k of ['cover', 'hero', 'coverTried', 'heroTried', 'steamAppid', 'sgdbId']) delete meta[k];
    await fetchMissingArt([g]);
    notifyLibrary();
  });

  handle('sgdb:search', (term) => covers.sgdbSearch(store.data.settings.sgdbKey, term));
  handle('sgdb:grids', (sgdbId) => covers.sgdbGrids(store.data.settings.sgdbKey, sgdbId));
  handle('sgdb:heroes', (sgdbId) => covers.sgdbHeroes(store.data.settings.sgdbKey, sgdbId));

  handle('settings:set', async (patch) => {
    const s = store.data.settings;
    const keyChanged = 'sgdbKey' in patch && patch.sgdbKey !== s.sgdbKey;
    const themeChanged = 'theme' in patch && patch.theme !== s.theme;
    Object.assign(s, patch);
    if (themeChanged) recordEvent('decorator');
    if ('theme' in patch && win) {
      const th = THEMES[currentTheme()];
      win.setTitleBarOverlay({ color: th.night, symbolColor: th.cream });
      win.setBackgroundColor(th.night);
    }
    if ('language' in patch) {
      i18n.setLang(currentLanguage());
      updateTrayMenu();
    }
    if ('startWithWindows' in patch && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: !!patch.startWithWindows, args: ['--hidden'] });
    }
    if (keyChanged && s.sgdbKey) {
      // Volta a tentar os jogos que ficaram sem capa.
      for (const meta of Object.values(store.data.meta)) {
        if (!meta.cover) delete meta.coverTried;
        if (!meta.hero) delete meta.heroTried;
      }
      fetchMissingArt();
    }
    store.save();
    notifyLibrary();
  });

  handle('sessions:delete', (gameId, start) => {
    store.data.sessions = store.data.sessions.filter((s) => !(s.gameId === gameId && s.start === start));
    store.save();
    notifyLibrary();
  });

  handle('shell:openExternal', (url) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url);
  });
}

// ---------- Janela e bandeja ----------

// Idioma escolhido nas Definições; sem escolha, segue o idioma do Windows.
function currentLanguage() {
  const chosen = store?.data.settings.language;
  if (chosen === 'pt' || chosen === 'en') return chosen;
  return app.getLocale().toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

function appIcon() {
  return nativeImage.createFromPath(ICON_PATH);
}

// Arte de jogos Steam não instalados: cache local da Steam se existir, senão o CDN da Steam.
const STEAM_ART = {
  cover: { local: 'library_600x900.jpg', remote: ['library_600x900_2x.jpg', 'library_600x900.jpg'] },
  hero: { local: 'library_hero.jpg', remote: ['library_hero.jpg', 'header.jpg'] },
};

async function steamArtResponse(url) {
  const [appid, kind] = url.pathname.replace(/^\/+/, '').split('/');
  const art = STEAM_ART[kind];
  if (!/^\d+$/.test(appid) || !art) return new Response('', { status: 404 });
  const local = steamCachedArt(appid, art.local);
  if (local) return net.fetch(pathToFileURL(local).toString());
  for (const file of art.remote) {
    try {
      const res = await net.fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${file}`);
      if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) return res;
    } catch {}
  }
  return new Response('', { status: 404 });
}

// Ao mudar de nome, a pasta de dados mudou de "Biblioteca de Jogos" para "ALTEIA":
// copia a biblioteca antiga (sessões, capas, definições) se ainda não houver dados novos.
function migrateOldData() {
  const newDir = app.getPath('userData');
  const oldDir = path.join(app.getPath('appData'), 'Biblioteca de Jogos');
  if (fs.existsSync(path.join(newDir, 'library.json')) || !fs.existsSync(path.join(oldDir, 'library.json'))) return;
  try {
    fs.mkdirSync(newDir, { recursive: true });
    fs.copyFileSync(path.join(oldDir, 'library.json'), path.join(newDir, 'library.json'));
    if (fs.existsSync(path.join(oldDir, 'covers'))) {
      fs.cpSync(path.join(oldDir, 'covers'), path.join(newDir, 'covers'), { recursive: true });
    }
  } catch (err) {
    console.error('Falha ao migrar os dados antigos:', err);
  }
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: THEMES[currentTheme()].night,
    icon: appIcon(),
    title: APP_NAME,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: THEMES[currentTheme()].night, symbolColor: THEMES[currentTheme()].cream, height: 37 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });

  win.on('close', (e) => {
    if (!quitting && store.data.settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  // Ao abrir ou voltar à janela, confirma se entretanto saiu uma versão nova.
  win.on('focus', () => {
    if (Date.now() - lastUpdateCheck > 60_000) checkForUpdates();
  });
}

function createTray() {
  tray = new Tray(appIcon().resize({ width: 32, height: 32, quality: 'best' }));
  tray.setToolTip(APP_NAME);
  const updateMenu = () => {
    const running = tracker
      ? tracker.runningIds().map((id) => publicGame(findGame(id)).name)
      : [];
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...(running.length
          ? [{ label: t('tray.playing', { names: running.join(', ') }), enabled: false }, { type: 'separator' }]
          : []),
        { label: t('tray.open'), click: showWindow },
        ...(updateInfo && updateState.status === 'available'
          ? [{ label: t('tray.update', { version: updateInfo.version }), click: () => installAvailableUpdate().catch(console.error) }]
          : []),
        { type: 'separator' },
        {
          label: t('tray.quit'),
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ])
    );
  };
  updateMenu();
  tray.on('click', showWindow);
  return updateMenu;
}

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  app.setAppUserModelId('com.joaopires.gamelibrary');
  migrateOldData();
  store = new Store(app.getPath('userData'));
  i18n.setLang(currentLanguage());
  // Atualiza o arranque com o Windows para o executável atual (muda ao mudar de nome ou pasta).
  if (app.isPackaged && store.data.settings.startWithWindows) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  }

  protocol.handle('media', async (req) => {
    const url = new URL(req.url);
    if (url.host === 'steamart') return steamArtResponse(url);
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(store.coversDir, path.basename(name));
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  rescan();
  registerIpc();
  createWindow();
  updateTrayMenu = createTray();

  tracker = new PlayTracker(
    store,
    () => games,
    (running) => {
      updateTrayMenu();
      win?.webContents.send('running:changed', running);
      notifyLibrary();
      checkAchievements();
    }
  );
  tracker.start();
  // Enquanto há um jogo aberto, as sessões são atualizadas a cada verificação;
  // envia os dados à interface de minuto a minuto para as horas irem subindo.
  setInterval(() => {
    if (tracker.runningIds().length) {
      notifyLibrary();
      checkAchievements();
    }
  }, 60_000);

  powerMonitor.on('suspend', () => tracker.closeAll());

  // Em cada arranque volta a tentar as imagens que ficaram em falta da última vez.
  for (const meta of Object.values(store.data.meta)) {
    if (!meta.cover) delete meta.coverTried;
    if (!meta.hero) delete meta.heroTried;
  }
  fetchMissingArt();

  // Conquistas que já estavam cumpridas antes desta versão desbloqueiam com um só aviso.
  setTimeout(() => checkAchievements(), 4000);

  // Jogos instalados ou removidos enquanto a app está aberta.
  watchLibraries();
  setInterval(scheduleRescan, 5 * 60_000);

  watchUpdatesDir();
  setTimeout(() => checkForUpdates(), 8000);
  setInterval(() => checkForUpdates(), 15 * 60_000);
});

app.on('before-quit', () => {
  quitting = true;
  tracker?.stop();
  store?.saveNow();
});

app.on('window-all-closed', () => {
  if (!store?.data.settings.closeToTray) app.quit();
});
