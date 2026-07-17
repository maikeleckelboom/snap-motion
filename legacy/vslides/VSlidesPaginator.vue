<script lang="ts" setup>
import {computed, reactive, Ref, unref} from "vue"
import {DistanceAngleBounds} from "@vueuse/gesture"
import {spring} from 'motion'
import {clamp, snap} from "popmotion"
import {nanoid} from "nanoid"
import {Direction} from "./index"

const {elements, bounds, x, width, options, labelPrev, labelNext} = defineProps<{
  width: Ref<number>,
  elements: HTMLElement[],
  options: any,
  bounds: DistanceAngleBounds,
  x: number,
  labelNext?: string,
  labelPrev?: string,
}>()

const emit = defineEmits<{ (e: 'paginate', x: number): void }>()

const findClosestOffset = (offsetX: number, delta: 1 | -1): number => {
  const getOffsets = el => -Number(el.offsetLeft)
  const offsets = unref(elements).map(getOffsets)
  const filterOffsets = (offset) => (delta === Direction.Prev)
      ? offset > offsetX
      : offset < offsetX
  const directionalOffsets = offsets.filter(filterOffsets)
  const getClosest = snap(directionalOffsets)
  const indexOfClosestOffset = offsets.indexOf(getClosest(offsetX))
  const {gap} = unref(options).grid
  return offsets[indexOfClosestOffset] + (gap / 2)
}

const scrollTo = (delta: 1 | -1): void => {
  const offsetX = unref(x) + (-unref(width) * delta)
  const clampedOffsetX = clamp(bounds.min, bounds.max, offsetX)
  const closestOffset = (offsetX === clampedOffsetX)
      ? findClosestOffset(clampedOffsetX, delta)
      : clampedOffsetX
  emit('paginate', closestOffset)
}

const onNext = () => scrollTo(1)
const onPrev = () => scrollTo(-1)

const angleRight = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'
const angleLeft = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'

const prevDisabled = computed(() => unref(x) >= unref(bounds).max - 25)
const nextDisabled = computed(() => unref(x) <= unref(bounds).min + 25)

const componentID = nanoid(4)
const prevID = `prev-${componentID}`
const nextID = `next-${componentID}`

const exposed = {
  onNext,
  onPrev,
  angleRight,
  angleLeft,
}

defineExpose(exposed)

const motion = reactive({
  initial: {
    opacity: 0,
    scale: 0,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.005,
      easing: spring({
        stiffness: 200,
        damping: 50,
      })
    },
  },
  exit: {
    opacity: 0,
    scale: 0,
    transition: {
      duration: 0.05,
      easing: spring({
        stiffness: 200,
        damping: 50,
      })
    },
  },
})
</script>

<template>
  <div class="v-slides-paginator">
    <slot v-bind="exposed">
      <div class="v-slides-paginator-navigator">
        <Presence>
          <Motion
              v-if="!prevDisabled"
              :aria-labelledby="prevID"
              :data-disabled="prevDisabled"
              :disabled="prevDisabled"
              class="v-slides-btn"
              data-direction="prev"
              tag="button"
              v-bind="motion"
              v-on:click.prevent="onPrev">
            <span v-html="angleLeft"/>
            <span v-show="labelPrev"
                  :id="prevID"
                  v-html="labelPrev"/>
          </Motion>
        </Presence>
        <Presence>
          <Motion
              v-if="!nextDisabled"
              :aria-labelledby="nextID"
              :data-disabled="nextDisabled"
              :disabled="nextDisabled"
              class="v-slides-btn"
              data-direction="next"
              tag="button"
              v-bind="motion"
              v-on:click.prevent="onNext">
            <span v-show="labelNext"
                  :id="nextID"
                  v-html="labelNext"/>
            <span v-html="angleRight"/>
          </Motion>
        </Presence>
      </div>
    </slot>
  </div>
</template>

<style lang="scss" scoped>
.v-slides-paginator {

  :slotted(*) {
    pointer-events: none;

    button {
      pointer-events: auto;
    }
  }

  .v-slides-paginator-navigator {
    position: absolute;
    inset: 4px;
    display: flex;
    align-items: center;

    .v-slides-btn {
      --size: 40px;
      height: var(--size);
      width: var(--size);
      background: #FFFFFF;
      color: #2A2A2A;
      border-radius: 50%;
      box-shadow: rgba(0, 0, 0, 0.1) 0 1px 3px 0,
      rgba(0, 0, 0, 0.06) 0 1px 2px 0;
      z-index: 1;
      cursor: pointer;
      border: solid 2px transparent;
      position: absolute;


      &:focus-visible {
        border: solid 2px #2A2A2A;
      }

      > span {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      &[data-direction="prev"] {
        left: 0;
      }

      &[data-direction="next"] {
        right: 0;
      }
    }
  }
}
</style>