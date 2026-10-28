// Persistência simples num ficheiro JSON dentro da pasta de dados da app.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  version: 1,
  settings: {
    sgdbKey: '',
    closeToTray: true,
    startWithWindows: false,
    achievementPopup: true,
    achievementSound: true,
    autoTvMode: false,
  },
  // Coleções criadas pelo utilizador (podem estar vazias); os jogos guardam-nas em meta.tags.
  collections: [],
  // Conquistas desbloqueadas: { id: data em ms }
  achievements: {},
  // Ações pontuais que contam para conquistas (ex.: jogar a partir do "Jogo aleatório").
  achievementEvents: {},
  // Tier list: ids dos jogos em cada nível, pela ordem em que aparecem.
  tierList: { S: [], A: [], B: [], C: [], D: [] },
  // Lista "Quero jogar": { key, kind: 'owned'|'steam'|'custom', id?, appid?, name, addedAt }
  wishlist: [],
  // Respostas das lojas guardadas para não repetir pedidos (etiquetas, recomendações…).
  cache: {},
  // Jogos adicionados à mão: { id, name, exePath, addedAt }
  manual: [],
  // Personalizações e cache por jogo: { name, hidden, favorite, cover, hero, coverTried, baseline }
  meta: {},
  // Sessões de jogo registadas: { gameId, start, end } (ms desde epoch)
  sessions: [],
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'library.json');
    this.coversDir = path.join(dir, 'covers');
    fs.mkdirSync(this.coversDir, { recursive: true });
    this.data = this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        ...structuredClone(DEFAULTS),
        ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  meta(gameId) {
    if (!this.data.meta[gameId]) this.data.meta[gameId] = {};
    return this.data.meta[gameId];
  }

  // Escrita atómica: escreve num ficheiro temporário e depois substitui.
  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), 500);
  }
}

module.exports = { Store };
