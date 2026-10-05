# AGENTS.md

Guia operacional para agentes de IA (e pessoas) que trabalham neste
repositório. Leia antes de mexer em qualquer coisa.

## O que é este projeto

POC de **fila de sincronização offline-first** (Vite + React 19 + TypeScript +
Tailwind v4 + shadcn). Duas vistas:

- **Registro** (`src/views/registro-view.tsx`): app "normal" de pedidos de venda
  — só `PedidosPanel` (lista + busca + dialog de criar/editar).
- **Backoffice** (`src/views/backoffice-view.tsx`): tudo de sync — stats, outbox,
  servidor mock, simulação e log.

A regra de negócio inteira vive em `src/lib/` (`engine.ts`, `mock-server.ts`),
a UI só consome o snapshot via `useEngine()`.

## Comandos

| Comando                | Uso                                                             |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | dev server (HMR) em http://localhost:5173                       |
| `npm run build`        | `tsc -b` + bundle — sempre rode ao final de mudanças            |
| `npm run preview`      | serve o `dist/` — **único** jeito de validar o service worker   |
| `npm run lint`         | oxlint (0 erros exigidos)                                       |
| `npm test`             | Vitest (jsdom + fake-indexeddb)                                 |
| `npm run format`       | Prettier `--write .`                                            |
| `npm run format:check` | Prettier `--check .` (roda no CI)                               |
| `npm run typecheck`    | só `tsc -b`                                                     |
| `npm run verify`       | lint + format:check + test + build — **rode antes de commitar** |

Regras: sem `any`, `console.log`, `@ts-ignore` ou `TODO` no código. Textos de UI
e commits em pt-BR.

## Convenções de código

### Estilo

- Prettier (`.prettierrc`): sem ponto e vírgula, aspas simples, largura 100,
  `trailingComma: all` + `.editorconfig`. Nunca reformatar "na mão".
- 5 avisos do oxlint em `src/components/ui/*` (`only-export-components`) são
  conhecidos e aceitos — não tente "consertar" arquivos gerados.

### shadcn / Tailwind

- Import de utilitários: `import { cn } from 'cn'` e `import { Slot } from 'radix-ui'`.
- Ícone dentro de `Button`: sempre `data-icon="inline-start"` (ou `end`).
- **Nunca** `space-x/y` → use `gap`.
- Sem cores raw (`bg-blue-500`): tokens semânticos (`bg-primary`,
  `text-muted-foreground`, `text-destructive`, `Badge variant="secondary|outline|destructive"`).
- `SelectItem` dentro de `SelectGroup`; `TabsTrigger` dentro de `TabsList`.
- Componentes novos: `npx shadcn add <componente>` (funciona porque
  `tsconfig.json` mantém `baseUrl` + `paths` — não remova).

### TypeScript

- `verbatimModuleSyntax`: tipos sempre com `import type`.
- `erasableSyntaxOnly`: nada de parameter properties (`constructor(private x)`)
  nem enums.
- `tsconfig.json` raiz **precisa** manter `baseUrl`, `paths "@/*"` e
  `ignoreDeprecations: "6.0"` (sem isso o CLI do shadcn quebra no Windows).

## Onde mexer

| Tarefa                                           | Arquivos                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Regra de sync (fila, backoff, pull, conflito)    | `src/lib/engine.ts` + `src/lib/types.ts`                                                                                            |
| Protocolo HTTP-mock (status, idempotência, seed) | `src/lib/mock-server.ts`                                                                                                            |
| Persistência IndexedDB                           | `src/lib/idb.ts`                                                                                                                    |
| UI do Registro                                   | `pedidos-panel.tsx`, `lista-pedidos.tsx`, `pedido-dialog.tsx`, `pedido-form.tsx`, `status-pedido-icone.tsx`                         |
| UI do Backoffice                                 | `src/views/backoffice-view.tsx`, `fila-sync.tsx`, `painel-servidor.tsx`, `painel-simulacao.tsx`, `log-eventos.tsx`, `stats-bar.tsx` |
| Cabeçalho/navegação/layout                       | `app-header.tsx`, `app-sidebar.tsx`, `src/App.tsx`                                                                                  |
| Tema                                             | `theme-provider.tsx` (next-themes) + `main.tsx`                                                                                     |
| Novo teste                                       | `src/lib/*.test.ts` (padrão abaixo)                                                                                                 |

## Modelo de dados e storage

- IndexedDB `poc-offline-sync`: stores `pedidos` (keyPath `id`) e `fila`
  (keyPath `opId`). Funções: `listar/salvar/remover/limpar`.
- localStorage: `poc-sync:servidor` (registros + `rev`/`atualizadoEm`),
  `poc-sync:tumbas`, `poc-sync:idemp`, `poc-sync:sim` (prefs de simulação),
  `poc-sync:cursor`, `poc-sync:ultima-sync`.
- **Migrações de dados antigos** ficam em `SyncEngine.recarregarEstado()`
  (pedidos sem `serverRev`/`updatedAt`) e `mock-server.carregar()` (registros
  sem `rev`). Se criar um campo novo, adicione a migração lá.
- Operação `syncing` no IndexedDB = reload no meio do envio; volta para
  `pending` no próximo `init` (não remover esse tratamento).

## Padrão de teste

```ts
const engine = novoEngine({ online: false }) // cria SyncEngine nova e registra
await engine.init()
await vi.waitFor(() => expect(...).toBe(...))
// afterEach chama engine.parar() (fecha timer/ticker/canal)
```

- Setup: `src/test/setup.ts` importa `fake-indexeddb/auto`; ambiente jsdom
  (`vitest.config.ts`).
- `beforeEach`: `localStorage.clear()` + `limpar(STORE_PEDIDOS)` e
  `limpar(STORE_FILA)`.
- Sem ruído de rede: `setSimulacao({ taxaFalha: 0, latenciaMs: 0 })` antes de
  `init()`.
- Cenários cobertos hoje: backoff, idempotência, 409, 422, tombstone, pull,
  outbox/coalescência, quarentena. Ao mudar o protocolo, atualize
  `mock-server.test.ts` e `engine.test.ts`.

## Armadilhas do ambiente

- **chrome-devtools MCP**: página do app é o `pageId: 2`. Screenshot de
  viewport volta **stale** → use `filePath` (salva em disco) ou `fullPage`.
  `fill`/`click` querem o uid **sem** o prefixo `uid=` (ex.: `17_19`).
  Viewport mobile só abaixo de 500px de largura.
- **Dev server**: já costuma estar rodando em 5173; verificar com
  `Invoke-WebRequest http://localhost:5173` antes de subir outro.
- **PWA**: `public/sw.js` só é registrado em produção → validar offline com
  `npm run preview` (não com `dev`).
- **Bundle**: aviso de chunk >500kB é conhecido (POC sem code splitting).

## Git

- Fluxo gitflow: `develop` = integração (trabalho acontece aqui), `main` =
  releases estáveis via merge `--no-ff`; branches `feat/*`, `fix/*`, `chore/*`,
  `docs/*` a partir de `develop`.
- Commits Conventional Commits em pt-BR (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`).
- Pre-commit (husky + lint-staged) roda Prettier e oxlint nos arquivos staged.
- **Não faça commit/push sem pedido explícito**; quando pedir, rode
  `npm run verify` antes.

## Checklist antes de entregar

1. `npm run verify` verde (lint, format, test, build).
2. Se mexeu em UI: conferir no browser as duas vistas, claro/escuro e mobile
   (≤500px), sem overflow horizontal.
3. Se mexeu no protocolo/engine: testes atualizados e rodando.
