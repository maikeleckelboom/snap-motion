import { describe, expect, it } from "vitest";

import {
  coverMediaId,
  galleryMedia,
  studies,
  studyById,
  studyIdOfMedia,
} from "../src/playground/studio/catalog";
import {
  initialActiveStudyId,
  initialComparisonIds,
  studyCategories,
  studyDefinitions,
  studyMediaKinds,
} from "../src/playground/studio/studies";
import { MAX_COMPARISON } from "../src/playground/studio/studio-model";

describe("Motion Studio catalog identity", () => {
  it("has unique, canonical study IDs and one entry per definition", () => {
    const ids = studies.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(studyDefinitions.map(({ id }) => id));
    for (const id of ids) expect(id).toBe(id.trim());
    expect(studyById.size).toBe(ids.length);
  });

  it("is large enough to demonstrate pagination, spatial navigation and comparison", () => {
    expect(studies.length).toBeGreaterThanOrEqual(MAX_COMPARISON + 4);
    // Four comfortable columns-by-rows pages and a rail with neighbours on both sides.
    expect(Math.ceil(studies.length / 4)).toBeGreaterThanOrEqual(3);
  });

  it("gives every study a category from the list and complete, non-empty descriptions", () => {
    const categories = new Set<string>(studyCategories.map(({ id }) => id));
    for (const study of studies) {
      expect(categories.has(study.category)).toBe(true);
      expect(study.name).not.toBe("");
      expect(study.summary.length).toBeGreaterThan(20);
      expect(study.attributes.length).toBeGreaterThanOrEqual(3);
      expect(study.tone).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const { id } of studyCategories) {
      expect(studies.some((study) => study.category === id)).toBe(true);
    }
  });

  it("ships the same three plates for every study, cover first", () => {
    for (const study of studies) {
      expect(study.media.map(({ kind }) => kind)).toEqual([...studyMediaKinds]);
      expect(study.cover).toBe(study.media[0]);
      for (const media of study.media) {
        expect(media.studyId).toBe(study.id);
        expect(media.id).toBe(`${study.id}/${media.kind}`);
      }
    }
  });

  it("builds a Gallery list that satisfies the Gallery's identity contract", () => {
    const mediaIds = galleryMedia.map(({ id }) => id);
    expect(mediaIds).toHaveLength(studies.length * studyMediaKinds.length);
    expect(new Set(mediaIds).size).toBe(mediaIds.length);
    for (const media of galleryMedia) {
      expect(media.id).toBe(media.id.trim());
      expect(media.title).not.toBe("");
      expect(media.alt.length).toBeGreaterThan(10);
      for (const source of [media.preview, media.full]) {
        expect(source.src).toBe(source.src.trim());
        // A hashed file in the build; the test transform inlines the same SVG as a data URL.
        expect(source.src).toMatch(/\.svg$|^data:image\/svg\+xml/);
        expect(source.width).toBeGreaterThan(0);
        expect(source.height).toBeGreaterThan(0);
      }
    }
    // Distinct assets: no two plates share a URL, so none can be mistaken for another.
    expect(new Set(galleryMedia.map(({ preview }) => preview.src)).size).toBe(galleryMedia.length);
  });

  it("maps every plate back to its study, and refuses an unknown one", () => {
    for (const media of galleryMedia) expect(studyIdOfMedia(media.id)).toBe(media.studyId);
    expect(studyIdOfMedia("nope/cover")).toBeUndefined();
    expect(studyIdOfMedia(undefined)).toBeUndefined();
    for (const study of studies) expect(coverMediaId(study.id)).toBe(`${study.id}/cover`);
  });

  it("starts from a real study and a comparison of real, distinct studies", () => {
    expect(studyById.has(initialActiveStudyId)).toBe(true);
    expect(new Set(initialComparisonIds).size).toBe(initialComparisonIds.length);
    for (const id of initialComparisonIds) expect(studyById.has(id)).toBe(true);
    expect(initialComparisonIds.length).toBeLessThanOrEqual(MAX_COMPARISON);
  });
});
