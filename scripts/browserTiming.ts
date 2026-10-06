export interface ReportSuite {
  readonly suites?: readonly ReportSuite[];
  readonly specs?: readonly {
    readonly file: string;
    readonly title: string;
    readonly tests: readonly {
      readonly projectName: string;
      readonly status: string;
      readonly results: readonly {
        readonly duration: number;
        readonly retry: number;
        readonly status: string;
      }[];
    }[];
  }[];
}

export interface BrowserReport {
  readonly suites: readonly ReportSuite[];
  readonly stats: {
    readonly duration: number;
    readonly expected: number;
    readonly unexpected: number;
    readonly flaky: number;
    readonly skipped: number;
  };
}

export function browserTiming(report: BrowserReport) {
  const tests: {
    project: string;
    spec: string;
    title: string;
    milliseconds: number;
    status: string;
    retries: number;
  }[] = [];
  function visit(suite: ReportSuite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        tests.push({
          project: test.projectName,
          spec: spec.file.replaceAll("\\", "/"),
          title: spec.title,
          milliseconds: test.results.reduce((sum, result) => sum + result.duration, 0),
          status: test.status,
          retries: test.results.filter((result) => result.retry > 0).length,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  const specs = new Map<
    string,
    { project: string; spec: string; tests: number; milliseconds: number }
  >();
  const projects = new Map<string, { project: string; tests: number; milliseconds: number }>();
  for (const test of tests) {
    const key = `${test.project}:${test.spec}`;
    const spec = specs.get(key) ?? {
      project: test.project,
      spec: test.spec,
      tests: 0,
      milliseconds: 0,
    };
    spec.tests++;
    spec.milliseconds += test.milliseconds;
    specs.set(key, spec);
    const project = projects.get(test.project) ?? {
      project: test.project,
      tests: 0,
      milliseconds: 0,
    };
    project.tests++;
    project.milliseconds += test.milliseconds;
    projects.set(test.project, project);
  }
  return {
    schemaVersion: 1,
    wallMilliseconds: report.stats.duration,
    outcomes: report.stats,
    projects: [...projects.values()],
    specs: [...specs.values()].toSorted((a, b) => b.milliseconds - a.milliseconds),
    top20: tests.toSorted((a, b) => b.milliseconds - a.milliseconds).slice(0, 20),
    tests,
  };
}
