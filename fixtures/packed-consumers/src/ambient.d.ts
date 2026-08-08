/**
 * The package's stylesheet is a side-effect import with no type of its own, which is what every
 * consumer declares locally. It is here so the SFC type-check sees the same application entry a
 * real consumer compiles, rather than a trimmed-down one.
 */
declare module "@snap-motion/vue/style.css";
