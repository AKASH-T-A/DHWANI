import type { NeedEstimate } from '../types/dhwani';

export function NeedScoreBreakdown({
  needEstimate,
  overriddenScore,
  overrideReason,
  confidence,
  humanReviewThreshold = 0.72,
  missingInformation,
}: {
  needEstimate: NeedEstimate;
  overriddenScore?: number;
  overrideReason?: string;
  confidence?: number;
  humanReviewThreshold?: number;
  missingInformation?: string[];
}) {
  const maxAbs = Math.max(35, ...needEstimate.factors.map((f) => Math.abs(f.points)));
  const needsHumanReview = confidence !== undefined && confidence < humanReviewThreshold;

  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#182336]">
        <div>
          <h3 className="text-base font-semibold text-[#E6EDF7]">
            Glass-Box Priority Score Breakdown
          </h3>
          <p className="mt-1 text-xs text-[#8B9BB4]">
            Every point is traceable to extracted urgency, vulnerable persons, sensor corroboration, or reporting-bias correction.
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-3xl font-semibold tabular-nums text-[#E6EDF7]">
            {needEstimate.finalNeedScore}
            <span className="text-sm text-[#6B7E9B]">/100</span>
          </div>
          <div className="text-xs text-[#8B9BB4] font-mono tabular-nums">
            {overriddenScore !== undefined
              ? 'Coordinator Override Active'
              : `Uncertainty ±${needEstimate.uncertaintyMargin.toFixed(1)}`}
          </div>
          {confidence !== undefined && (
            <div
              className={`mt-1 text-[11px] font-mono tabular-nums ${
                needsHumanReview ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              Calibrated Confidence {Math.round(confidence * 100)}%
              {needsHumanReview ? ' · Human Review Required' : ' · Above Review Threshold'}
            </div>
          )}
        </div>
      </div>

      {overrideReason && (
        <div className="mt-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          <span className="font-semibold">Human Coordinator Override:</span> {overrideReason}
        </div>
      )}

      {/* Factor Waterfall Rows */}
      <div className="mt-4 space-y-3">
        {needEstimate.factors.map((factor) => {
          const isPositive = factor.points >= 0;
          const widthPct = Math.min(100, Math.round((Math.abs(factor.points) / maxAbs) * 100));
          const barTone = !isPositive
            ? 'bg-red-500/80'
            : factor.category === 'bias-correction'
              ? 'bg-cyan-500'
              : factor.category === 'vulnerability'
                ? 'bg-amber-500'
                : factor.category === 'hazard-sensor'
                  ? 'bg-sky-500'
                  : 'bg-orange-500';

          return (
            <div key={factor.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="font-medium text-[#E6EDF7]">{factor.label}</div>
                <div
                  className={`font-mono font-semibold tabular-nums ${
                    isPositive ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {isPositive ? `+${factor.points}` : factor.points} pts
                </div>
              </div>
              <div className="w-full h-2 bg-[#162133] rounded-sm overflow-hidden">
                <div className={`h-full ${barTone}`} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="text-[11.5px] text-[#8B9BB4]">{factor.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Missing Evidence & Counterfactual Explanation */}
      <div className="mt-5 pt-4 border-t border-[#182336] space-y-3">
        {missingInformation && (
          <div>
            <div className="text-xs font-medium text-amber-400">
              Missing Information Affecting Uncertainty
            </div>
            {missingInformation.length === 0 ? (
              <p className="mt-1 text-xs text-emerald-400">
                All key triage fields verified — no critical evidence gaps remaining.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-[#CBD5E1] list-disc list-inside">
                {missingInformation.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-cyan-400">What would change this priority?</div>
          <p className="mt-1 text-xs text-[#CBD5E1] leading-relaxed">
            “{needEstimate.counterfactualNote}”
          </p>
        </div>
      </div>
    </div>
  );
}
