import {ref, unref} from "vue";
import {slugify} from "@vueuse/motion";
import {MaybeElementRef, useCssVar} from "@vueuse/core";

export interface GridOptions {
    rows?: number
    columns?: number
    gap?: number
}

export interface Options {
    sticky?: boolean
    grid?: GridOptions
    _internals?: {
        width?: string
    }
}

export type Convertable = 'rows' | 'columns' | 'gap' | 'width'

export enum OptionKeys {
    Internals = 'internals',
    Grid = 'grid'
}

type Ignorable = number | 'revert' | 'initial' | 'inherit' | 'auto'

const convert = (value: number) => (value !== Infinity) ? `${value}px` : value

export function useGridProperties(
    target: MaybeElementRef,
    options: Options,
    convertKeys: Convertable[] = ['gap'],
    ignoreValues: Ignorable[] = ['auto', 'initial', 'inherit', 'revert']
) {
    const targetElementRef = ref(target)
    return Object.keys(unref(options)).forEach(option => {
        if (option !== OptionKeys.Grid) return
        Object.keys(unref(options)[option]).map(key => {
            const propertyName = `--${slugify(`${option}-${key}`)}`
            const propertyVar = useCssVar(propertyName, targetElementRef)
            const propertyValue = unref(options)[option][key]
            const needsConvert = (
                typeof propertyValue === 'number'
                && convertKeys.includes(<Convertable>(key))
                && !ignoreValues.includes(<Ignorable>propertyValue)
            )
            propertyVar.value = needsConvert
                ? convert(propertyValue)
                : propertyValue
        })
    })
}