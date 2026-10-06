import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [runId, output] = process.argv.slice(2);
if (!runId || !/^\d+$/.test(runId) || !output)
  throw new Error("Usage: node scripts/reportCiTiming.ts <run-id> <output.json>");
const prefix = `repos/maikeleckelboom/snap-motion/actions/runs/${runId}`;
function query<T>(path: string): T {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" })) as T;
}
const run = query<{ head_sha: string; run_attempt: number; conclusion: string; html_url: string }>(
  prefix,
);
interface Job {
  name: string;
  started_at: string;
  completed_at: string | null;
  conclusion: string | null;
  steps: {
    name: string;
    started_at: string;
    completed_at: string | null;
    conclusion: string | null;
  }[];
}
const jobs = query<{ jobs: Job[] }>(`${prefix}/attempts/${run.run_attempt}/jobs?per_page=100`).jobs;
const seconds = (start: string, end: string | null) =>
  end ? (Date.parse(end) - Date.parse(start)) / 1000 : null;
const completed = jobs.filter((job) => job.completed_at !== null);
const timing = {
  schemaVersion: 1,
  sourceCommit: run.head_sha,
  runId: Number(runId),
  runAttempt: run.run_attempt,
  url: run.html_url,
  conclusion: run.conclusion,
  wallSeconds:
    completed.length === jobs.length && jobs.length > 0
      ? (Math.max(...completed.map((job) => Date.parse(job.completed_at!))) -
          Math.min(...jobs.map((job) => Date.parse(job.started_at)))) /
        1000
      : null,
  jobs: jobs.map((job) => ({
    name: job.name,
    conclusion: job.conclusion,
    seconds: seconds(job.started_at, job.completed_at),
    steps: job.steps.map((step) => ({
      name: step.name,
      conclusion: step.conclusion,
      seconds: seconds(step.started_at, step.completed_at),
    })),
  })),
};
await writeFile(output, `${JSON.stringify(timing, null, 2)}\n`);
process.stdout.write(
  `CI ${runId} attempt ${run.run_attempt}: ${timing.wallSeconds ?? "incomplete"}s, ${run.conclusion}.\n`,
);
