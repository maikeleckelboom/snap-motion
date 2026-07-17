<!--<script lang="ts" setup>-->
<!--import {computed, Ref, ref, toRefs, unref, watch} from "vue"-->
<!--import {GestureState, useGesture} from "@vueuse/gesture"-->
<!--import {PropertiesKeys, useMotionProperties, useSpring} from "@vueuse/motion"-->
<!--import {eagerComputed, unrefElement} from "@vueuse/core"-->
<!--import {nanoid} from "nanoid"-->

<!--interface Props {-->
<!--  layout: Ref<HTMLElement>-->
<!--  track: Ref<HTMLElement>-->
<!--  bounds: Bounds-->
<!--  offset: number-->
<!--}-->

<!--interface updateEvent {-->
<!--  progress: number,-->
<!--  offset: Offset,-->
<!--}-->

<!--const props = withDefaults(defineProps<Props>(), {-->
<!--  offset: 0,-->
<!--  bounds: () => ({-->
<!--    min: 0,-->
<!--    max: 0-->
<!--  })-->
<!--})-->

<!--const emit = defineEmits<{-->
<!--  (e: 'update', {progress, offset}: updateEvent): void,-->
<!--  (e: 'next'): void,-->
<!--  (e: 'focusout'): void,-->
<!--}>()-->

<!--const vProgress = ref<HTMLElement>()-->
<!--const vProgressHover = ref<HTMLElement>()-->
<!--const vProgressBar = ref<HTMLElement>()-->

<!--const {motionProperties: progressProperties} = useMotionProperties(vProgress, {scaleX: 0}) as PropertiesKeys-->
<!--const {motionProperties: progressHoverProperties} = useMotionProperties(vProgressHover, {scaleX: 0}) as PropertiesKeys-->
<!--const {motionProperties: progressBarProperties} = useMotionProperties(vProgressBar, {scaleY: 0.5}) as PropertiesKeys-->

<!--const {set: setProgressBar} = useSpring(progressBarProperties, useSpringConfig)-->
<!--const {set: setProgressHover} = useSpring(progressHoverProperties, useSpringConfig)-->

<!--const {offset, bounds} = toRefs<Props>(props)-->
<!--const progress = ref<number>(0)-->

<!--watch(offset, (offsetNum: number) => progress.value = getProgressByOffset(offsetNum, unref(bounds).min))-->
<!--watch(progress, (progressNum: number) => progressProperties.scaleX = progressNum)-->

<!--const update = (offset: number) => emit('update', {progress: unref(progress), offset})-->

<!--const getOffsetByProgress = (x: Offset) => {-->
<!--  const {clientWidth} = unrefElement(props.layout)-->
<!--  const {scrollWidth} = unrefElement(props.track)-->
<!--  const {clientWidth: progressWidth} = unref(vProgress)-->
<!--  const progressPercentage = (x / progressWidth) * 100-->
<!--  const offsetX = -(progressPercentage * (scrollWidth - clientWidth)) / 100-->
<!--  const {min, max} = unref(bounds)-->
<!--  return clamp(min, max, offsetX)-->
<!--}-->

<!--const getProgressByOffset = (current: Offset, end: Offset) => {-->
<!--  const {floor} = Math-->
<!--  const scrollPosition = floor(end - current)-->
<!--  const scrollPercent = (1 - scrollPosition / end)-->
<!--  return clamp(0, 1, scrollPercent)-->
<!--}-->

<!--const getProgressRelativeToPointer = (event: PointerEvent) => {-->
<!--  const progressBar = unref(vProgressBar)-->
<!--  const {left, width} = rect(progressBar)-->
<!--  const {clientX} = event-->
<!--  return (clientX - left) / width-->
<!--}-->

<!--const onProgressHover = ({hovering}: GestureState<'hover' & any>) => {-->
<!--  return Boolean(hovering)-->
<!--      ? setProgressBar({scaleY: 1})-->
<!--      : setProgressBar({scaleY: 0.5})-->
<!--}-->

<!--const onProgressMove = ({event}: GestureState<'move' & any>) => {-->
<!--  const scaleX = getProgressRelativeToPointer(event)-->
<!--  setProgressHover({scaleX})-->
<!--}-->

<!--const onProgressMoveEnd = ({hovering}: GestureState<'move' & any>) => {-->
<!--  if (hovering) return-->
<!--  setProgressHover({scaleX: 0})-->
<!--}-->

