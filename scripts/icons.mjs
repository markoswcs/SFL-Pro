// Gera os ícones do app a partir da logo em pixel art (scripts/pixel-logo.mjs).
// Uso: node scripts/icons.mjs (precisa do pacote sharp; SHARP_PATH aponta para outra instalação)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pixelBadgeSvg, pixelSvg } from './pixel-logo.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH ?? 'sharp');

const out = 'public/icons';
const icon = pixelSvg({ pad: 3 });
// Android recorta o ícone em círculo/gota: fundo até a borda e a flor dentro da zona segura.
const maskable = pixelSvg({ pad: 5, full: true });
// iOS arredonda sozinho; fundo cheio.
const apple = pixelSvg({ pad: 3, full: true });
const favicon = pixelSvg({ pad: 1, radius: 0.18 });

writeFileSync(`${out}/icon.svg`, favicon);
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(`${out}/${file}`);

await Promise.all([
  png(icon, 192, 'icon-192.png'),
  png(icon, 512, 'icon-512.png'),
  png(maskable, 512, 'maskable-512.png'),
  png(apple, 180, 'apple-touch-icon.png'),
  png(favicon, 64, 'favicon-64.png'),
  png(pixelBadgeSvg(), 96, 'badge-96.png'),
]);
console.log('ícones gerados em', out);
