// Textos do processo principal (notificações, bandeja, janelas e erros) em português e inglês.
const DICTS = {
  pt: {
    'notify.newGameTitle': 'Novo jogo na ALTEIA',
    'notify.newGameBody': '{name} foi adicionado à biblioteca.',
    'notify.updateTitle': 'ALTEIA {version} disponível',
    'notify.updateBody': 'Abre a ALTEIA para atualizar com um clique.',
    'tray.playing': 'A jogar: {names}',
    'tray.open': 'Abrir ALTEIA',
    'tray.update': 'Atualizar para a versão {version}',
    'tray.quit': 'Sair',
    'dialog.exeTitle': 'Escolher o executável do jogo',
    'dialog.exeFilter': 'Executáveis',
    'dialog.heroTitle': 'Escolher imagem de fundo',
    'dialog.coverTitle': 'Escolher capa',
    'dialog.images': 'Imagens',
    'dialog.updatesDir': 'Escolher a pasta de atualizações',
    'game.unnamed': 'Sem nome',
    'err.gameNotFound': 'Jogo não encontrado.',
    'err.noUpdate': 'Não há nenhuma atualização disponível.',
    'err.url': 'O URL tem de começar por http:// ou https://',
    'err.image': 'Não foi possível obter a imagem.',
    'err.sgdbKey': 'Chave da SteamGridDB inválida.',
    'err.manifest': 'O ficheiro latest.json da pasta de atualizações está inválido.',
    'err.installerMissing': 'Falta o instalador {file} na pasta de atualizações.',
    'err.installerMismatch': 'O instalador não corresponde à versão publicada (ficheiro alterado ou incompleto).',
  },
  en: {
    'notify.newGameTitle': 'New game in ALTEIA',
    'notify.newGameBody': '{name} was added to your library.',
    'notify.updateTitle': 'ALTEIA {version} available',
    'notify.updateBody': 'Open ALTEIA to update with one click.',
    'tray.playing': 'Playing: {names}',
    'tray.open': 'Open ALTEIA',
    'tray.update': 'Update to version {version}',
    'tray.quit': 'Quit',
    'dialog.exeTitle': "Choose the game's executable",
    'dialog.exeFilter': 'Executables',
    'dialog.heroTitle': 'Choose background image',
    'dialog.coverTitle': 'Choose cover',
    'dialog.images': 'Images',
    'dialog.updatesDir': 'Choose the updates folder',
    'game.unnamed': 'Unnamed',
    'err.gameNotFound': 'Game not found.',
    'err.noUpdate': 'No update available.',
    'err.url': 'The URL must start with http:// or https://',
    'err.image': "Couldn't get the image.",
    'err.sgdbKey': 'Invalid SteamGridDB key.',
    'err.manifest': 'The latest.json file in the updates folder is invalid.',
    'err.installerMissing': 'The installer {file} is missing from the updates folder.',
    'err.installerMismatch': "The installer doesn't match the published version (file changed or incomplete).",
  },
};

let lang = 'pt';

function setLang(value) {
  lang = DICTS[value] ? value : 'pt';
}

function t(key, vars) {
  let s = DICTS[lang][key] ?? DICTS.pt[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

module.exports = { setLang, t };
