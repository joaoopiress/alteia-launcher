// Atualizações a partir de uma pasta local: o script `npm run release` copia para lá o
// instalador novo e um latest.json; a app compara a versão e instala em modo silencioso.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { t } = require('./i18n.cjs');

// Fora do AppData de propósito: programas instalados como pacote do Windows (MSIX), como o
// terminal usado para publicar, escrevem no AppData para uma cópia privada que a app não vê.
function defaultUpdatesDir() {
  return path.join(os.homedir(), 'ALTEIA', 'updates');
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function sha512(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject);
  });
}

// Devolve { available, version, notes, installer, sha512 } ou { available: false, latest }.
// Se o latest.json não existir, devolve { missing: true }: pode ser só o instante em que está a ser substituído.
async function checkFolder(dir, currentVersion) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(path.join(dir, 'latest.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { available: false, latest: null, missing: true };
    throw new Error(t('err.manifest'));
  }
  if (compareVersions(manifest.version, currentVersion) <= 0) {
    return { available: false, latest: manifest.version };
  }
  const installer = path.join(dir, path.basename(manifest.file));
  if (!fs.existsSync(installer)) throw new Error(t('err.installerMissing', { file: manifest.file }));
  return {
    available: true,
    version: manifest.version,
    notes: manifest.notes || '',
    date: manifest.date || null,
    installer,
    sha512: manifest.sha512,
  };
}

// Verifica o instalador, copia-o para a pasta temporária e corre-o em modo silencioso.
// O instalador fecha a versão atual, mantém os dados e volta a abrir a app no fim.
async function installUpdate(info) {
  if ((await sha512(info.installer)) !== info.sha512) {
    throw new Error(t('err.installerMismatch'));
  }
  const tmp = path.join(os.tmpdir(), `ALTEIA-Setup-${info.version}.exe`);
  await fs.promises.copyFile(info.installer, tmp);
  spawn(tmp, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
}

module.exports = { defaultUpdatesDir, checkFolder, installUpdate, compareVersions, sha512 };
