<script lang="ts" setup>
import {computed, ref, unref} from "vue"
import {useActiveElement, useElementBounding, useElementHover} from "@vueuse/core"

const wrapper = ref<HTMLElement>()

const {width} = useElementBounding(wrapper)
const hovered = useElementHover(wrapper)

const activeElement = useActiveElement()
const focused = computed(() => unref(wrapper)
    ? unref(wrapper).contains(activeElement.value)
    : false)

const exposures = {width, hovered: unref(hovered), focused: unref(focused)}

defineExpose(exposures)
</script>

<template>
  <div ref="wrapper"
       :class="{focused, width, hovered}"
       class="v-slides-wrapper"
       tabindex="-1">

    <slot v-bind="exposures"/>
  </div>
</template>

<style scoped>
.v-slides-wrapper {
  position: relative;
  overflow: hidden;
  height: fit-content;
}
</style>