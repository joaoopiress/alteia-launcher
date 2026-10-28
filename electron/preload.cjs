const { contextBridge, ipcRenderer } = require('electron');

// Cada chamada devolve os dados ou lança um erro com a mensagem vinda do processo principal.
async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function subscribe(channel, cb) {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  getLibrary: () => call('library:get'),
  rescan: () => call('library:rescan'),
  launch: (id) => call('game:launch', id),
  openFolder: (id) => call('game:openFolder', id),
  updateGame: (id, patch) => call('game:update', id, patch),
  removeGame: (id) => call('game:remove', id),
  createTag: (name) => call('tags:create', name),
  achievementEvent: (name) => call('achievements:event', name),
  previewAchievement: () => call('achievements:preview'),
  setFullScreen: (on) => call('window:fullscreen', on),
  renameTag: (from, to) => call('tags:rename', from, to),
  deleteTag: (tag) => call('tags:delete', tag),
  installSteamGame: (appid) => call('steam:install', appid),
  installOwned: (id) => call('store:install', id),
  setTier: (id, tier, index) => call('tier:set', id, tier, index),
  addWish: (item) => call('wish:add', item),
  removeWish: (key) => call('wish:remove', key),
  searchStore: (term) => call('store:search', term),
  storePrices: (appids) => call('store:prices', appids),
  getRecs: (force) => call('recs:get', force),
  openSteamStore: (appid) => call('steam:store', appid),
  addManual: () => call('manual:add'),
  pickArtFile: (id, kind) => call('art:pickFile', id, kind),
  artFromUrl: (id, kind, url) => call('art:fromUrl', id, kind, url),
  refetchArt: (id) => call('art:refetch', id),
  sgdbSearch: (term) => call('sgdb:search', term),
  sgdbGrids: (sgdbId) => call('sgdb:grids', sgdbId),
  sgdbHeroes: (sgdbId) => call('sgdb:heroes', sgdbId),
  setSettings: (patch) => call('settings:set', patch),
  deleteSession: (gameId, start) => call('sessions:delete', gameId, start),
  openExternal: (url) => call('shell:openExternal', url),
  getUpdateState: () => call('update:get'),
  checkUpdates: () => call('update:check'),
  installUpdate: () => call('update:install'),
  chooseUpdatesDir: () => call('update:chooseDir'),
  openUpdatesDir: () => call('update:openDir'),
  onLibraryChanged: (cb) => subscribe('library:changed', cb),
  onRunningChanged: (cb) => subscribe('running:changed', cb),
  onNewGame: (cb) => subscribe('library:newGame', cb),
  onOpenGame: (cb) => subscribe('library:openGame', cb),
  onUpdateState: (cb) => subscribe('update:state', cb),
  onRecs: (cb) => subscribe('recs:update', cb),
});
