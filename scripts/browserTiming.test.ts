import { expect, it } from "vitest";

import { browserTiming } from "./browserTiming.ts";

it("counts nested tests, skipped cells and retry cost without confusing aggregate time with wall time", () => {
  const timing = browserTiming({
    stats: { duration: 20, expected: 1, unexpected: 0, flaky: 1, skipped: 1 },
    suites: [
      {
        suites: [
          {
            specs: [
              {
                file: "e2e\\deck.spec.ts",
                title: "exchange",
                tests: [
                  {
                    projectName: "chromium",
                    status: "flaky",
                    results: [
                      { duration: 12, retry: 0, status: "failed" },
                      { duration: 10, retry: 1, status: "passed" },
                    ],
                  },
                  {
                    projectName: "webkit",
                    status: "skipped",
                    results: [{ duration: 0, retry: 0, status: "skipped" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(timing.wallMilliseconds).toBe(20);
  expect(timing.tests[0]).toMatchObject({ milliseconds: 22, retries: 1, spec: "e2e/deck.spec.ts" });
  expect(timing.projects).toEqual([
    { project: "chromium", tests: 1, milliseconds: 22 },
    { project: "webkit", tests: 1, milliseconds: 0 },
  ]);
  expect(timing.outcomes.skipped).toBe(1);
});
