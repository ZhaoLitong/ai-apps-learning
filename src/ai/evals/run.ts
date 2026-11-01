// CLI entry for evals: `npm run eval`
// Loads .env (Next.js does this automatically for API routes; scripts must
// do it themselves), runs the dataset, prints a summary.
import 'dotenv/config';
import { runEvals } from './runner';

const dataset = process.argv[2] ?? 'learning-basics';

console.log(`Running eval dataset "${dataset}"…\n`);

runEvals(dataset)
  .then((run) => {
    console.log('\n── Summary ──────────────────────────────');
    console.log(`  cases:          ${run.summary.caseCount}`);
    console.log(`  judge score:    ${run.summary.avgJudgeScore != null ? `${(run.summary.avgJudgeScore * 100).toFixed(0)}%` : 'n/a'}`);
    console.log(`  retrieval hits: ${run.summary.retrievalHitRate != null ? `${(run.summary.retrievalHitRate * 100).toFixed(0)}%` : 'n/a'}`);
    console.log(`  must-contain:   ${run.summary.mustContainRate != null ? `${(run.summary.mustContainRate * 100).toFixed(0)}%` : 'n/a'}`);
    console.log(`  duration:       ${(run.summary.durationMs / 1000).toFixed(1)}s`);
    console.log(`\nStored as run ${run.id} — compare runs on the /evals page.`);
  })
  .catch((error) => {
    console.error('\nEval run failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
