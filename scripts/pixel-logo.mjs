// Logo do SFL Pro: girassol em pixel art no estilo do Sunflower Land.
// Grade de 24×24 com simetria vertical; exportada em SVG com pixels nítidos.
const N = 24;
const MID = 12; // eixo de simetria (entre as colunas 11 e 12)
const CY = 10.5;

const PAL = {
  K: '#2b1d0e', // contorno
  Y: '#ffcf33', // pétala
  L: '#fff2a0', // brilho
  O: '#f39200', // sombra
  B: '#8a5326', // miolo
  b: '#5b3415', // sementes
  H: '#b47437', // brilho do miolo
  G: '#63d26e', // folha
  g: '#2f8f45', // sombra da folha
  S: '#3fae52', // caule
};

const PETALS = 8;
const CORE = 3.7;
const petalRadius = a => 7.7 + 1.5 * Math.cos(PETALS * a);

// Fração de subamostras dentro da forma: deixa as curvas regulares em pixel.
function coverage(x, y, inside) {
  let hit = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) hit++;
  return hit / 16;
}

export function pixelGrid() {
  const grid = Array.from({ length: N }, () => Array(N).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) grid[y][x] = c; };

  const polar = (px, py) => { const dx = px - MID; const dy = py - CY; return { dx, dy, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) }; };
  const inHead = (px, py) => { const { d, a } = polar(px, py); return d <= petalRadius(a); };
  const inCore = (px, py) => polar(px, py).d <= CORE;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const { dx, dy } = polar(x + 0.5, y + 0.5);
      // Coluna espelhada: o desenho do lado direito repete o esquerdo.
      const mx = x < MID ? x : N - 1 - x;
      if (coverage(x, y, inCore) >= 0.5) {
        const highlight = dx < 0 && dy < 0 && Math.hypot(dx + 1, dy + 1) < 1.6;
        set(x, y, highlight ? 'H' : (mx + y) % 2 === 0 ? 'b' : 'B');
      } else if (coverage(x, y, inHead) >= 0.5) {
        set(x, y, 'Y');
      }
    }
  }

  // Luz de cima à esquerda nas bordas das pétalas.
  const isPetal = (x, y) => 'YLO'.includes(grid[y]?.[x] ?? '.');
  const snapshot = grid.map(r => [...r]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (snapshot[y][x] !== 'Y') continue;
      const openUpLeft = !isPetal(x - 1, y) || !isPetal(x, y - 1);
      const openDownRight = snapshot[y][x + 1] === '.' || snapshot[y + 1]?.[x] === '.' || snapshot[y + 1]?.[x] === undefined;
      const { dx, dy } = polar(x + 0.5, y + 0.5);
      if (openUpLeft && dx + dy < 0 && snapshot[y][x - 1] !== 'B' && snapshot[y - 1]?.[x] !== 'B') set(x, y, 'L');
      else if (openDownRight && dx + dy > 0) set(x, y, 'O');
    }
  }

  // Caule centralizado e duas folhas espelhadas.
  for (let y = 18; y < 23; y++) { set(11, y, 'S'); set(12, y, 'S'); }
  const leaf = [[8, 20], [9, 20], [7, 21], [8, 21], [9, 21], [10, 21], [8, 22], [9, 22], [10, 22]];
  leaf.forEach(([x, y]) => { set(x, y, 'G'); set(N - 1 - x, y, 'G'); });
  [[7, 21], [8, 22]].forEach(([x, y]) => { set(x, y, 'g'); set(N - 1 - x, y, 'g'); });

  // Contorno: em volta de tudo e entre o miolo e as pétalas.
  const solid = (x, y) => (grid[y]?.[x] ?? '.') !== '.' && grid[y][x] !== 'K';
  const toOutline = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const here = grid[y][x];
      if (here === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => solid(x + ox, y + oy))) toOutline.push([x, y]);
      if ('YLO'.includes(here) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => 'BbH'.includes(grid[y + oy]?.[x + ox] ?? '.'))) toOutline.push([x, y]);
    }
  }
  toOutline.forEach(([x, y]) => set(x, y, 'K'));
  return grid;
}

/** SVG do girassol. `pad` é a margem em pixels da grade; `bg` desenha o fundo. */
export function pixelSvg({ bg = '#14301c', radius = 0.22, pad = 3, full = false } = {}) {
  const grid = pixelGrid();
  const total = N + pad * 2;
  const rects = grid.flatMap((row, y) => row.map((c, x) => (PAL[c]
    ? `<rect x="${x + pad}" y="${y + pad}" width="1.02" height="1.02" fill="${PAL[c]}"/>` : ''))).join('');
  const back = bg ? `<rect width="${total}" height="${total}" ${full ? '' : `rx="${total * radius}"`} fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">${back}${rects}</svg>`;
}

/** Silhueta branca da cabeça da flor, com o miolo vazado, para a barra de notificações. */
export function pixelBadgeSvg() {
  const grid = pixelGrid();
  const pad = 2;
  const total = N + pad * 2;
  const rects = grid.flatMap((row, y) => row.map((c, x) => {
    // Pétalas e miolo cheios; o contorno entre eles vira um anel vazado, então lê como flor.
    const inHeadArea = Math.hypot(x + 0.5 - MID, y + 0.5 - CY) < 10.5 && y < 18;
    const keep = inHeadArea && 'YLOBbH'.includes(c);
    return keep ? `<rect x="${x + pad}" y="${y + pad + 2}" width="1.02" height="1.02" fill="#fff"/>` : '';
  })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">${rects}</svg>`;
}
