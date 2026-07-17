<script lang="ts" setup>
import {computed, nextTick, onMounted, reactive, ref, unref, watch, watchPostEffect} from "vue"
import {clamp, DragOptions, snap, useSpringConfig, WheelOptions} from "./index"
import {eagerComputed, unrefElement, useCssVar, useIntersectionObserver, useMounted, useResizeObserver, useTimeoutFn, whenever} from "@vueuse/core"
import {AnyGestureEventTypes, DistanceAngleBounds, GenericOptions, GestureState, SharedGestureState, useGesture} from "@vueuse/gesture"
import {PropertiesKeys, slugify, useMotionProperties, useSpring} from "@vueuse/motion"
import {GridOptions, Options} from "../../composables/useGridProperties";
import Wrapper from "./VSlidesWrapper.vue"
import Grid from "./VSlidesGrid.vue"
import Paginator from "./VSlidesPaginator.vue"
import {mergeWith} from "lodash";
import {round} from "../../utils/math";

const isMounted = useMounted()

const {options, ...props} = defineProps<{ items: any[], options?: { mode: 'fixed' | 'free'; grid: GridOptions } }>()

const items = ref(props.items)
const track = ref<HTMLElement>()

const wrapper = ref<InstanceType<typeof Wrapper>>()

const grid = ref<InstanceType<typeof Grid>>()

const elements = computed(() => {
  const container: HTMLElement = unrefElement(grid)
  if (!container) return []
  const itemsNodeList: NodeListOf<HTMLElement> = container.querySelectorAll('[data-index]')
  return itemsNodeList?.length ? Array.from(itemsNodeList) : []
})

// Process Options and set defaults
// If mode is 'free' then we need to set grid.columns to 'auto'.
// If mode is 'fixed' then we need to set grid.columns to a number (default 2).
const defaults = reactive({
  sticky: false,
  grid: {
    rows: 1,
    columns: 1,
    gap: 1,
  },
})


const getItemWidth = (options: Options, roundBy: number = 1) => {
  const {gap, columns} = unref(options).grid
  const {clientWidth} = unrefElement(wrapper)
  return round((clientWidth - (gap * columns - 1)) / columns, roundBy)
}

const setInternals = (options: Options) => ({
  ...options,
  internals: {width: `${getItemWidth(options)}px`}
})

const getCurrentOptions = () => unrefElement(wrapper)
    ? setInternals(mergeWith(defaults, options))
    : defaults

const currentOptions = eagerComputed(getCurrentOptions)


onMounted(() => {
  const {internals} = setInternals(unref(currentOptions))
  setItemWidthProperties(internals)
  setBounds()
})


const anchorOffset = reactive<{ index: number; offset: number }>({
  index: 0,
  offset: 0
})

const setAnchorOffset = ({index, offset}) => {
  Object.assign(anchorOffset, {index, offset})
}


useResizeObserver(wrapper, (() => {
  if (unref(options).mode !== 'fixed') return
  const {internals} = setInternals(unref(currentOptions))
  setItemWidthProperties(internals)
  nextTick(() => {
    // //  -- not working --
    // // Recalculate current offset and set bounds
    const closestOffsetLeft = getClosestOffsetLeft()
    trackProperties.x = -closestOffsetLeft
    console.log(-closestOffsetLeft)

    // const clampedX = getClampedX(offsetX.value)
    // trackProperties.x = clampedX
    // setSharedOffsetX(clampedX)
    setBounds()
  })
}))

const runawayItems = computed(() => {
  if (!unref(wrapper)) return []
  const {clientWidth, scrollWidth} = unrefElement(wrapper)
  console.log(clientWidth, scrollWidth)
  const x = unref(trackProperties).x


})

const getClosestOffsetLeft = () => {
  const activeElement = unref(elements).find(el => el.dataset.intersecting === 'true') as HTMLElement
  const activeElementOffset = activeElement?.offsetLeft || 0
  const activeElementOffsetWithGap = activeElementOffset - (unref(options).grid.gap / 2)
  return activeElementOffset === 0 ? 0 : activeElementOffset
}

const setItemWidthProperties = (internals: { width: string }) => Object.keys(internals).map((key, i) => {
  const internalPropertyName = Object.keys(internals)[i]
  const prefix = 'grid-item'
  const propertyName = `--${prefix}-${slugify(`${internalPropertyName}`)}`
  const propertyVar = useCssVar(propertyName, grid)
  propertyVar.value = internals[key]
  return {[propertyName]: internals[key]}
})

const {motionProperties: trackProperties} = useMotionProperties(track, {
  x: 0,
  cursor: 'grab',
}) as PropertiesKeys

const dragOptions: DragOptions = {rubberband: true}

const wheelOptions: WheelOptions = {rubberband: false}

const genericOptions: GenericOptions & DragOptions | & WheelOptions = {
  domTarget: track,
  eventOptions: {passive: true},
}

const config = {
  drag: dragOptions,
  wheel: wheelOptions,
  ...genericOptions,
}

const {set, values, stop} = useSpring(trackProperties, useSpringConfig)

const offsetX = computed({
  get: () => trackProperties.x ?? 0 as number,
  set: (x: number) => set({x}),
})

watch(offsetX, (x: number) => setSharedOffsetX(x))

const getClampedX = (x: number) => clamp(bounds.min, bounds.max, x)

const itemsOpposite = computed(() => {
  ///
})

