import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Send, Sparkles, Square } from 'lucide-react';
import { generateTriageQuestion, transcribeFieldAudio } from '../services/dhwaniApi';
import type { FollowUpQuestion, Incident, NetworkTier, SupportedLanguage } from '../types/dhwani';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio.'));
    reader.readAsDataURL(blob);
  });
}

export function FollowUpComposer({
  incident,
  networkTier,
  onSendQuestion,
  injectedDraft,
  existingFollowUps = [],
  canEditTriage = true,
}: {
  incident: Incident;
  networkTier: NetworkTier;
  onSendQuestion: (q: FollowUpQuestion) => void;
  injectedDraft?: { text: string; language: SupportedLanguage; nonce: number } | null;
  existingFollowUps?: string[];
  canEditTriage?: boolean;
}) {
  const isOffline = networkTier !== 'TIER_2_CLOUD';
  const [channel, setChannel] = useState<'SMS' | 'Missed-call IVR' | 'WhatsApp text'>('SMS');
  const [language, setLanguage] = useState<SupportedLanguage>(incident.language);
  const [questionEnglish, setQuestionEnglish] = useState(
    'Is the water above knee level? Reply 1 for YES, 2 for NO.'
  );
  const [questionLocalized, setQuestionLocalized] = useState(
    'Neeru mandi level ginta jasthi idya? 1 = HOUDU (Yes), 2 = ILLA (No).'
  );
  const [reason, setReason] = useState(
    'Maximizes expected information gain: confirms immediate boat-evacuation urgency in a single keypad digit.'
  );
  const [targetField, setTargetField] = useState(
    incident.missingInformation[0] ?? 'Current water depth / rate of rise'
  );
  const [providerInfo, setProviderInfo] = useState<string>('');
  const [providerIsFallback, setProviderIsFallback] = useState<boolean>(false);
  const [validationChecks, setValidationChecks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [inlineRecording, setInlineRecording] = useState(false);
  const [inlineTranscribing, setInlineTranscribing] = useState(false);
  const inlineRecorderRef = useRef<MediaRecorder | null>(null);
  const inlineStreamRef = useRef<MediaStream | null>(null);
  const inlineChunksRef = useRef<Blob[]>([]);

  // Sync recipient language and target missing field when switching incidents
  useEffect(() => {
    setLanguage(incident.language);
    setTargetField(incident.missingInformation[0] ?? 'Current hazard severity & accessibility');
    setValidationChecks([]);
    setProviderInfo('');
    setProviderIsFallback(false);
  }, [incident.id]);

  // Force SMS/IVR fallback when internet fails (Tier 1 / Tier 0)
  useEffect(() => {
    if (isOffline && channel === 'WhatsApp text') {
      setChannel('SMS');
      setProviderInfo('Internet unavailable — switched follow-up channel to low-bandwidth SMS.');
      setProviderIsFallback(true);
    }
  }, [isOffline, channel]);

  useEffect(() => {
    if (injectedDraft && injectedDraft.text) {
      setQuestionLocalized(injectedDraft.text);
      setQuestionEnglish(injectedDraft.text);
      setLanguage(injectedDraft.language);
      setProviderInfo('Populated from Field Worker Voice Dictation.');
      setProviderIsFallback(false);
    }
  }, [injectedDraft]);

  useEffect(() => {
    return () => {
      inlineStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleToggleInlineMic = async () => {
    if (inlineRecording) {
      inlineRecorderRef.current?.stop();
      setInlineRecording(false);
      return;
    }
    setProviderInfo('');
    setProviderIsFallback(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setProviderInfo('Microphone unavailable in this browser — use the Voice Dictation panel above to upload audio.');
      setProviderIsFallback(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      inlineStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      inlineChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) inlineChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const finalMime = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(inlineChunksRef.current, { type: finalMime });
        stream.getTracks().forEach((t) => t.stop());
        if (blob.size === 0) return;
        setInlineTranscribing(true);
        const b64 = await blobToBase64(blob);
        const res = await transcribeFieldAudio({
          audioBase64: b64,
          mimeType: finalMime,
          languageHint: language,
          networkTier,
        });
        setInlineTranscribing(false);
        if (res.ok && res.transcript) {
          setQuestionLocalized(res.transcript);
          setQuestionEnglish(res.transcript);
          setProviderInfo(`Dictated via ${res.provider}`);
          setProviderIsFallback(false);
        } else {
          setProviderInfo(res.error || 'Could not transcribe dictation.');
          setProviderIsFallback(true);
        }
      };
      inlineRecorderRef.current = rec;
      rec.start();
      setInlineRecording(true);
    } catch {
      setProviderInfo('Microphone permission denied or unavailable.');
      setProviderIsFallback(true);
    }
  };

  const [simulatedOptions, setSimulatedOptions] = useState<FollowUpQuestion['simulatedOptions']>([
    {
      label: 'Reply 1 — YES (Water rising above chest)',
      replyText: '1 - Neeru ede level bartha ide, ground floor submerged.',
      extractedUpdate: 'Confirmed chest-high rising water; urgent boat rescue required.',
      scoreDelta: 10,
      confidenceGain: 0.2,
      resolvedField: incident.missingInformation[0] ?? 'Current water depth / rate of rise',
    },
    {
      label: 'Reply 2 — NO (Water shallow / stable)',
      replyText: '2 - Neeru kammi ide, stable aagide.',
      extractedUpdate: 'Confirmed ankle-level stable water; lower immediate rescue urgency.',
      scoreDelta: -7,
      confidenceGain: 0.16,
      resolvedField: incident.missingInformation[0] ?? 'Current water depth / rate of rise',
    },
  ]);

  const handleGenerateAI = async () => {
    setLoading(true);
    setProviderInfo('');
    setValidationChecks([]);
    const res = await generateTriageQuestion({
      incidentSummary: incident.summary,
      originalMessage: incident.originalMessage,
      hazardType: incident.hazard,
      locationDescription: incident.location.placeName,
      locationPrecision: incident.location.precision,
      affectedPeople: incident.affectedPeople,
      vulnerableGroups: incident.vulnerableGroups,
      missingInformation: incident.missingInformation,
      existingFollowUps,
      targetLanguage: language,
      channel,
      networkTier,
    });
    setQuestionEnglish(res.result.questionEnglish);
    setQuestionLocalized(res.result.questionLocalized);
    setReason(res.result.informationGainReason);
    setTargetField(res.result.targetMissingField);
    setSimulatedOptions(
      res.result.simulatedReplyOptions.map((opt) => ({
        ...opt,
        confidenceGain: res.result.expectedConfidenceDelta || 0.16,
        resolvedField: res.result.targetMissingField,
      }))
    );
    const isFallback = res.provider !== 'gemini-4-hydrogen';
    setProviderIsFallback(isFallback);
    setValidationChecks(res.validationChecks ?? []);
    setProviderInfo(
      res.warning
        ? `${res.provider} — ${res.warning}`
        : `Generated & validated via ${res.provider} (server-side Gemini · +${Math.round(res.result.expectedConfidenceDelta * 100)}% est. confidence gain)`
    );
    setLoading(false);
  };

  const submitQuestion = (mode: 'Draft' | 'Awaiting response') => {
    if (!questionEnglish.trim() || !canEditTriage) return;
    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const newQ: FollowUpQuestion = {
      id: `FU-${Math.floor(100 + Math.random() * 899)}`,
      incidentId: incident.id,
      questionEnglish: questionEnglish.trim(),
      questionLocalized: questionLocalized.trim() || questionEnglish.trim(),
      language,
      channel,
      targetMissingField: targetField,
      informationGainReason: reason,
      status: mode,
      createdAt: nowTime,
      sentAt: mode === 'Awaiting response' ? nowTime : undefined,
      simulatedOptions,
    };
    onSendQuestion(newQ);
  };

  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
        <div>
          <h3 className="text-sm font-semibold text-[#E6EDF7]">Active Triage Question Composer</h3>
          <p className="text-xs text-[#8B9BB4] mt-0.5">
            Selects one low-bandwidth question maximizing priority certainty. All dispatches are simulated in prototype.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={inlineTranscribing || !canEditTriage}
            onClick={handleToggleInlineMic}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-50 transition-colors ${
              inlineRecording
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-[#151F30] hover:bg-[#1E2E47] border-[#243652] text-[#E6EDF7]'
            }`}
          >
            {inlineTranscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : inlineRecording ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-orange-400" />
            )}
            {inlineTranscribing ? 'Transcribing...' : inlineRecording ? 'Stop Mic' : 'Dictate Question'}
          </button>
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? 'Selecting Optimal Question...' : 'AI Suggest Best Question'}
          </button>
        </div>
      </div>

      {providerInfo && (
        <div
          className={`text-xs font-mono rounded px-3 py-2 border space-y-1 ${
            providerIsFallback
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-[#0A1322] border-emerald-500/30 text-emerald-300'
          }`}
        >
          <div>{providerInfo}</div>
          {validationChecks.length > 0 && (
            <div className="text-[11px] text-[#94A3B8]">
              {validationChecks.join(' · ')}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#8B9BB4] mb-1">Communication Channel (Simulated)</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'SMS' | 'Missed-call IVR' | 'WhatsApp text')}
            className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
          >
            <option value="SMS">SMS (1/2 Keypad Reply — Low Bandwidth)</option>
            <option value="Missed-call IVR">Missed-call IVR Voice Callback (DTMF)</option>
            <option value="WhatsApp text" disabled={isOffline}>
              WhatsApp Short Reply{isOffline ? ' (Unavailable Offline)' : ''}
            </option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#8B9BB4] mb-1">Recipient Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
          >
            {(['Kannada', 'Tulu', 'Malayalam', 'Konkani', 'Hindi', 'English', 'Code-mixed'] as SupportedLanguage[]).map(
              (lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#8B9BB4] mb-1">Localized Message Sent to Citizen ({language})</label>
          <textarea
            rows={2}
            value={questionLocalized}
            onChange={(e) => setQuestionLocalized(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] focus:outline-none focus:border-cyan-500/60"
          />
        </div>
        <div>
          <label className="block text-xs text-[#8B9BB4] mb-1">English Coordinator Interpretation</label>
          <textarea
            rows={2}
            value={questionEnglish}
            onChange={(e) => setQuestionEnglish(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
          />
        </div>
      </div>

      <div className="bg-[#0B121F] border border-[#182336] rounded p-3 text-xs text-[#94A3B8]">
        <span className="text-cyan-400 font-medium">Selection Rationale ({targetField}): </span>
        {reason}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-[11px] font-mono text-[#6B7E9B]">
          {!canEditTriage
            ? 'Read-Only Observer role cannot save or dispatch follow-ups.'
            : 'Notice: Prototype simulates SMS/IVR transmission — no live telecom gateway connected.'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canEditTriage || !questionEnglish.trim()}
            onClick={() => submitQuestion('Draft')}
            className="px-3.5 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-[#E6EDF7] text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={!canEditTriage || !questionEnglish.trim()}
            onClick={() => submitQuestion('Awaiting response')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            Send Follow-Up (Simulated)
          </button>
        </div>
      </div>
    </div>
  );
}
