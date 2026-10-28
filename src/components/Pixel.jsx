// Cenas em pixel art para o fundo da barra lateral, uma por paleta de cores.
// Cada cena tem duas imagens que alternam, ao estilo das animações de 8 bits.
// Os sprites são grelhas de caracteres: '.' é transparente e cada letra é uma cor da paleta.

function Sprite({ rows, palette, className = '', pixel = 4 }) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.') {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === c) x++;
      rects.push(<rect key={`${start}-${y}`} x={start} y={y} width={x - start} height={1} fill={palette[c]} />);
    }
  });
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg
      className={className}
      width={w * pixel}
      height={h * pixel}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}

// ---------- Fogueira ----------

const LOGS = ['..llbbbbbbbbll..', '.lllbbbllbbblll.', '..lll......lll..'];

const CAMPFIRE = {
  palette: { y: '#ffe08a', o: '#f0a830', r: '#e2553a', b: '#6b4127', l: '#9a6a43' },
  frames: [
    [
      '.......y........',
      '......yy........',
      '......yoy.......',
      '.....yooy.......',
      '....yoooy..y....',
      '....yooroy.yy...',
      '...yoorrooyoy...',
      '...yorrrroooy...',
      '...yorrrrrroy...',
      '....yorrrroy....',
      ...LOGS,
    ],
    [
      '........y.......',
      '........yy......',
      '.......yoy......',
      '.......yooy.....',
      '...y..yoooy.....',
      '..yy.yoorooy....',
      '..yoyoorrooy....',
      '...yoooorrroy...',
      '...yorrrrrroy...',
      '....yorrrroy....',
      ...LOGS,
    ],
  ],
  sparks: true,
};

// ---------- Floresta: dois pinheiros e pirilampos ----------

const FOREST_TREES = [
  '..lggd...lggdd..',
  '.lgggdd....gd...',
  'lggggddd..lggd..',
  '...tt....lgggdd.',
  '...tt.......tt..',
  'mmmmmmmmmmmmmmmm',
  '.m.mm.m.mm.m.m.m',
];

const FOREST = {
  palette: { l: '#8cc66b', g: '#4f9a4f', d: '#2f6b3a', t: '#6b4127', m: '#3a4d36', f: '#ffe08a' },
  frames: [
    ['...l........f...', '...g............', '..lgg......l....', '..ggd......g..f.', '.lggdd....lgg...', '...gd.....ggd...', ...FOREST_TREES],
    ['....l...........', '...g.......f....', '..lgg......l....', '..ggd......g....', '.lggdd....lgg...', 'f..gd.....ggd...', ...FOREST_TREES],
  ],
  slow: true,
};

// ---------- Lua: quarto crescente e estrelas ----------

// A lua é a diferença entre dois círculos; a orla fica num azul mais escuro.
function crescent(stars) {
  const W = 16;
  const H = 13;
  const inOuter = (x, y) => (x - 6.5) ** 2 + (y - 6) ** 2 <= 5.6 ** 2;
  const inInner = (x, y) => (x - 9.6) ** 2 + (y - 6) ** 2 <= 5.2 ** 2;
  const filled = (x, y) => inOuter(x, y) && !inInner(x, y);
  const rows = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      if (filled(x, y)) {
        const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
        row += edge ? 'b' : 'c';
      } else {
        row += stars.some(([sx, sy]) => sx === x && sy === y) ? 's' : '.';
      }
    }
    rows.push(row);
  }
  return rows;
}

const MOON = {
  palette: { c: '#e3ecff', b: '#8fb3e8', s: '#ffe08a' },
  frames: [
    crescent([
      [13, 2],
      [15, 7],
      [11, 11],
    ]),
    crescent([
      [12, 4],
      [14, 10],
      [15, 1],
    ]),
  ],
  slow: true,
};

// ---------- Sakura: cerejeira e pétalas a cair ----------

const SAKURA_TOP = [
  '....PpP..pPp....',
  '..pPppPppPPpp...',
  '.pPPpPpdpPppPp..',
  'pppPPppppPPpPpp.',
  '.pdpppPppdpppd..',
  '..ppd.ttpp.dp...',
  '......tt........',
];

const SAKURA = {
  palette: { p: '#ff8fb8', P: '#ffd1e3', d: '#c4577f', t: '#6b4127', T: '#8a5a3a' },
  frames: [
    [...SAKURA_TOP, '......Tt....P...', '......tt........', '.....tTt.....p..', '....tttTt.......', '...ttt..tt......'],
    [...SAKURA_TOP, '......Tt........', '......tt.....P..', '.....tTt........', '....tttTt.....p.', '...ttt..tt..P...'],
  ],
  slow: true,
};

// ---------- Ameixa: caldeirão mágico com bolhas ----------

const POT = [
  '..KvvvvvvvvvvK..',
  '.kKKKKKKKKKKKKk.',
  '..kkkkkkkkkkkk..',
  '.kkkkkkkkkkkkkk.',
  '.kkkkKkkkkkkkkk.',
  '..kkkkkkkkkkkk..',
  '...kkkkkkkkkk...',
];

const CAULDRON = {
  palette: { k: '#3d3355', K: '#6a5a96', v: '#b48cff', w: '#ece6ff', o: '#f0a830', y: '#ffe08a' },
  frames: [
    ['......w.........', '...........w....', '....w...........', '.........w......', ...POT, '...k.oyoyo..k...', '..kk.yoyoy..kk..'],
    ['..........w.....', '.....w..........', '...........w....', '...w............', ...POT, '...k.yoyoy..k...', '..kk.oyoyo..kk..'],
  ],
  slow: true,
};

const SCENES = {
  fogueira: CAMPFIRE,
  floresta: FOREST,
  lua: MOON,
  sakura: SAKURA,
  ameixa: CAULDRON,
};

// Com a barra lateral recolhida, a cena fica a metade do tamanho (pixels de 2px em vez de 4px).
export function SidebarScene({ theme, small = false }) {
  const scene = SCENES[theme] || CAMPFIRE;
  const pixel = small ? 2 : 4;
  return (
    <div className={`campfire scene-${theme} ${small ? 'small' : ''} ${scene.slow ? 'slow' : ''}`} aria-hidden="true">
      {scene.sparks && (
        <>
          <span className="campfire-spark s1" />
          <span className="campfire-spark s2" />
        </>
      )}
      <Sprite rows={scene.frames[0]} palette={scene.palette} pixel={pixel} className="campfire-frame frame-a" />
      <Sprite rows={scene.frames[1]} palette={scene.palette} pixel={pixel} className="campfire-frame frame-b" />
    </div>
  );
}

export const SCENE_FRAMES = SCENES;
