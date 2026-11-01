'use client';

// The Evals page: run the dataset from the UI and compare runs over time.
// The same runner backs the CLI (`npm run eval`) — one pipeline, two doors.
import { useCallback, useEffect, useState } from 'react';
import { apiGetOrThrow, apiSendOrThrow } from '@/lib/client';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui';
import type { EvalCaseResult, EvalSummary } from '@/lib/types';

interface EvalRun {
  id: string;
  datasetName: string;
  startedAt: string;
  durationMs: number;
  summary: EvalSummary;
  cases: EvalCaseResult[];
}

export default function EvalsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGetOrThrow<{ runs: EvalRun[] }>('/api/evals');
      setRuns(data.runs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      // Slow by design: every case embeds, retrieves, generates and gets
      // judged. That cost is the point — evals are how you pay for changes
      // to prompts/pipelines with confidence instead of vibes.
      await apiSendOrThrow('/api/evals', 'POST', { dataset: 'learning-basics' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const latest = runs[0];

  return (
    <div>
      <PageHeader
        title="Evals"
        lead="A fixed dataset of questions, checked three ways: did retrieval find the right document, does the answer contain required facts, and how does an LLM judge score it against a rubric. Run it, change your prompt or chunking, run it again — that comparison is regression testing for AI."
        files={['src/ai/evals/runner.ts', 'src/ai/evals/judge.ts', 'src/ai/evals/datasets/learning-basics.json']}
      />

      <div className="mb-6 flex items-center gap-3">
        <Button onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run evals'}
        </Button>
        {running && <Spinner label="each case: retrieve → generate → judge (takes a minute or two)" />}
        {!running && runs.length > 0 && (
          <span className="text-xs text-neutral-500">or from the terminal: npm run eval</span>
        )}
      </div>

      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      {loading ? (
        <Spinner label="Loading runs…" />
      ) : runs.length === 0 ? (
        <EmptyState>No eval runs yet. Click &ldquo;Run evals&rdquo; above (requires a configured API key).</EmptyState>
      ) : (
        <div className="space-y-8">
          {latest && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Latest run · {new Date(latest.startedAt).toLocaleString()}
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard
                  label="Judge score"
                  value={latest.summary.avgJudgeScore != null ? `${(latest.summary.avgJudgeScore * 100).toFixed(0)}%` : '—'}
                  hint="LLM-as-judge, rubric per case"
                />
                <SummaryCard
                  label="Retrieval hits"
                  value={latest.summary.retrievalHitRate != null ? `${(latest.summary.retrievalHitRate * 100).toFixed(0)}%` : '—'}
                  hint="right document in top-5 chunks"
                />
                <SummaryCard
                  label="Must-contain"
                  value={latest.summary.mustContainRate != null ? `${(latest.summary.mustContainRate * 100).toFixed(0)}%` : '—'}
                  hint="required substrings present"
                />
                <SummaryCard label="Duration" value={`${(latest.summary.durationMs / 1000).toFixed(1)}s`} hint={`${latest.summary.caseCount} cases`} />
              </div>

              <div className="space-y-3">
                {latest.cases.map((c) => (
                  <CaseCard key={c.id} result={c} />
                ))}
              </div>
            </section>
          )}

          {runs.length > 1 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                History — compare runs to catch regressions
              </h2>
              <div className="overflow-hidden rounded-xl border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/80 text-left text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">When</th>
                      <th className="px-4 py-2 font-medium">Judge</th>
                      <th className="px-4 py-2 font-medium">Retrieval</th>
                      <th className="px-4 py-2 font-medium">Contains</th>
                      <th className="px-4 py-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {runs.map((run) => (
                      <tr key={run.id} className="text-neutral-300">
                        <td className="px-4 py-2">{new Date(run.startedAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{pct(run.summary.avgJudgeScore)}</td>
                        <td className="px-4 py-2">{pct(run.summary.retrievalHitRate)}</td>
                        <td className="px-4 py-2">{pct(run.summary.mustContainRate)}</td>
                        <td className="px-4 py-2">{(run.summary.durationMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-100">{value}</p>
      <p className="mt-1 text-[11px] text-neutral-600">{hint}</p>
    </Card>
  );
}

function CaseCard({ result }: { result: EvalCaseResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-neutral-500">{result.id}</span>
          <span className="text-sm text-neutral-200">{result.question}</span>
        </div>
        <div className="flex items-center gap-2">
          {result.retrievalHit !== null && (
            <Badge tone={result.retrievalHit ? 'green' : 'red'}>
              {result.retrievalHit ? 'retrieval ✓' : 'retrieval ✗'}
            </Badge>
          )}
          {result.mustContainTotal > 0 && (
            <Badge tone={result.mustContainPassed === result.mustContainTotal ? 'green' : 'amber'}>
              contains {result.mustContainPassed}/{result.mustContainTotal}
            </Badge>
          )}
          {result.judgeScore != null ? (
            <Badge tone={result.judgeScore >= 0.8 ? 'green' : result.judgeScore >= 0.5 ? 'amber' : 'red'}>
              judge {(result.judgeScore * 10).toFixed(1)}/10
            </Badge>
          ) : (
            <Badge tone="red">judge failed</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-neutral-800 pt-3">
          {result.error && <ErrorBanner message={result.error} />}
          {result.sources.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {result.sources.map((s, i) => (
                <Badge key={i}>{s.title} · {(s.similarity * 100).toFixed(0)}%</Badge>
              ))}
            </div>
          )}
          {result.judgeRationale && (
            <p className="text-xs leading-relaxed text-neutral-400">
              <span className="font-medium text-neutral-300">Judge: </span>
              {result.judgeRationale}
            </p>
          )}
          <p className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-neutral-300">
            {result.answer}
          </p>
        </div>
      )}
    </Card>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
