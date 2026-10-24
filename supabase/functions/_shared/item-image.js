import { ASSETS, ASSET_BASE } from './item-assets.js';

// Itens sem arte própria nas duas fontes usam o produto ou um ícone próximo.
const ALIASES = {
  Cow: 'Milk', Sheep: 'Wool', Pig: 'Leather',
  Kitchen: 'Pumpkin Soup', 'Crop Machine': 'Rapid Root', 'Aging Shed': 'Refined Salt',
  'Compost Bin': 'Sprout Mix', Compost: 'Sprout Mix', 'Basic Land': 'Island',
};

/** Arte oficial do jogo quando existe; senão a imagem da sfl.world. */
export function itemImage(name) {
  const resolved = ALIASES[name] ?? name;
  const path = ASSETS[resolved];
  if (path) return ASSET_BASE + path;
  return `https://sfl.world/img/source/${encodeURIComponent(resolved)}.png`;
}
