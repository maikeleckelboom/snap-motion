<script setup lang="ts">
defineProps<{ mode: "tall" | "short" | "prose" }>();
const notes = [
  {
    title: "Start with a path",
    body: "Orbit follows a circular route. Traverse connects two points. Choose a shape before deciding how quickly to move through it.",
  },
  {
    title: "Give the eye an anchor",
    body: "A fixed reference makes a moving surface easier to follow. In the atlas, each marker connects a position to a named study.",
  },
  {
    title: "Show what comes next",
    body: "A glimpse of the next card invites movement. Its edge is enough to suggest another layer without obscuring the current one.",
  },
  {
    title: "Leave room to reverse",
    body: "An interaction can change direction before it reaches its destination. Try catching a card and pulling it back towards you.",
  },
  {
    title: "Keep a place in the collection",
    body: "A collection can grow without becoming unfamiliar. Rows and columns change the view; the study names provide continuity.",
  },
  {
    title: "Use depth with purpose",
    body: "A card in front owns the current view. The cards behind it show order, giving each exchange somewhere to begin and end.",
  },
  {
    title: "Make space for detail",
    body: "The sheet offers a closer view without replacing the collection. Scroll these notes while the surrounding surface stays in place.",
  },
  {
    title: "Return to the starting point",
    body: "Closing a detail view brings focus back to its opener. The collection is still there, ready for the next move.",
  },
];
</script>

<template>
  <div class="public-sheet-content" :data-content-mode="mode">
    <template v-if="mode === 'tall'">
      <p class="content-intro">
        Eight observations from the motion collection. Scroll to read; use the handle to move the
        sheet.
      </p>
      <section
        v-for="(note, index) in notes"
        :key="note.title"
        class="field-note"
        :data-testid="index === notes.length - 1 ? 'final-note-row' : undefined"
      >
        <span>{{ String(index + 1).padStart(2, "0") }}</span>
        <div>
          <h3>{{ note.title }}</h3>
          <p>{{ note.body }}</p>
        </div>
      </section>
    </template>
    <template v-else-if="mode === 'short'">
      <div class="study-summary">
        <svg aria-hidden="true" viewBox="0 0 100 100">
          <circle cx="48" cy="48" r="34" fill="#232527" />
          <circle cx="66" cy="34" r="25" fill="#e4ded1" />
          <circle cx="18" cy="77" r="6" fill="#b84924" />
        </svg>
        <div>
          <p class="content-reference">01 / CIRCULAR PATH</p>
          <h3>Orbit</h3>
          <p>A continuous route around a fixed point. A compact study, with everything in view.</p>
        </div>
      </div>
    </template>
    <article v-else class="reading-room">
      <p class="content-reference">COLLECTION ESSAY / 2 MIN READ</p>
      <h3>A place between states</h3>
      <p>
        Movement gives an interface a sense of place. A screen arriving from the side suggests a
        neighbour; a card disappearing behind a pile suggests an order.
      </p>
      <p>
        These small relationships help us follow a change. We see where something came from, where
        it is going, and what remains within reach.
      </p>
      <h4>Room to change your mind</h4>
      <p>
        Touch makes this relationship more immediate. A moving surface becomes something we can
        catch, pause or send in another direction. Its destination is a possibility until we let go.
      </p>
      <p>
        Try the same gesture with a different preset. The path remains familiar, while the response
        to your hand changes.
      </p>
      <h4>Keep the surroundings steady</h4>
      <p>
        A useful detail view leaves the wider context intact. This reading space shares the sheet
        with its handle and snap controls, while the page waits where you left it.
      </p>
    </article>
  </div>
</template>

<style scoped>
.public-sheet-content {
  padding-block: 1.25rem 2rem;
  max-inline-size: 60rem;
  margin-inline: auto;
}
.content-intro {
  max-inline-size: 42rem;
  font-size: 1rem;
  line-height: 1.55;
  margin-block-end: 1.25rem;
  color: var(--pg-muted);
}
.field-note {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 1rem;
  padding-block: 1.25rem;
  border-block-start: 1px solid var(--pg-line);
}
.field-note > span,
.content-reference {
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  color: var(--pg-muted);
}
.field-note h3 {
  font-size: 1.1rem;
  font-weight: 650;
  line-height: 1.3;
}
.field-note p {
  max-inline-size: 42rem;
  margin-block-start: 0.45rem;
  font-size: 0.95rem;
  color: var(--pg-muted);
}
.study-summary {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 1.25rem;
  align-items: center;
}
.study-summary svg {
  inline-size: 100%;
  border-radius: 0.6rem;
  background: #e4ded1;
}
.study-summary h3 {
  font-size: 1.65rem;
  letter-spacing: -0.025em;
}
.study-summary p:last-child {
  max-inline-size: 34rem;
  font-size: 0.95rem;
  color: var(--pg-muted);
}
.reading-room {
  max-inline-size: 42rem;
  margin-inline: auto;
  display: grid;
  gap: 1.15rem;
}
.reading-room h3 {
  font-size: clamp(1.6rem, 4vw, 2.5rem);
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -0.035em;
}
.reading-room h4 {
  font-size: 1.1rem;
  padding-block-start: 0.5rem;
}
.reading-room > p:not(.content-reference) {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--pg-ink-soft);
}
</style>
