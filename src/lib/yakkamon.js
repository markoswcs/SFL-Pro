// Yakkamon: o jogo novo dos criadores de Sunflower Land (rede Ronin, mesmo token FLOWER).
// Ainda em pré-registro: não há API de jogador. O que existe de público é o ranking
// (api.yakkamon.com/leaderboard, top 100, refeito a cada 4 h) e a documentação em
// docs.yakkamon.com, de onde vêm as datas e a Yakkapedia abaixo.

export const YAKKA_LINKS = {
  site: 'https://yakkamon.com/',
  play: 'https://yakkamon.com/play',
  docs: 'https://docs.yakkamon.com/',
  dates: 'https://docs.yakkamon.com/pre-registration/important-dates',
  deposits: 'https://docs.yakkamon.com/pre-registration/flower-deposits',
  discord: 'https://discord.gg/yakkamon',
  x: 'https://x.com/yakkamon_game',
  collection: 'https://marketplace.roninchain.com/collections/0x6d1bc5247ca99d917d91ec52dbbb5ef6c2435107',
};

const IMG = 'https://3777468385-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FPCjLqiFAZZfmuQmc2nG9%2Fuploads%2F';

/** Yakkamon Genesis (docs.yakkamon.com/content/yakkapedia). Textos podem mudar até o lançamento. */
export const GENESIS = [
  { name: 'Raigo', ids: '#0–75', supply: 75, rarity: 'legendary', type: 'Dragon', img: `${IMG}git-blob-324ba853609a142a3387b3738c02889a06c9847b%2Fraigo.png?alt=media`, ability: { pt: 'Stormcharged: Yakkamon por perto trabalham 2× mais rápido (área grande)', en: 'Stormcharged: nearby Yakkamon work 2× as fast (large area)' } },
  { name: 'Ondi', ids: '#75–350', supply: 275, rarity: 'legendary', type: 'Dragon', img: `${IMG}git-blob-6497e58af9ff65c445d9a1cef2b811e99dcdc66a%2Fondi.png?alt=media`, ability: { pt: 'Yakkamon por perto produzem o dobro de recursos (área pequena)', en: 'Nearby Yakkamon produce double resources (small area)' } },
  { name: 'Kova', ids: '#350–750', supply: 400, rarity: 'legendary', type: 'Dragon', img: `${IMG}git-blob-05a74a83d5d8d56a996ae1ad5e1aee8925f30e3f%2Fkova.png?alt=media`, ability: { pt: 'Unsleeping: sempre com estamina máxima na fazenda (área pequena)', en: 'Unsleeping: always at max stamina on the farm (small area)' } },
  { name: 'Salu', ids: '#750–2750', supply: 2000, rarity: 'legendary', type: 'Dragon', img: `${IMG}git-blob-60d372a452dd369155ac31430eb5ad3c73be2207%2Fsalu.png?alt=media`, ability: { pt: 'Regenera uma % da vida máxima a cada turno de combate', en: 'Regenerates a % of max HP every combat turn' } },
  { name: 'Malandrix', ids: '#2750–6750', supply: 4000, rarity: 'rare', type: 'Psychic', img: `${IMG}git-blob-81b67afd7967ec8c717b82e4b118e1d97ad7c5ec%2Fmalandrix.png?alt=media`, ability: { pt: 'Trabalhador normal (sem habilidade por enquanto)', en: 'Regular worker (no ability yet)' } },
  { name: 'Brazito', ids: '#6750–22000', supply: 15000, rarity: 'uncommon', type: 'Fire', img: `${IMG}git-blob-5ca7165686b6fe654ed2b5caef21e6e5a8da39d5%2Fbrazito.png?alt=media`, ability: { pt: 'Trabalhador normal (sem habilidade por enquanto)', en: 'Regular worker (no ability yet)' } },
];

/** Cronograma oficial até o acesso antecipado (docs: Important Dates). `at` só quando a data é fixa. */
export const YAKKA_DATES = [
  { key: 'deposits', at: Date.parse('2026-08-10T00:00:00Z') },
  { key: 'mint', at: Date.parse('2026-09-14T00:00:00Z') },
  { key: 'reveal', at: Date.parse('2026-10-14T00:00:00Z') },
  { key: 'leaderboard' },
  { key: 'airdrop' },
  { key: 'early' },
  { key: 'chapter0' },
];
