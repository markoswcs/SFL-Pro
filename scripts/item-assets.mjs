// Atualiza supabase/functions/_shared/item-assets.js com as imagens dos itens novos do jogo.
// Uso: node scripts/item-assets.mjs <pasta do repositório sunflower-land>
// Lê src/features/game/types/images.ts (ITEM_DETAILS) e resolve três formatos de imagem:
// - import de "assets/…" → caminho no repositório (ASSET_BASE);
// - SUNNYSIDE.a.b → arquivo no servidor de imagens do jogo (game-assets), via src/assets/sunnyside.ts;
// - CROP_LIFECYCLE[…].Nome.crop → game-assets/crops/<pasta>/crop.png, via features/island/plots/lib/plant.ts.
// Itens que já estão no mapa ficam como estão.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Servidor público das imagens "protegidas" do jogo (CONFIG.PROTECTED_IMAGE_URL), com CORS liberado.
const GAME_ASSETS = 'https://sunflower-land.com/game-assets';

const repo = process.argv[2];
if (!repo) throw new Error('Informe a pasta do repositório sunflower-land.');
const read = path => readFileSync(join(repo, path), 'utf8');
const src = read('src/features/game/types/images.ts');
const out = new URL('../supabase/functions/_shared/item-assets.js', import.meta.url);

const imports = Object.fromEntries([...src.matchAll(/^import (\w+) from ["']assets\/([^"']+)["'];/gm)].map(m => [m[1], m[2]]));

// SUNNYSIDE: objeto aninhado de caminhos; montamos "a.b" → URL acompanhando as chaves abertas.
const sunnyside = {};
const stack = [];
for (const line of read('src/assets/sunnyside.ts').split('\n')) {
  const open = line.match(/^\s*(?:"([^"]+)"|(\w+)): \{\s*$/);
  if (open) { stack.push(open[1] ?? open[2]); continue; }
  if (/^\s*\},?\s*$/.test(line)) { stack.pop(); continue; }
  const value = line.match(/^\s*(?:"([^"]+)"|(\w+)):\s*`\$\{CONFIG\.PROTECTED_IMAGE_URL\}(\/[^`]+)`/);
  if (value) sunnyside[[...stack, value[1] ?? value[2]].join('.')] = GAME_ASSETS + value[3];
}

// CROP_LIFECYCLE: a pasta de cada plantação está no mapa IMAGES de plant.ts.
const plant = read('src/features/island/plots/lib/plant.ts');
const imagesBlock = plant.slice(plant.indexOf('const IMAGES'), plant.indexOf('};', plant.indexOf('const IMAGES')));
const cropFolders = Object.fromEntries([...imagesBlock.matchAll(/^\s*(?:"([^"]+)"|(\w+)):\s*"([^"]+)"/gm)].map(m => [m[1] ?? m[2], m[3]]));

function resolve(image) {
  if (imports[image]) return imports[image];
  const sun = image.match(/^SUNNYSIDE\.([\w.]+)$/);
  if (sun) return sunnyside[sun[1]] ?? null;
  const crop = image.match(/^CROP_LIFECYCLE\["[^"]+"\]\.(?:"([^"]+)"|\["([^"]+)"\]|(\w+))\.crop$/) ?? image.match(/^CROP_LIFECYCLE\["[^"]+"\]\["([^"]+)"\]\.crop$/);
  const cropName = crop && (crop[1] ?? crop[2] ?? crop[3]);
  if (cropName && cropFolders[cropName]) return `${GAME_ASSETS}/crops/${cropFolders[cropName]}/crop.png`;
  return null;
}

// Cada entrada: "Nome": { ... image: <referência>, ...
const found = {};
for (const m of src.matchAll(/^ {2}(?:"([^"]+)"|'([^']+)'|([A-Z][\w ]*)): \{([\s\S]*?)^ {2}\},?$/gm)) {
  const name = m[1] ?? m[2] ?? m[3];
  const image = m[4].match(/^ {4}image:\s*([^,\n]+),?$/m)?.[1]?.trim();
  const path = image && resolve(image);
  if (name && path) found[name] = path;
}

const current = readFileSync(out, 'utf8');
const assets = JSON.parse(current.match(/export const ASSETS = (\{.*\});/s)[1]);
const added = Object.keys(found).filter(name => !assets[name]);
for (const name of added) assets[name] = found[name];

writeFileSync(out, current.replace(/export const ASSETS = \{.*\};/s, `export const ASSETS = ${JSON.stringify(assets)};`));
console.log(`${Object.keys(found).length} itens com imagem no jogo, ${added.length} novos adicionados.`);
if (added.length) console.log(added.slice(0, 40).join(', ') + (added.length > 40 ? '…' : ''));
