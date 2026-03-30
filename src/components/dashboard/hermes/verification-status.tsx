"use client";

export function VerificationStatus({
  checked,
  passed,
  failed,
  skipped,
  violations,
}: {
  checked: number;
  passed: number;
  failed: number;
  skipped: number;
  violations: { memoryContent: string; detail: string }[];
}) {
  const passRate = checked > 0 ? Math.round((passed / checked) * 100) : 0;
  const coverage = checked + skipped > 0
    ? Math.round((checked / (checked + skipped)) * 100)
    : 0;

  const hasData = checked > 0 || skipped > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Verification Status
      </h3>

      {!hasData && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No verification sweeps recorded yet.
        </p>
      )}

      {hasData && (
        <>
          <div className="mt-4 flex items-center gap-6">
            {/* Pass rate */}
            <div className="text-center">
              <div className={`text-3xl font-bold ${failed > 0 ? "text-red-400" : "text-green-400"}`}>
                {passRate}%
              </div>
              <div className="text-[10px] text-muted-foreground">Pass Rate</div>
            </div>

            {/* Mini stats */}
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Checked</span>
                <span className="text-foreground">{checked}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-green-400/80">Passed</span>
                <span className="text-foreground">{passed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-red-400/80">Failed</span>
                <span className="text-foreground">{failed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">No verify</span>
                <span className="text-foreground">{skipped}</span>
              </div>
            </div>
          </div>

          {/* Coverage bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Verify coverage</span>
              <span>{coverage}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500/60"
                style={{ width: `${coverage}%` }}
              />
            </div>
          </div>

          {/* Violations */}
          {violations.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-red-400/80 mb-1.5">Recent violations</div>
              <div className="space-y-1">
                {violations.map((v, i) => (
                  <div key={i} className="rounded bg-red-500/5 border border-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300/80">
                    {v.detail.slice(0, 100)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
