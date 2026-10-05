# POC — Fila de sincronização offline-first

Prova de conceito de um app de **registro de pedidos de venda** que funciona sem
rede: tudo é gravado no dispositivo e sincronizado com o servidor depois, com
fila (outbox), retry com backoff, conflito e PWA instalável.

Duas vistas:

- **Registro** (`Pedidos de venda`): a cara de um app normal — criar/editar/excluir
  pedidos, buscar na lista e ver o estado de sincronização de cada item.
- **Backoffice**: tudo de sync — espelho do servidor, fila de outbox, simulação de
  rede/falhas, log de eventos e os botões de manutenção.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b + vite build
npm run lint     # oxlint
npm test         # vitest (jsdom + fake-indexeddb)
npm run preview  # serve do build (aqui o service worker é registrado)
```

O service worker só é registrado em build de produção (`import.meta.env.PROD`),
então a experiência offline end-to-end aparece no `npm run preview`.

## Arquitetura

```
UI (React)
 └─ useEngine() → subscribe/getSnapshot (useSyncExternalStore)
     └─ SyncEngine (src/lib/engine.ts)
         ├─ IndexedDB poc-offline-sync
         │    ├─ store "pedidos"  → verdade local
         │    └─ store "fila"     → outbox (1 operação por pedido)
         └─ servidor mock (localStorage)
              ├─ poc-sync:servidor → registros + rev + atualizadoEm
              ├─ poc-sync:tumbas   → tombstones de remoção
              └─ poc-sync:idemp    → replay idempotente por chave
```

Fluxo de escrita:

1. `criarPedido/editarPedido/removerPedido` grava no IndexedDB **e** na outbox —
   nunca no servidor direto.
2. O outbox guarda **uma operação por pedido** (coalescência): edições repetidas
   viram um único `create`/`update`, e `rev`/`chave` são renovados a cada mutação.
3. `drenar()` envia na ordem da fila (respeitando `seq`) com latência simulada;
   sucesso remove a operação e grava a `serverRev` do registro no device.
4. Após um push (e no `init`/reconexão) roda o **pull**: `server.desde(cursor)`
   traz registros alterados e tombstones desde o último cursor.

## Protocolo cliente ↔ servidor

| Situação | Resposta | Comportamento do engine |
| --- | --- | --- |
| Envio ok | `200` + registro com `rev+1` | remove da fila, grava `serverRev` |
| Replay da mesma `chave` | mesmo registro (idempotente) | nada muda (retry seguro) |
| `total > 50.000` | `422` **permanente** | vai direto para quarentena (`failed`) |
| `503`/timeout | `503` transitória | backoff exponencial + jitter, até 6 device `rev` menor **e** `atualizadoEm` antigo | `409 ErroConflito` | device **adota a versão do servidor**, descarta a op e conta o conflito |
| Device apaga | tombstone no servidor | pull propaga a remoção para as demais abas/devices |

Backoff: `espera = exp/2 + rand(0, exp/2)`, `exp = min(base * 2^(tentativa-1), teto)`
— base 1s, teto 30s (isso evita thundering herd quando o servidor volta).

## Concorrência e isolamento

- **Multi-aba**: `BroadcastChannel('poc-sync:canal')` — quando uma aba termina de
  drenar, as outras rereem IndexedDB e servidor; gravas em `localStorage` também
  dispararão o mesmo caminho na aba de origem.
- **Uma drenagem por vez**: `navigator.locks('poc-sync:drenar', { ifAvailable })`
  — a aba que não consegue a trava cede e não duplica envio.
- **Prefs de simulação** (pausa/taxa/latência) persistem em `poc-sync:sim`;
  `online` é `navigator.onLine` + listeners (o `Switch` do header sobrepõe).
- **Última sincronização** fica em `poc-sync:ultima-sync` e aparece no badge do
  header.

## PWA

- `public/manifest.webmanifest` + `theme-color` no `index.html` (instalável).
- `public/sw.js`: network-first para navegação (com cache de fallback) e
  cache-first para assets same-origin GET.
- Registro em `src/main.tsx` apenas em produção.

## Testes

`npm test` — Vitest em `jsdom` com `fake-indexeddb` (20 testes):

- `backoff.test.ts`: limites do backoff, `fmtDuracao`, `fmtHora`.
- `mock-server.test.ts`: idempotência por chave, `409`, `422` permanente,
  tombstones e `desde(cursor)`.
- `engine.test.ts`: outbox offline, coalescência, descarte de create não enviado,
  push ao voltar online com `serverRev`, quarentena `422`, conflito `409`,
  pull de registros e pull de tombstone.

## Limitações conhecidas (é uma POC)

- Servidor é `localStorage` no mesmo navegador — não há rede real nem backend.
- Não há autenticação, paginação nem resolução automática de conflito (o device
  simplesmente adota a versão do servidor).
- Cursor de pull é monotônico por dispositivo (sem re-sync completo).
- Só a entidade `pedido` está modelada; não há esquema/versão de migração.