const getClosestOffset = () => {
  if (!isMounted) return
  const getOffsets = el => -Number(el.offsetLeft)
  const offsets = [...new Set(unref(elements).map(getOffsets))]
  return snap(offsets)(offsetX.value)
}

const closestOffset = computed(getClosestOffset)
const closestElement = computed(() => unref(elements).find(el => Number(el.offsetLeft) === closestOffset.value))
watch(closestElement, (el: HTMLElement) => {
  if (!el) return
  console.log(el)
})

const onDrag = ({offset: [x]}: GestureState<'drag'> & SharedGestureState) => {
  offsetX.value = x
}

const onWheel = ({event}: { event: WheelEvent } & GestureState<'wheel'> & SharedGestureState) => {
  const {deltaX}: WheelEvent = event
  offsetX.value = getClampedX(offsetX.value - (deltaX * 6))
}

const onPointerDown = () => set({cursor: 'grabbing'})

const onPointerUp = () => set({cursor: 'grab'})

const trackController = useGesture({onDrag, onWheel, onPointerDown, onPointerUp} as AnyGestureEventTypes, config)


// ... BOUNDS ...
const bounds = reactive<DistanceAngleBounds>({min: 0, max: 0})
const getBounds = () => {
  const {scrollWidth, clientWidth} = unrefElement(wrapper)
  return {min: -(scrollWidth - clientWidth), max: 0}
}
const setBounds = () => Object.assign(bounds, getBounds())
const setSharedBounds = ({min, max}: DistanceAngleBounds) => {
  const gestures: string[] = Object.keys(trackController.handlers)
  const setGestureBounds = gesture => trackController.config[gesture].bounds = [[min, max], [0, 0]]
  gestures.forEach(setGestureBounds)
}
watch(bounds, ({min, max}: DistanceAngleBounds) => setSharedBounds({min, max}))
const stopWatcher = watchPostEffect(() => {
  setBounds()
  stopWatcher()
})
// ... END OF BOUNDS ...

const setSharedOffsetX = (x: number) => {
  const gestures: string[] = Object.keys(trackController.handlers)
  const setGestureOffset = gesture => trackController.state[gesture].offset = [x, 0]
  gestures.forEach(setGestureOffset)
}

const scrollToAndFocusElement = (index: number) => {
  const target = unref(elements)[index + 1] || unref(elements)[index] as HTMLElement
  const targetComponent = target.firstElementChild as HTMLElement
  useTimeoutFn(() => targetComponent.focus(), 100)
  const {gap} = unref(options).grid
  // offsetX.value = getClampedX(-target.offsetLeft + (gap / 2))
  offsetX.value = getClampedX(-target.offsetLeft)
}

const startIntersectionObservers = () => unref(elements).map(element => useIntersectionObserver(element, entries => {
  const [entry] = entries, {isIntersecting} = entry
  const {index} = element.dataset
  if (entry.isIntersecting) {
    if (entry.intersectionRatio >= 0.75) {
      console.log('intersecting', index)
      entry.target.setAttribute('data-intersecting', !!isIntersecting ? 'true' : 'false')
      entry.target.firstElementChild.setAttribute('tabindex', !!isIntersecting ? '0' : '-1')
    }
  }
},{
  rootMargin: '0px',

}))


whenever(elements, startIntersectionObservers)

watch(props.items, () => isMounted && setBounds(), {flush: 'post'})

const animationFinished = ref<boolean>(false)

const onAnimationend = (finished: boolean) => animationFinished.value = finished

const onPaginate = (x: number) => offsetX.value = x

const getScrollPercentage = () => {
  const {min, max} = bounds, {floor} = Math, {x} = trackProperties
  const currentOffsetXInPercent = (x - min) / (max - min)
  return (100 - floor(currentOffsetXInPercent * 100))
}

const scrollPercentage = computed(() => clamp(0, 100, getScrollPercentage()))

const getOffsetByScrollPercentage = () => {
  const {min, max} = bounds, {floor} = Math, {x} = trackProperties
  const currentOffsetXInPercent = (x - min) / (max - min)
  return min + (max - min) * currentOffsetXInPercent
}

const deducedOffset = computed(getOffsetByScrollPercentage)

const ariaAttributes = computed(() => ({
  'aria-valuemin': bounds.min,
  'aria-valuemax': bounds.max,
  'aria-valuenow': Math.round(offsetX.value),
}))


</script>

<template>
  <p>original offset : {{ offsetX }}</p>
  <p>deduced offset : {{ deducedOffset }}</p>
  <p>closest offset : {{ closestOffset }}</p>
  <p>scroll percentage : {{ scrollPercentage }}</p>
  <pre>{{ anchorOffset }}</pre>
  {{ closestElement }}
  <Wrapper ref="wrapper"
           v-slot="{width, hovered, focused}">
    <div ref="track"
         class="v-slides-track"
         v-bind="ariaAttributes">
      <Grid ref="grid"
            :items="items"
            :options="currentOptions"
            v-on:animationend="onAnimationend"
            v-on:paginate="scrollToAndFocusElement"/>
    </div>
    <Paginator
        v-if="animationFinished"
        :bounds="bounds"
        :elements="elements"
        :options="currentOptions"
        :width="width"
        :x="offsetX"
        v-on:paginate="onPaginate"/>
  </Wrapper>
</template>

<style lang="scss">
.v-slides-track {
  position: relative;
  width: max-content;
}
</style>