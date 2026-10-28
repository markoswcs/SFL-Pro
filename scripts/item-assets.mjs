// Atualiza supabase/functions/_shared/item-assets.js com as imagens dos itens novos do jogo.
// Uso: node scripts/item-assets.mjs <pasta do repositório sunflower-land>
// Lê src/features/game/types/images.ts (ITEM_DETAILS) e, para cada item cuja imagem é um import de
// "assets/…", guarda o caminho. Itens que já estão no mapa ficam como estão.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
if (!repo) throw new Error('Informe a pasta do repositório sunflower-land.');
const src = readFileSync(join(repo, 'src/features/game/types/images.ts'), 'utf8');
const out = new URL('../supabase/functions/_shared/item-assets.js', import.meta.url);

const imports = Object.fromEntries([...src.matchAll(/^import (\w+) from ["']assets\/([^"']+)["'];/gm)].map(m => [m[1], m[2]]));

// Cada entrada: "Nome": { ... image: identificador, ...
const found = {};
for (const m of src.matchAll(/^ {2}(?:"([^"]+)"|'([^']+)'|([A-Z][\w ]*)): \{([\s\S]*?)^ {2}\},?$/gm)) {
  const name = m[1] ?? m[2] ?? m[3];
  const image = m[4].match(/^ {4}image: (\w+),?$/m)?.[1];
  if (name && image && imports[image]) found[name] = imports[image];
}

const current = readFileSync(out, 'utf8');
const assets = JSON.parse(current.match(/export const ASSETS = (\{.*\});/s)[1]);
const added = Object.keys(found).filter(name => !assets[name]);
for (const name of added) assets[name] = found[name];

writeFileSync(out, current.replace(/export const ASSETS = \{.*\};/s, `export const ASSETS = ${JSON.stringify(assets)};`));
console.log(`${Object.keys(found).length} itens com imagem no jogo, ${added.length} novos adicionados.`);
if (added.length) console.log(added.slice(0, 40).join(', ') + (added.length > 40 ? '…' : ''));
