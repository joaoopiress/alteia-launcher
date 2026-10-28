// Publica a versão acabada de compilar na pasta de atualizações local.
// Uso: npm run release (as notas da versão vêm de release-notes.txt, se existir).
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { defaultUpdatesDir, sha512 } = require('../electron/updater.cjs');

async function main() {
  const version = pkg.version;
  const file = `${pkg.build.productName} Setup ${version}.exe`;
  const src = path.join(__dirname, '..', 'release', file);
  if (!fs.existsSync(src)) throw new Error(`Não encontrei ${src}. Corre primeiro "npm run dist".`);

  const dir = process.env.ALTEIA_UPDATES_DIR || defaultUpdatesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, file));

  const notesFile = path.join(__dirname, '..', 'release-notes.txt');
  const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '';

  const manifest = {
    version,
    file,
    sha512: await sha512(src),
    size: fs.statSync(src).size,
    date: new Date().toISOString(),
    notes,
  };
  // O latest.json é escrito por último, para a app nunca o ver antes de o instalador estar copiado.
  const tmp = path.join(dir, 'latest.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, path.join(dir, 'latest.json'));

  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.exe') && f !== file) fs.rmSync(path.join(dir, f), { force: true });
  }
  console.log(`Versão ${version} publicada em ${dir}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