<!--const onProgressDrag = ({offset: [x], dragging, active, ...state}: GestureState<'drag' & any>) => {-->
<!--  if (!dragging) return-->
<!--  if (active) return onProgressDragActive(state)-->
<!--  const offsetX = getOffsetByProgress(x)-->
<!--  update(offsetX)-->
<!--}-->

<!--const onProgressDragActive = ({values: [valueX]}: GestureState<'drag'>) => {-->
<!--  const {left} = rect(unref(vProgressBar))-->
<!--  const x = valueX - left-->
<!--  const offsetX = getOffsetByProgress(x)-->
<!--  update(offsetX)-->
<!--}-->

<!--useGesture({-->
<!--  onDrag: (state) => onProgressDrag(state),-->
<!--  onMove: (state) => onProgressMove(state),-->
<!--  onMoveEnd: (state) => onProgressMoveEnd(state),-->
<!--  onHover: (state) => onProgressHover(state),-->
<!--}, {domTarget: vProgressBar})-->


<!--const componentID: string = nanoid()-->

<!--const progressNumber = eagerComputed<number>(() => Math.round(progress.value * 100))-->
<!--const progressPercentage = eagerComputed<string>(() => `${progressNumber.value}%`)-->

<!--const scrollReachedEnd = computed<boolean>(() => unref(offset) <= unref(bounds).min)-->
<!--const scrollReachedStart = computed<boolean>(() => unref(offset) >= unref(bounds).max)-->
<!--</script>-->

<!--<template>-->
<!--  <div ref="vProgressBar"-->
<!--       :aria-labelledby="componentID"-->
<!--       :aria-valuemax="100"-->
<!--       :aria-valuemin="0"-->
<!--       :aria-valuenow="progressNumber"-->
<!--       aria-role="slider progressbar"-->
<!--       class="v-slider-progress-bar"-->
<!--       tabindex="0">-->
<!--    <span ref="vProgress" class="v-slider-progress-bar-increase"/>-->
<!--    <span ref="vProgressHover" class="v-slider-progress-bar-hover"/>-->
<!--    <span :id="componentID" aria-hidden="true" class="sr-only" v-html="progressPercentage"/>-->
<!--  </div>-->
<!--</template>-->

<!--<style lang="scss" scoped>-->

<!--.sr-only {-->
<!--  position: absolute;-->
<!--  width: 1px;-->
<!--  height: 1px;-->
<!--  padding: 0;-->
<!--  margin: -1px;-->
<!--  overflow: hidden;-->
<!--  clip: rect(0, 0, 0, 0);-->
<!--  white-space: nowrap;-->
<!--  border: 0;-->
<!--}-->

<!--.v-slider-progress-bar {-->
<!--  -webkit-appearance: none;-->
<!--  appearance: none;-->
<!--  background: #F5F5F5;-->
<!--  border-radius: 6px;-->
<!--  overflow: hidden;-->
<!--  position: relative;-->
<!--  text-align: center;-->
<!--  height: 16px;-->
<!--  cursor: pointer;-->
<!--  width: 100%;-->

<!--  &:focus-visible {-->
<!--    outline: none;-->
<!--    border: none;-->
<!--  }-->

<!--  .v-slider-progress-bar-increase {-->
<!--    background-color: #3067e7;-->
<!--    position: absolute;-->
<!--    top: 0;-->
<!--    bottom: 0;-->
<!--    left: 0;-->
<!--    right: 0;-->

<!--    @supports (inset: 0) {-->
<!--      inset: 0;-->
<!--    }-->

<!--    z-index: 1;-->
<!--    opacity: 1;-->
<!--    height: 100%;-->
<!--    transform-origin: left;-->
<!--    transform: scaleX(0);-->
<!--  }-->

<!--  .v-slider-progress-bar-hover {-->
<!--    position: absolute;-->
<!--    left: 0;-->
<!--    width: 100%;-->
<!--    height: 100%;-->
<!--    bottom: 0;-->
<!--    background-color: lightgrey;-->
<!--    z-index: 2;-->
<!--    opacity: 0.25;-->
<!--    mix-blend-mode: luminosity;-->
<!--    transform: scaleX(0);-->
<!--    transform-origin: left;-->
<!--    pointer-events: none;-->
<!--  }-->
<!--}-->
<!--</style>-->