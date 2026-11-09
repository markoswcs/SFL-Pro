import { ASSETS, ASSET_BASE } from './item-assets.js';

// Itens sem arte própria nas duas fontes usam o produto ou um ícone próximo.
const ALIASES = {
  Kitchen: 'Pumpkin Soup', 'Crop Machine': 'Rapid Root', 'Aging Shed': 'Refined Salt',
  'Compost Bin': 'Sprout Mix', Compost: 'Sprout Mix', 'Basic Land': 'Island',
};

/**
 * Arte oficial do jogo quando existe: caminho no repositório (ASSET_BASE) ou endereço completo no
 * servidor de imagens do jogo (game-assets). Senão, a imagem da sfl.world.
 */
export function itemImage(name) {
  // O token FLOWER não está nas fontes de arte; o app tem o ícone dele.
  if (name === 'Flower') return '/icons/flower_token.webp';
  const resolved = ALIASES[name] ?? name;
  const path = ASSETS[resolved];
  if (path) return path.startsWith('https://') ? path : ASSET_BASE + path;
  return `https://sfl.world/img/source/${encodeURIComponent(resolved)}.png`;
}
