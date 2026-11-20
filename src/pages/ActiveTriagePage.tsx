import { useEffect, useState } from 'react';
import { CheckCircle2, MessageSquareReply, Send } from 'lucide-react';
import { ConfidenceIndicator, LanguageBadge } from '../components/CommonWidgets';
import { FollowUpComposer } from '../components/FollowUpComposer';
import { VoiceDictationPanel } from '../components/VoiceDictationPanel';
import { useDhwani } from '../store/DhwaniContext';
import type { SupportedLanguage } from '../types/dhwani';

const STATUS_STEPS = [
  'Draft',
  'Sent',
  'Delivered (simulated)',
  'Awaiting response',
  'Answer received (simulated)',
  'Information updated',
] as const;

export function ActiveTriagePage() {
  const {
    incidents,
    followUps,
    selectedIncidentId,
    setSelectedIncidentId,
    systemStatus,
    canEditTriage,
    addIncidentFromIntake,
    appendFieldVoiceUpdate,
    createAndSendFollowUp,
    sendDraftFollowUp,
    simulateFollowUpResponse,
    openIncidentDetail,
  } = useDhwani();

  const [injectedDraft, setInjectedDraft] = useState<{
    text: string;
    language: SupportedLanguage;
    nonce: number;
  } | null>(null);

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) ??
    incidents.find((i) => i.missingInformation.length > 0) ??
    incidents[0];

  // Prevent a voice draft from leaking across incidents when switching selection
  useEffect(() => {
    setInjectedDraft(null);
  }, [selectedIncident?.id]);

  const incidentFollowUps = followUps.filter((f) => f.incidentId === selectedIncident?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            ACTIVE TRIAGE · AI THAT ASKS BACK & VOICE FIELD DICTATION
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7]">
            High-Value Follow-Up & Voice-to-Text Triage Engine
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
            Field workers can dictate rapid voice incident reports hands-free, and DHWANI selects the single shortest follow-up question with maximum information gain to update incident confidence and priority.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-[#8B9BB4]">Target Incident:</label>
          <select
            value={selectedIncident?.id ?? ''}
            onChange={(e) => setSelectedIncidentId(e.target.value)}
            className="px-3 py-2 text-xs bg-[#0F1623] border border-[#243652] rounded-md text-[#E6EDF7] font-mono max-w-[300px]"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id} ({inc.missingInformation.length} missing) — {inc.location.placeName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hands-Free Field Worker Voice-to-Text Dictation */}
      <VoiceDictationPanel
        selectedIncident={selectedIncident}
        networkTier={systemStatus.networkTier}
        humanReviewThreshold={systemStatus.humanReviewThreshold}
        onCreateNewIncident={addIncidentFromIntake}
        onAppendToIncident={appendFieldVoiceUpdate}
        onInsertIntoFollowUp={(text, language) =>
          setInjectedDraft({ text, language, nonce: Date.now() })
        }
        onOpenIncident={(id) => openIncidentDetail(id, 'incident-intelligence')}
      />

      {selectedIncident && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left: Selected Incident & Missing Information Panel */}
          <div className="xl:col-span-5 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#182336]">
              <div>
                <div className="text-xs font-mono text-[#8B9BB4]">
                  {selectedIncident.id} · {selectedIncident.location.placeName}
                </div>
                <h2 className="mt-0.5 text-base font-semibold text-[#E6EDF7]">
                  {selectedIncident.title}
                </h2>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-semibold text-orange-400 tabular-nums">
                  {selectedIncident.needEstimate.finalNeedScore}/100
                </div>
                <div className="text-[11px] text-[#6B7E9B]">Need Score</div>
              </div>
            </div>

            <div className="p-3 rounded bg-[#090E17] border border-[#182336] text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[#6B7E9B] font-mono">Initial Message</span>
                <LanguageBadge language={selectedIncident.language} />
              </div>
              <p className="text-[#E6EDF7]">“{selectedIncident.originalMessage}”</p>
              <p className="text-[#8B9BB4]">{selectedIncident.processedMessage}</p>
            </div>

            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-[#8B9BB4]">Current Extraction Confidence</span>
              <ConfidenceIndicator
                confidence={selectedIncident.confidence}
                threshold={systemStatus.humanReviewThreshold}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-300 mb-2">
                Missing Information ({selectedIncident.missingInformation.length})
              </div>
              {selectedIncident.missingInformation.length === 0 ? (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  All key triage fields resolved for this incident.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {selectedIncident.missingInformation.map((field) => (
                    <li
                      key={field}
                      className="px-3 py-2 rounded bg-[#0B121F] border border-[#182336] text-xs text-[#CBD5E1]"
                    >
                      {field}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() => openIncidentDetail(selectedIncident.id, 'incident-intelligence')}
              className="w-full py-2 rounded-md bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-xs font-medium text-cyan-300 cursor-pointer"
            >
              Inspect Updated Score Breakdown →
            </button>
          </div>

          {/* Right: FollowUpComposer */}
          <div className="xl:col-span-7">
            <FollowUpComposer
              key={selectedIncident.id}
              incident={selectedIncident}
              networkTier={systemStatus.networkTier}
              onSendQuestion={createAndSendFollowUp}
              injectedDraft={injectedDraft}
              existingFollowUps={incidentFollowUps.map((f) => f.questionEnglish)}
              canEditTriage={canEditTriage}
            />
          </div>
        </div>
      )}

      {/* Question History & Simulated Victim Response Simulator */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Active Triage Question Queue & Simulated Victim Responses ({followUps.length})
            </h2>
            <p className="text-xs text-[#8B9BB4]">
              Dispatch saved drafts or trigger a simulated citizen response below to observe real-time confidence and priority score updates.
            </p>
          </div>
          {incidentFollowUps.length > 0 && (
            <span className="text-xs font-mono text-cyan-400">
              {incidentFollowUps.length} active for {selectedIncident?.id}
            </span>
          )}
        </div>

        <div className="divide-y divide-[#182336]">
          {followUps.map((q) => {
            const currentIdx = STATUS_STEPS.indexOf(q.status);
            const inc = incidents.find((i) => i.id === q.incidentId);
            return (
              <div key={q.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-cyan-400 font-semibold">{q.id}</span>
                      <span className="text-[#475569]">·</span>
                      <button
                        type="button"
                        onClick={() => openIncidentDetail(q.incidentId, 'incident-intelligence')}
                        className="text-[#E6EDF7] hover:text-cyan-300 underline cursor-pointer"
                      >
                        {q.incidentId} ({inc?.location.placeName ?? 'Unknown'})
                      </button>
                      <span className="text-[#475569]">·</span>
                      <span className="text-[#8B9BB4]">{q.channel}</span>
                      <span className="text-[#475569]">·</span>
                      <LanguageBadge language={q.language} />
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-[#E6EDF7]">
                      {q.status === 'Draft' ? 'Draft' : 'Sent'} ({q.language}): “{q.questionLocalized}”
                    </div>
                    <div className="text-xs text-[#8B9BB4] mt-0.5">
                      English: {q.questionEnglish} · Target: {q.targetMissingField}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono font-medium whitespace-nowrap ${
                      q.status === 'Information updated'
                        ? 'text-emerald-400'
                        : q.status === 'Draft'
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                    }`}
                  >
                    {q.status}
                  </span>
                </div>

                {/* Lifecycle Progress */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  {STATUS_STEPS.map((st, idx) => (
                    <span
                      key={st}
                      className={`px-2 py-0.5 rounded ${
                        idx <= currentIdx
                          ? 'bg-cyan-500/15 text-cyan-300'
                          : 'bg-[#090E17] text-[#475569]'
                      }`}
                    >
                      {st}
                    </span>
                  ))}
                </div>

                {/* Draft Send OR Simulated Reply Actions OR Received Reply Result */}
                {q.response ? (
                  <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-300">
                        Simulated Citizen Reply Received ({q.response.receivedAt})
                      </span>
                      <span className="font-mono text-emerald-300 tabular-nums">
                        Confidence +{Math.round(q.response.confidenceGain * 100)}% · Need Score{' '}
                        {q.response.needScoreDelta >= 0 ? `+${q.response.needScoreDelta}` : q.response.needScoreDelta}
                      </span>
                    </div>
                    <div className="text-[#E6EDF7]">Reply: “{q.response.replyText}”</div>
                    <div className="text-[#CBD5E1]">Incident Updated: {q.response.extractedValue}</div>
                  </div>
                ) : q.status === 'Draft' ? (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[#8B9BB4]">
                      Saved as draft — dispatch to await simulated citizen response.
                    </span>
                    <button
                      type="button"
                      disabled={!canEditTriage}
                      onClick={() => sendDraftFollowUp(q.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send Draft Now (Simulated)
                    </button>
                  </div>
                ) : (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#8B9BB4] inline-flex items-center gap-1">
                      <MessageSquareReply className="w-3.5 h-3.5 text-amber-400" />
                      Simulate Victim Response:
                    </span>
                    {q.simulatedOptions.map((opt, idx) => (
                      <button
                        key={opt.label}
                        type="button"
                        disabled={!canEditTriage}
                        onClick={() => simulateFollowUpResponse(q.id, idx)}
                        className="px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#294063] text-xs text-[#E6EDF7] cursor-pointer transition-colors disabled:opacity-40"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
