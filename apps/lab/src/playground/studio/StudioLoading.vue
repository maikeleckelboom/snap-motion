<template>
  <div class="studio-loading" aria-busy="true" data-testid="studio-loading" role="status">
    <p>Opening Motion Studio…</p>
  </div>
</template>

<style scoped>
.studio-loading {
  display: grid;
  place-items: center;
  min-block-size: inherit;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}
</style>
