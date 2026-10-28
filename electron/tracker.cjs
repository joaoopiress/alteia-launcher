// Registo de tempo de jogo: verifica periodicamente que processos estão a correr
// e associa-os aos jogos pela pasta de instalação.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Caminho canónico em minúsculas (resolve nomes curtos 8.3 como "JOAOPI~1" e ligações).
const dirKeys = new Map();
function dirKey(dir) {
  if (!dirKeys.has(dir)) {
    let real = dir;
    try {
      real = fs.realpathSync.native(dir);
    } catch {}
    dirKeys.set(dir, path.normalize(real).toLowerCase().replace(/\\+$/, '') + '\\');
  }
  return dirKeys.get(dir);
}

const POLL_MS = 10_000;
const END_MARK = '__END_OF_LIST__';

// Mantém uma única instância de PowerShell aberta para não pagar o arranque a cada verificação.
class ProcessLister {
  constructor() {
    this.proc = null;
    this.buffer = '';
    this.pending = null;
  }

  ensure() {
    if (this.proc && this.proc.exitCode === null) return;
    this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this.onData(chunk));
    this.proc.on('exit', () => {
      this.proc = null;
      this.finish(null);
    });
    this.proc.stdin.write('[Console]::OutputEncoding = [Text.Encoding]::UTF8\n');
  }

  onData(chunk) {
    this.buffer += chunk;
    const idx = this.buffer.indexOf(END_MARK);
    if (idx === -1) return;
    const text = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx + END_MARK.length);
    this.finish(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    );
  }

  finish(result) {
    if (!this.pending) return;
    const { resolve, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    resolve(result);
  }

  list() {
    if (this.pending) return Promise.resolve(null);
    this.ensure();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.stop();
        resolve(null);
      }, 20_000);
      this.pending = { resolve, timer };
      this.buffer = '';
      // Uma linha por processo: "nome|caminho" (o caminho vem vazio nos processos protegidos).
      this.proc.stdin.write(`Get-Process | ForEach-Object { $_.ProcessName + '|' + $_.Path }; '${END_MARK}'\n`);
    });
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
  }
}

// Converte as linhas "nome|caminho" em { exe, path } com tudo em minúsculas.
function parseProcesses(lines) {
  return lines.map((line) => {
    const i = line.indexOf('|');
    const name = (i === -1 ? line : line.slice(0, i)).trim().toLowerCase();
    const p = i === -1 ? '' : line.slice(i + 1).trim();
    return { exe: name + '.exe', path: p ? path.normalize(p).toLowerCase() : '' };
  });
}

// Devolve os ids dos jogos com um processo a correr. Os jogos com processNames só contam com esses
// executáveis e, se o caminho estiver escondido (anti-cheat), são reconhecidos apenas pelo nome.
function findRunning(games, procs) {
  const found = new Set();
  for (const game of games) {
    if (!game.installDir) continue;
    const dir = dirKey(game.installDir);
    const names = game.processNames;
    const running = procs.some((p) => {
      if (names) return names.includes(p.exe) && (!p.path || p.path.startsWith(dir));
      return p.path && p.path.startsWith(dir);
    });
    if (running) found.add(game.id);
  }
  return found;
}

class PlayTracker {
  // getGames devolve [{ id, installDir, processNames? }]
  constructor(store, getGames, onChange) {
    this.store = store;
    this.getGames = getGames;
    this.onChange = onChange;
    this.lister = new ProcessLister();
    this.active = new Map(); // gameId -> objeto de sessão (o mesmo que está em store.data.sessions)
    this.lastTick = 0;
    this.timer = null;
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.lister.stop();
    this.active.clear();
  }

  runningIds() {
    return [...this.active.keys()];
  }

  // Quando o PC suspende, fecha as sessões no último instante em que o jogo foi visto.
  closeAll() {
    if (this.active.size === 0) return;
    this.active.clear();
    this.store.save();
    this.onChange(this.runningIds());
  }

  async tick() {
    const lines = await this.lister.list();
    if (!lines) return;
    const now = Date.now();
    if (this.lastTick && now - this.lastTick > POLL_MS * 4) this.active.clear();
    this.lastTick = now;

    const found = findRunning(this.getGames(), parseProcesses(lines));

    let changed = false;
    for (const id of found) {
      const session = this.active.get(id);
      if (session) {
        session.end = now;
      } else {
        const s = { gameId: id, start: now, end: now };
        this.store.data.sessions.push(s);
        this.active.set(id, s);
        changed = true;
      }
    }
    for (const id of [...this.active.keys()]) {
      if (!found.has(id)) {
        this.active.delete(id);
        changed = true;
      }
    }
    if (found.size > 0 || changed) this.store.save();
    if (changed) this.onChange(this.runningIds());
  }
}

module.exports = { PlayTracker, parseProcesses, findRunning };
