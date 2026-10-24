# SFL Pro 🌻

App web instalável (PWA) para jogadores de **Sunflower Land**: timers de tudo o que está crescendo na fazenda, mercado com preços em reais e **notificações push em tempo real**, escolhendo categoria por categoria e item por item o que avisar.

O jogador só informa o **Farm ID**. A chave da Community API fica no servidor.

## Funcionalidades

- **Fazenda:** perfil com a foto do bumpkin, Farm ID e link da ilha para copiar, saldos (FLOWER em R$/US$/€), calculadora de FLOWER, dias restantes de VIP e quanto custa renovar, progresso da expansão da ilha com os recursos necessários, próximo item a ficar pronto e timers de plantações, estufa, frutas, flores, árvores, pedras, ferro, ouro, crimstone, sunstone, petróleo, sal, animais, colmeias, composteiras, cozinha, máquina de plantio, galpão de cura, caixa de criação e baú diário, com anel de progresso.
- **Mercado:** preços do P2P com busca e favoritos, valor do seu inventário, leilões e novidades oficiais.
- **Alertas:** push com o app fechado (o servidor relê a fazenda a cada 5 min e envia em até 15 s depois que algo fica pronto, com a imagem do item), aviso no segundo exato com o app aberto, e liga/desliga por categoria e por item.
- **Detalhes ao tocar:** cada timer, o VIP, a expansão e o saldo abrem uma gaveta com tudo detalhado.
- **Português e inglês**, escolhido no primeiro acesso e trocável nos ajustes (as notificações seguem o idioma).
- **Instalável:** funciona offline com o último estado, atalhos e badge com a quantidade de itens prontos.
- Imagens: arte oficial do repositório do jogo, com a sfl.world como reserva.

## Como funciona

```
Navegador (Vite + React, PWA)
  ├─ /api/sfl  → função da Vercel: proxy para sfl.world e api.sunflower-land.com (adiciona SFL_API_KEY, cache na borda)
  └─ push-api  → edge function Supabase: inscreve/desinscreve o aparelho e salva preferências
Supabase
  ├─ pg_cron (a cada 15 s) → push-tick: lê as fazendas em lote (getFarms), guarda os timers e envia os pushes
  └─ tabelas sflpro_* sem acesso público (só as funções, com service role)
```

As regras de tempo ficam em `supabase/functions/_shared/farm-timers.js` e são usadas pelo app e pelo servidor.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha SFL_API_KEY
npm run dev
```

Testes das regras de tempo: `npm test`.

## Publicar

### Vercel (site)

1. Importe o repositório na Vercel. O `vercel.json` já define build e rotas.
2. Em **Settings → Environment Variables**, crie `SFL_API_KEY` com a chave da Community API.

### Supabase (notificações)

1. **Banco:** abra o **SQL Editor** do projeto, cole todo o arquivo `supabase/migrations/20261023000000_sflpro_push_v2.sql` e rode. Ele apaga as tabelas antigas, cria as novas e agenda o cron a cada 15 segundos. Pode rodar de novo sem problema.
2. **Segredos das funções:** em **Edge Functions → Secrets**, crie `SFL_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:seu@email`). Os valores VAPID estão em `supabase/.env`, que fica só no seu computador.
3. **Funções:** o workflow `.github/workflows/deploy-functions.yml` publica `push-api` e `push-tick` a cada push na `main` que mexa em `supabase/functions`. Ele precisa do segredo `SUPABASE_ACCESS_TOKEN` no GitHub (**Settings → Secrets and variables → Actions**).

Para gerar um par VAPID novo: `npx web-push generate-vapid-keys`. A chave pública também vai em `src/config.js` (ou `VITE_VAPID_PUBLIC_KEY`).

---

Projeto de fã, sem vínculo oficial com Sunflower Land. Feito por markoswcs.

## Apoie

Visite a fazenda do criador (Farm ID 2601876753363557) ou envie qualquer valor pela **rede BASE** para `0xc50D1bB0EF7F6F4E5BBeB06bde2aA4C5Df0C6219`.
