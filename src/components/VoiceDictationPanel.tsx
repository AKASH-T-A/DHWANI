import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  FileAudio,
  Loader2,
  MessageSquarePlus,
  Mic,
  PlusCircle,
  Square,
  Trash2,
} from 'lucide-react';
import { processEmergencyReport, transcribeFieldAudio } from '../services/dhwaniApi';
import { matchLandmarkCoordinates } from '../services/localAiFallback';
import type {
  EmergencyReport,
  EvidenceRecord,
  Incident,
  NetworkTier,
  SupportedLanguage,
} from '../types/dhwani';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio data.'));
    reader.readAsDataURL(blob);
  });
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VoiceDictationPanel({
  selectedIncident,
  networkTier,
  humanReviewThreshold,
  onCreateNewIncident,
  onAppendToIncident,
  onInsertIntoFollowUp,
  onOpenIncident,
}: {
  selectedIncident?: Incident;
  networkTier: NetworkTier;
  humanReviewThreshold: number;
  onCreateNewIncident: (incident: Incident, report: EmergencyReport, evidence: EvidenceRecord) => void;
  onAppendToIncident: (
    incidentId: string,
    transcript: string,
    language: SupportedLanguage,
    providerLabel: string
  ) => void;
  onInsertIntoFollowUp: (text: string, language: SupportedLanguage) => void;
  onOpenIncident: (id: string) => void;
}) {
  const [languageHint, setLanguageHint] = useState<SupportedLanguage | 'Auto-detect'>('Auto-detect');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(12).fill(8));
  const [transcribing, setTranscribing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [transcript, setTranscript] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; createdId?: string } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopAudioMonitor = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevels(Array(12).fill(8));
  };

  useEffect(() => {
    return () => {
      stopAudioMonitor();
      speechRecRef.current?.stop();
    };
  }, []);

  const runServerTranscription = async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    setErrorMessage('');
    setStatusMessage(null);
    try {
      const base64 = await blobToBase64(blob);
      const res = await transcribeFieldAudio({
        audioBase64: base64,
        mimeType,
        languageHint,
        networkTier,
      });

      if (!res.ok || !res.transcript) {
        setErrorMessage(res.error || 'Could not transcribe audio.');
      } else {
        setTranscript((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript!));
        setProviderLabel(res.provider);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected transcription error.');
    } finally {
      setTranscribing(false);
    }
  };

  const startBrowserOfflineSpeech = () => {
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setErrorMessage(
        `Offline mode (${networkTier.replace(/_/g, ' ')}) cannot reach cloud gemini-3.5-transcribe, and this browser does not expose local Web Speech recognition. Type or restore Tier 2 Cloud.`
      );
      return;
    }

    const langCodeMap: Record<string, string> = {
      Kannada: 'kn-IN',
      Malayalam: 'ml-IN',
      Hindi: 'hi-IN',
      English: 'en-IN',
      'Auto-detect': 'en-IN',
      Tulu: 'kn-IN',
      Konkani: 'hi-IN',
      'Code-mixed': 'en-IN',
    };

    const rec = new Ctor();
    rec.lang = langCodeMap[languageHint] ?? 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let combined = '';
      for (let i = 0; i < ev.results.length; i++) {
        combined += ev.results[i][0].transcript;
      }
      setTranscript(combined.trim());
      setProviderLabel('Browser SpeechRecognition (Offline Fallback)');
    };
    rec.onerror = (ev) => {
      setErrorMessage(`Local browser speech recognition error: ${ev.error}`);
      setIsRecording(false);
      stopAudioMonitor();
    };
    rec.onend = () => {
      setIsRecording(false);
      stopAudioMonitor();
    };
    speechRecRef.current = rec;
    rec.start();
    setIsRecording(true);
    setElapsedSec(0);
    timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
  };

  const handleStartRecording = async () => {
    setErrorMessage('');
    setStatusMessage(null);

    if (networkTier !== 'TIER_2_CLOUD') {
      startBrowserOfflineSpeech();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage(
        'Microphone recording is not supported in this browser context. You can upload an audio clip instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Live audio amplitude meter using Web Audio AnalyserNode
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateBars = () => {
          analyser.getByteFrequencyData(dataArray);
          const nextBars: number[] = [];
          for (let i = 0; i < 12; i++) {
            const val = dataArray[i * 2] ?? 0;
            nextBars.push(Math.max(10, Math.min(100, Math.round((val / 255) * 100))));
          }
          setAudioLevels(nextBars);
          rafRef.current = requestAnimationFrame(updateBars);
        };
        rafRef.current = requestAnimationFrame(updateBars);
      }

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosenMime = preferredTypes.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        stopAudioMonitor();
        if (blob.size > 0) {
          runServerTranscription(blob, finalMime);
        } else {
          setErrorMessage('Recording was too short to capture audio. Please hold for at least 1 second.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } catch (err) {
      stopAudioMonitor();
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow microphone access in your browser or upload a field audio clip.'
          : err instanceof Error
            ? `Unable to access microphone: ${err.message}`
            : 'Unable to access microphone.';
      setErrorMessage(msg);
    }
  };

  const handleStopRecording = () => {
    if (speechRecRef.current) {
      speechRecRef.current.stop();
      speechRecRef.current = null;
      setIsRecording(false);
      stopAudioMonitor();
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Audio file exceeds 10 MB limit. Please upload a shorter field clip.');
      return;
    }
    await runServerTranscription(file, file.type || 'audio/webm');
  };

  const handleCreateStructuredIncident = async () => {
    if (!transcript.trim()) return;
    setSubmitting(true);
    setErrorMessage('');
    setStatusMessage(null);

    try {
      const processed = await processEmergencyReport({
        message: transcript.trim(),
        sourceChannel: 'Volunteer PWA',
        declaredLanguage: languageHint === 'Auto-detect' ? undefined : languageHint,
        networkTier,
      });

      const r = processed.result;
      const idNum = Math.floor(100 + Math.random() * 899);
      const incId = `INC-VOX-${idNum}`;
      const repId = `REP-VOX-${idNum}`;
      const lm = matchLandmarkCoordinates(`${r.locationDescription} ${transcript}`);
      const nowLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const baseSeverityPts = r.urgencyLevel === 'Critical' ? 30 : r.urgencyLevel === 'High' ? 23 : 15;
      const vulnPts = r.vulnerablePersons.length > 0 ? 18 : 0;
      const biasPts = lm.taluk === 'Mangaluru' ? 4 : 15;
      const sensorPts = 14;
      const corrobPts = 10; // Direct field worker dictation carries higher initial reliability
      const finalScore = Math.min(97, baseSeverityPts + vulnPts + biasPts + sensorPts + corrobPts);

      const newIncident: Incident = {
        id: incId,
        title: `${r.hazardType} — ${r.locationDescription}`,
        summary: r.summary,
        originalMessage: transcript.trim(),
        processedMessage: r.englishTranslation,
        language: r.detectedLanguage,
        source: 'Volunteer PWA',
        receivedAt: nowLabel,
        hazard: r.hazardType,
        severity: r.urgencyLevel,
        affectedPeople: r.affectedPeople,
        vulnerableGroups: r.vulnerablePersons,
        missingInformation: r.missingInformation,
        location: {
          placeName: r.locationDescription || lm.name,
          landmark: r.landmarks[0] || lm.name,
          taluk: lm.taluk,
          lat: lm.lat,
          lng: lm.lng,
          precision: r.locationPrecision,
          gpsAvailable: r.locationPrecision === 'verified',
          uncertaintyRadiusMeters: r.uncertaintyRadiusMeters || lm.radius,
          confidence: r.fieldConfidence.location,
          candidateMatches: [
            {
              name: lm.name,
              matchScore: r.fieldConfidence.location,
              distanceHint: r.locationPrecision === 'verified' ? 'Field GPS' : `±${r.uncertaintyRadiusMeters}m zone`,
            },
          ],
          requiredForResolution: r.missingInformation.slice(0, 2),
        },
        confidence: r.overallConfidence,
        fieldConfidence: r.fieldConfidence,
        verificationStatus: 'Corroborated',
        needEstimate: {
          rawReportCount: 1,
          expectedReportingRate: lm.taluk === 'Mangaluru' ? 0.92 : 0.2,
          populationContext: 2400,
          connectivityScore: lm.taluk === 'Mangaluru' ? 95 : 32,
          languageAccessibility: 68,
          literacyAccessScore: 76,
          historicalBaselineRate: 0.22,
          biasCorrectedNeedIndex: Number((1 / (lm.taluk === 'Mangaluru' ? 0.92 : 0.2)).toFixed(1)),
          uncertaintyMargin: 4.4,
          finalNeedScore: finalScore,
          counterfactualNote:
            'Field worker voice report prioritized; score updates if water level stabilizes or rescue arrives.',
          factors: [
            {
              id: `${incId}-f1`,
              label: `Voice-dictated urgency (${r.urgencyLevel} ${r.hazardType})`,
              points: baseSeverityPts,
              category: 'severity',
              detail: r.summary,
            },
            ...(vulnPts > 0
              ? [
                  {
                    id: `${incId}-f2`,
                    label: `Vulnerable group (${r.vulnerablePersons.join(', ')})`,
                    points: vulnPts,
                    category: 'vulnerability' as const,
                    detail: 'Extracted from field worker audio dictation.',
                  },
                ]
              : []),
            {
              id: `${incId}-f3`,
              label: 'Netravati basin sensor context',
              points: sensorPts,
              category: 'hazard-sensor',
              detail: 'Active monsoon surge alert.',
            },
            {
              id: `${incId}-f4`,
              label: 'Reporting-rate bias correction',
              points: biasPts,
              category: 'bias-correction',
              detail: 'Adjusted for rural connectivity constraints.',
            },
            {
              id: `${incId}-f5`,
              label: 'Direct field worker dictation',
              points: corrobPts,
              category: 'corroboration',
              detail: `Transcribed via ${providerLabel || 'Voice Input'} and structured via ${processed.provider}.`,
            },
          ],
        },
        reportIds: [repId],
        duplicateCount: 0,
        coordinatorDecision: { approved: false },
        recommendedResources:
          r.hazardType === 'Flood' || r.hazardType === 'People trapped'
            ? ['Motorized rescue boat', 'Life jackets', 'First aid kit']
            : ['Field response team', 'Medical kit'],
        areaType: lm.taluk === 'Mangaluru' ? 'Urban' : 'Remote village',
        flaggedForHumanReview: r.overallConfidence < humanReviewThreshold,
        isSimulatedDemoData: true,
      };

      const newReport: EmergencyReport = {
        id: repId,
        incidentId: incId,
        originalMessage: transcript.trim(),
        translatedMessage: r.englishTranslation,
        language: r.detectedLanguage,
        sourceChannel: 'Volunteer PWA',
        reporterAlias: 'Field Worker (Voice Dictation)',
        reporterPhoneMasked: 'Field PWA Audio',
        reporterPhoneRaw: 'Field PWA Audio',
        receivedAt: nowLabel,
        isDuplicate: false,
        forwardChainDepth: 0,
        similarityScore: 1.0,
        isSimulatedDemoData: true,
      };

      const newEvidence: EvidenceRecord = {
        id: `EV-VOX-${idNum}`,
        incidentId: incId,
        type: 'independent_report',
        label: `Field Voice Dictation (${repId})`,
        detail: `Transcribed via ${providerLabel || 'manual edit'} · Structured via ${processed.provider}.`,
        reliabilityDelta: 16,
        sourceId: repId,
        timestamp: nowLabel,
      };

      onCreateNewIncident(newIncident, newReport, newEvidence);
      setStatusMessage({
        text: `Structured and logged voice incident ${incId} (Need Score ${finalScore}/100).`,
        createdId: incId,
      });
      setTranscript('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to structure dictated incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppendUpdate = () => {
    if (!selectedIncident || !transcript.trim()) return;
    const lang: SupportedLanguage =
      languageHint === 'Auto-detect' ? selectedIncident.language : languageHint;
    onAppendToIncident(
      selectedIncident.id,
      transcript.trim(),
      lang,
      providerLabel || 'Voice Dictation'
    );
    setStatusMessage({
      text: `Field voice update appended to ${selectedIncident.id} and logged in Audit Trail.`,
      createdId: selectedIncident.id,
    });
    setTranscript('');
  };

  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#182336]">
        <div>
          <div className="text-xs font-mono text-orange-400">
            HANDS-FREE FIELD INPUT · MULTILINGUAL VOICE-TO-TEXT
          </div>
          <h2 className="mt-0.5 text-sm font-semibold text-[#E6EDF7]">
            Field Worker Voice Dictation
          </h2>
          <p className="text-xs text-[#8B9BB4] mt-0.5">
            Dictate rapid incident reports or triage updates when typing in rain or transit is not feasible. Powered by server-side Gemini transcription (compatible with IndicWhisper/Bhashini).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            aria-label="Dictation language hint"
            value={languageHint}
            onChange={(e) => setLanguageHint(e.target.value as SupportedLanguage | 'Auto-detect')}
            className="px-2.5 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1]"
          >
            <option value="Auto-detect">Lang: Auto-detect</option>
            {(['Kannada', 'Tulu', 'Malayalam', 'Konkani', 'Hindi', 'English', 'Code-mixed'] as SupportedLanguage[]).map(
              (l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              )
            )}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isRecording || transcribing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-xs font-medium text-[#CBD5E1] whitespace-nowrap cursor-pointer disabled:opacity-45 transition-colors"
          >
            <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
            Upload Audio Clip
          </button>

          {!isRecording ? (
            <button
              type="button"
              disabled={transcribing}
              onClick={handleStartRecording}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-45 transition-colors"
            >
              <Mic className="w-4 h-4" />
              Start Voice Dictation
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopRecording}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop & Transcribe ({formatSeconds(elapsedSec)})
            </button>
          )}
        </div>
      </div>

      {/* Live Recording Waveform Telemetry Strip */}
      {isRecording && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/35 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-red-300">Recording Field Audio</span>
            <span className="font-mono text-xs text-[#E6EDF7] tabular-nums">
              {formatSeconds(elapsedSec)}
            </span>
            <span className="text-xs text-[#94A3B8]">
              {networkTier === 'TIER_2_CLOUD'
                ? 'Will transcribe via server-side gemini-3.5-transcribe'
                : 'Offline local browser speech recognition'}
            </span>
          </div>
          <div className="flex items-end gap-1 h-6" aria-hidden="true">
            {audioLevels.map((lvl, idx) => (
              <span
                key={idx}
                className="w-1.5 rounded-xs bg-red-400 transition-all duration-75"
                style={{ height: `${Math.max(18, lvl)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Transcribing Spinner */}
      {transcribing && (
        <div className="p-3 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-2.5 text-xs text-cyan-200">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
          <span>Transcribing field audio via server-side Gemini (gemini-3.5-transcribe)...</span>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/35 flex items-start gap-2 text-xs text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Feedback */}
      {statusMessage && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/35 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {statusMessage.text}
          </span>
          {statusMessage.createdId && (
            <button
              type="button"
              onClick={() => onOpenIncident(statusMessage.createdId!)}
              className="underline text-cyan-300 hover:text-cyan-200 font-medium cursor-pointer"
            >
              Inspect {statusMessage.createdId} →
            </button>
          )}
        </div>
      )}

      {/* Dictated Transcript Editor & One-Tap Actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <label className="text-[#8B9BB4] font-medium">
            Dictated Field Report Transcript
            {providerLabel && (
              <span className="ml-2 font-mono text-cyan-400">· {providerLabel}</span>
            )}
          </label>
          {transcript && (
            <button
              type="button"
              onClick={() => {
                setTranscript('');
                setProviderLabel('');
              }}
              className="inline-flex items-center gap-1 text-[#6B7E9B] hover:text-red-400 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <textarea
          rows={2}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Press 'Start Voice Dictation' and speak (e.g. 'Uppinangady school road flooded waist-deep, 6 people stranded including two children, need boat urgently') — editable before submission..."
          className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] placeholder:text-[#5B6E8C] focus:outline-none focus:border-cyan-500/60"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-[#6B7E9B]">
            Engine: {networkTier === 'TIER_2_CLOUD' ? 'gemini-3.5-transcribe (server-side)' : `${networkTier.replace(/_/g, ' ')} local fallback`}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!transcript.trim() || submitting}
              onClick={() =>
                onInsertIntoFollowUp(
                  transcript.trim(),
                  languageHint === 'Auto-detect'
                    ? selectedIncident?.language ?? 'English'
                    : languageHint
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-xs font-medium text-[#CBD5E1] whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 text-cyan-400" />
              Copy to Follow-Up
            </button>

            {selectedIncident && (
              <button
                type="button"
                disabled={!transcript.trim() || submitting}
                onClick={handleAppendUpdate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-xs font-medium text-cyan-300 whitespace-nowrap cursor-pointer disabled:opacity-40"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Append to {selectedIncident.id}
              </button>
            )}

            <button
              type="button"
              disabled={!transcript.trim() || submitting}
              onClick={handleCreateStructuredIncident}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cpu className="w-3.5 h-3.5" />
              )}
              {submitting ? 'Structuring Incident...' : 'AI Process & Log New Incident'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
