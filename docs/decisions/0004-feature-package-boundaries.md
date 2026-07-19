# 0004: Organize Vue exports by feature and roll up declarations

Status: accepted.

## Decision

Organize the Vue package around `carousel`, `bottom-sheet`, `dialog`, `motion`, and `localization`.
Keep browser mechanics under precise internal capabilities. Publish capability entrypoints and a
curated root, but no implementation-form, wildcard, or internal deep-import entrypoints.

Use extensionless relative imports between TypeScript source modules. Emit declarations to a
temporary graph, apply the minimum required Vue SFC compatibility normalization there, and use API
Extractor to produce one self-contained declaration rollup per public entrypoint.

## Rationale

Feature ownership makes dependency direction reviewable before new components increase the graph.
Self-contained declarations decouple ergonomic source imports from Node16 and NodeNext declaration
resolution. Keeping intermediate declarations outside `dist` also prevents private contexts,
browser policies, declaration maps, and compatibility aliases from becoming packed artifacts.
