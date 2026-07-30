import {
  MediaGalleryDialog,
  createEnglishMediaGalleryMessages,
} from "@snap-motion/vue/media-gallery";

const messages = createEnglishMediaGalleryMessages();

if (
  typeof MediaGalleryDialog !== "object" ||
  messages.closeGallery !== "Close gallery" ||
  typeof messages.currentItem !== "function"
) {
  throw new Error("Packed media-gallery subpath failed a gallery-only Node ESM import.");
}

process.stdout.write("Packed media-gallery-only Node ESM import passed.\n");
