<script lang="ts" setup>
import {ComponentOptions, computed, ref, unref, watch} from "vue";
import {useThrottleFn} from '@vueuse/core'
import {MotionVariants} from "@vueuse/motion";
import {useGridProperties} from "../../composables/useGridProperties";

interface Item {
  component?: ComponentOptions
  title: string,
}

interface Props {
  items: Item[],
  options: any,
  x?: number,
}

const {options, items, x} = defineProps<Props>()

const mode = computed((): 'free' | 'sticky' | 'fixed' => unref(options).mode)

const emit = defineEmits<{ (e: 'paginate', index: number): void, (e: 'animationend', finished: boolean): void }>()

const throttledPaginate = useThrottleFn(index => emit('paginate', index), 50, false)

const sendPaginateEvent = (index) => throttledPaginate(index)

const grid = ref<HTMLElement>()

const updateCSSVariables = () => useGridProperties(grid, unref(options))

watch(options, () => updateCSSVariables())

const elements = ref<HTMLElement[]>([])

const initialPageFinished = ref<boolean>(false)

const initialMotion = ref({
  opacity: 0.5,
  scale: 0,
})

const animateMotion = (index, item) => ({
  scale: 1,
  opacity: 1,
  transition: {
    delay: item?.preventDelay ? 0 : 0.05 * index,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  }
}) as MotionVariants

const onMotionComplete = (event: any) => {
  const {target} = event
  const {index} = target.dataset
  if (!unref(options)?.grid) return
  const {rows, columns} = unref(options).grid
  const isLastItem = Number(index) === Number(rows * columns)
  if (isLastItem) initialPageFinished.value = true
}

watch(initialPageFinished, () => {
  if (!initialPageFinished.value) return
  emit('animationend', true)
})

</script>

<template>
  <div ref="grid"
       :data-mode="mode"
       class="v-slides-grid">
    <Presence
        v-for="(item, index) in items"
        :key="index">
      <Motion
          :key="`index-${index}`"
          :ref="el => elements[index] = el"
          :animate="animateMotion(index, item)"
          :data-index="index"
          :exit="initialMotion"
          :initial="initialMotion"
          class="v-slides-grid-item"
          v-on:motioncomplete="onMotionComplete">
        <component
            :is="item.component"
            :item="item"
            tabindex="0"
            @keydown.tab.prevent="sendPaginateEvent(index)"/>
      </Motion>
    </Presence>
  </div>
</template>

<style lang="scss" scoped>
.v-slides-grid {
  display: grid;
  grid-template-rows: repeat(var(--grid-rows), 1fr);
  grid-auto-flow: var(--grid-fill, column);
  gap: var(--grid-gap, 0px);

  &[data-mode="fixed"] {
    .v-slides-grid-item {
      width: var(--grid-item-width);
    }
  }

  .v-slides-grid-item {
    position: relative;
    overflow: hidden;
    touch-action: none;
    contain: layout;
  }
}
</style>