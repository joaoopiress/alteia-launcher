// Cor fixa de cada jogo nas estatísticas. A ordem das cores foi validada para daltonismo
// quando aparecem lado a lado; por isso cada jogo recebe a cor seguinte por ordem de
// primeira sessão e mantém-na sempre (a cor segue o jogo, não a posição no ranking).
export const GAME_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

// A partir do 9.º jogo jogado, as cores repetir-se-iam e deixariam de distinguir jogos:
// esses ficam agrupados num cinzento "Outros jogos".
export const OTHER_COLOR = '#8a7a66';
export const OTHER_ID = '__other__';

export function gameColorMap(sessions) {
  const first = new Map();
  for (const s of sessions) {
    if (s.end <= s.start) continue;
    const prev = first.get(s.gameId);
    if (prev === undefined || s.start < prev) first.set(s.gameId, s.start);
  }
  const ordered = [...first.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const map = new Map();
  ordered.forEach(([id], i) => {
    if (i < GAME_PALETTE.length) map.set(id, { color: GAME_PALETTE[i], slot: i });
  });
  return map;
}
