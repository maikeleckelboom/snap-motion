import {DistanceAngleBounds, DragConfig, InternalDragOptions, UseWheelConfig} from "@vueuse/gesture";
import {clamp as _clamp, snap as _snap} from 'popmotion'
import {Spring} from "@vueuse/motion";
import {nanoid as _nanoid} from "nanoid";

export type DragOptions = InternalDragOptions | & DragConfig
export type WheelOptions = InternalDragOptions | & DragConfig | & UseWheelConfig

export enum Direction { Prev = -1, Next = 1 }

export interface Bounds extends DistanceAngleBounds {
    min: number
}

export const useSpringConfig: Spring = {
    type: 'spring',
    restSpeed: 0.15,
    bounce: 0.1,
    stiffness: 200,
    damping: 20,
    mass: 0.15,
}

export const rect = (element) => element.getBoundingClientRect()

export const clamp = _clamp
export const snap = _snap
export const nanoid = _nanoid
