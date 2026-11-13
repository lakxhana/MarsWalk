import React, { useState } from 'react';
import { type CommMessage } from '@/lib/storage';
import { SCIENCE_STATIONS } from '@/lib/scienceStations';
import {
  formatSimLMST,
  formatSecondsCountdown,
  sendReplyFromScienceTeam,
} from '@/lib/commManager';
import {
  Radio,
  Send,
  CheckCircle2,
  Clock,
  FastForward,
  Sparkles,
} from 'lucide-react';

interface ScienceTeamConsoleProps {
  messages: CommMessage[];
  simTime: number;
  simulationPaused: boolean;
  missionActive: boolean;
  oneWayDelayMinutes: number;
  onAdvanceSimTime: (seconds: number) => void;
  onMessageReplied: () => void;
}

const GUIDANCE_TEMPLATES = [
  {
    label: 'Coring Protocol',
    text: 'Confirm stabilization of drill pads on firm regolith. Clear surface dust with gas puff. Maintain steady 5 N contact force and inspect tailings cone for fine sulfate siltstone fragments.',
  },
  {
    label: 'Abrasion Depth',
    text: 'Execute standard 50 mm diameter circular abrasion. Penetrate weathered outer crust by 2–3 mm to access unoxidized matrix before SHERLOC spectral scan.',
  },
  {
    label: 'Slope Caution',
    text: 'HiRISE DTM analysis indicates local incline exceeds 14° on immediate approach. Maintain 15 m westward offset onto lower-angle fan terrace before initiating robotic arm deployment.',
  },
];

export default function ScienceTeamConsole({
  messages,
  simTime,
  simulationPaused,
  missionActive,
  oneWayDelayMinutes,
  onAdvanceSimTime,
  onMessageReplied,
}: ScienceTeamConsoleProps) {
  const deliveredMessages = messages.filter(
    (message) => message.direction === 'uplink' && simTime >= message.deliveredAtSimTime,
  );
  const deliveredStatus = deliveredMessages
    .filter((message) => message.kind === 'status_update' && message.statusSnapshot)
    .sort((a, b) => b.deliveredAtSimTime - a.deliveredAtSimTime)[0] ?? null;
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(() => {
    return deliveredMessages[0]?.id ?? null;
  });
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [authorName] = useState('Dr. Sarah Lindqvist (Lead Sedimentologist, Earth Science Operations)');

  const selectedMessage = deliveredMessages.find((m) => m.id === selectedMessageId) || deliveredMessages[0] || null;
  const linkedObservation = selectedMessage?.observationSnapshot ?? null;
  const stationInfo = selectedMessage ? SCIENCE_STATIONS[selectedMessage.siteId] : null;

  const handleApplyTemplate = (text: string) => {
    setReplyText((prev) => (prev ? `${prev}\n\n${text}` : text));
  };

  const handleSendReply = async () => {
    if (!selectedMessage || !replyText.trim()) return;
    setIsSending(true);
    try {
      await sendReplyFromScienceTeam({
        messageId: selectedMessage.id,
        replyText: replyText.trim(),
        simTime,
        oneWayDelayMinutes,
        authorName,
      });
      setReplyText('');
      onMessageReplied();
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#181513] text-[#f1e8db] font-sans antialiased sm:flex-row">
      {/* 
        LEFT COLUMN: Inbound Transmissions List
      */}
      <aside className="flex h-[40%] min-h-[220px] w-full max-h-80 shrink-0 flex-col border-b border-[#3c342e] bg-[#201b18] sm:h-auto sm:max-h-none sm:min-h-0 sm:w-96 sm:border-b-0 sm:border-r">
        <div className="p-4 border-b border-[#3c342e] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-sm font-bold tracking-tight text-[#f1e8db] uppercase">
                Science Team Ground Operations
              </h2>
            </div>
            <p className="text-[11px] text-[#b3a595] mt-0.5">
              Earth-Mars Link · {oneWayDelayMinutes.toFixed(1)} min one-way delay
            </p>
          </div>

          {!missionActive && (
            <button
              type="button"
              onClick={() => onAdvanceSimTime(oneWayDelayMinutes * 60)}
              disabled={!simulationPaused}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#d86a33] text-white text-[11px] font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={simulationPaused ? 'Advance all simulated mission time' : 'Pause the simulation before advancing time'}
            >
              <FastForward className="h-3 w-3" />
              <span>+{oneWayDelayMinutes}m</span>
            </button>
          )}
        </div>
        {missionActive && (
          <p className="text-[11px] text-[var(--text-secondary)]">
            Manual time advance is disabled during an active mission so movement and communication stay synchronized.
          </p>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#3c342e]">
          {deliveredMessages.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#b3a595]">
              <Radio className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
              <p className="font-semibold text-[#f1e8db]">No delivered messages yet</p>
              <p className="mt-1 text-[11px]">
                Questions and status updates appear here after their outbound communication delay.
              </p>
            </div>
          ) : (
            deliveredMessages.map((msg) => {
              const isSelected = selectedMessage?.id === msg.id;
              const hasReplied = Boolean(msg.replyText);
              const replyHasReachedMars = Boolean(
                msg.replyDeliveredAtSimTime !== undefined && simTime >= msg.replyDeliveredAtSimTime,
              );

              return (
                <button
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessageId(msg.id);
                    setReplyText('');
                  }}
                  className={`w-full p-4 text-left transition cursor-pointer flex flex-col gap-1.5 ${
                    isSelected ? 'bg-[#272019] border-l-4 border-l-[#0f766e]' : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#f1e8db] truncate">
                      {msg.siteName}
                    </span>
                    {msg.kind === 'status_update' ? (
                      <span className="text-[10px] font-semibold text-[#cdbfae]">Status received</span>
                    ) : hasReplied && !replyHasReachedMars ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8ccdf0]">
                        <Radio className="h-2.5 w-2.5" />
                        <span>Reply in transit</span>
                      </span>
                    ) : hasReplied ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#a9d494] bg-[#1f2d1d] px-1.5 py-0.5 rounded border border-[#3f5e36]">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Reply received on Mars</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f0b36a] bg-[#33261a] px-1.5 py-0.5 rounded border border-[#6b4a22]">
                        <Clock className="h-2.5 w-2.5" />
                        <span>Needs Guidance</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#cdbfae] line-clamp-2 italic">
                    "{msg.questionText}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-[#b3a595] pt-1">
                    <span>Plan v{msg.originalPlanVersion}</span>
                    <span>Sent: {formatSimLMST(msg.sentAtSimTime)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* 
        RIGHT COLUMN: Message Detail & Science Guidance Formulation
      */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {deliveredStatus?.statusSnapshot && (
          <section className="mx-auto mb-4 max-w-3xl border border-[#3c342e] bg-[#262019] p-4 text-xs">
            <h2 className="font-bold text-sm">Latest delivered mission status</h2>
            <p className="mt-1">{deliveredStatus.statusSnapshot.planSummary}</p>
            <p className="mt-1 text-[#b3a595]">
              Plan v{deliveredStatus.statusSnapshot.planVersion} · Delivered {formatSimLMST(deliveredStatus.deliveredAtSimTime)}
              {' '}· Information age {Math.max(0, Math.floor((simTime - (deliveredStatus.statusCreatedAtSimTime ?? deliveredStatus.sentAtSimTime)) / 60))} min
              <br />
              Created {formatSimLMST(deliveredStatus.statusCreatedAtSimTime ?? deliveredStatus.sentAtSimTime)}
              {' '}· Sent {formatSimLMST(deliveredStatus.sentAtSimTime)}
              {' '}· Communication delay {Math.max(0, Math.floor((deliveredStatus.deliveredAtSimTime - deliveredStatus.sentAtSimTime) / 60))} min
            </p>
          </section>
        )}
        {selectedMessage ? (
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {/* Header */}
            <div className="border-b border-[#3c342e] pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono font-bold tracking-wider text-[#e8955f]">
                      Transmission {selectedMessage.id.slice(0, 12)}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-xs text-[#b3a595]">
                      Sent at {formatSimLMST(selectedMessage.sentAtSimTime)}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#f1e8db] mt-1">
                    {selectedMessage.siteName}
                  </h1>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-semibold text-[#f1e8db]">
                    Sim Time: {formatSimLMST(simTime)}
                  </div>
                  <div className="text-[11px] text-[#b3a595]">
                    Link Delay: {oneWayDelayMinutes.toFixed(1)} min
                  </div>
                </div>
              </div>
            </div>

            {/* Inbound Evidence & Explorer Observation */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Site Image */}
              {stationInfo && (
                <div className="md:col-span-5 rounded-xl border border-[#3c342e] overflow-hidden bg-[#2b2520] shadow-xs">
                  <img
                    src={stationInfo.photographUrl}
                    alt={stationInfo.photographAlt}
                    className="w-full aspect-16/10 object-cover"
                  />
                  <div className="p-3 bg-[#262019] border-t border-[#3c342e] text-[11px] text-[#b3a595] space-y-1">
                    <div className="font-semibold text-[#f1e8db]">{stationInfo.targetFeature}</div>
                    <div>Instrument: {stationInfo.instrument}</div>
                    <div>Sol: {stationInfo.martianSols} · {stationInfo.observationDate}</div>
                    <div className="text-[10px] text-neutral-400">Archival NASA photographic record</div>
                  </div>
                </div>
              )}
              {linkedObservation?.imageRef && (
                <div className="md:col-span-5 overflow-hidden border border-[#3c342e] bg-[#262019]">
                  <img
                    src={linkedObservation.imageRef}
                    alt={linkedObservation.imageCaption || 'Image attached to the observation'}
                    className="aspect-16/10 w-full object-contain"
                  />
                  <p className="p-2 text-[11px] text-[#b3a595]">{linkedObservation.imageCaption || 'Explorer attachment'}</p>
                </div>
              )}

              {/* Inbound Question & Note */}
              <div className={stationInfo || linkedObservation?.imageRef ? 'md:col-span-7' : 'col-span-12'}>
                <div className="rounded-xl border border-[#3c342e] bg-[#262019] p-5 shadow-xs space-y-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8955f]">
                      {selectedMessage.kind === 'status_update' ? 'Mission status update' : 'Explorer question'}
                    </span>
                    <div className="mt-1 text-sm font-semibold text-[#f1e8db] bg-[#272019] p-3 rounded-lg border border-[#3c342e] leading-snug">
                      "{selectedMessage.questionText}"
                    </div>
                  </div>

                  {selectedMessage.statusSnapshot && (
                    <div className="text-xs text-[#cdbfae]">
                      <span className="font-semibold">Mission context snapshot:</span>{' '}
                      {selectedMessage.statusSnapshot.planSummary} · {selectedMessage.statusSnapshot.destinationName}
                      <div className="mt-1 text-[11px] text-[#b3a595]">
                        Simulated position ({selectedMessage.statusSnapshot.position.x.toFixed(1)}, {selectedMessage.statusSnapshot.position.z.toFixed(1)}) m · {selectedMessage.statusSnapshot.coordinateReference}
                      </div>
                    </div>
                  )}

                  {linkedObservation?.note && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#b3a595]">
                        Fieldwork Note
                      </span>
                      <p className="mt-1 text-xs text-[#cdbfae] leading-relaxed">
                        {linkedObservation.note}
                      </p>
                    </div>
                  )}

                  {linkedObservation && (
                    <div className="text-[11px] text-[#b3a595]">
                      Location: {linkedObservation.siteName} · {linkedObservation.location.description || 'Location description unavailable'}
                      <br />
                      Observation created: {linkedObservation.timestamp}
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#3c342e] flex items-center justify-between text-[11px] text-[#b3a595]">
                    <span>Original Plan: v{selectedMessage.originalPlanVersion}</span>
                    <span>
                      Created {linkedObservation?.createdAtSimTime !== undefined ? formatSimLMST(linkedObservation.createdAtSimTime) : formatSimLMST(selectedMessage.sentAtSimTime)}
                      {' '}· Sent {formatSimLMST(selectedMessage.sentAtSimTime)}
                      {' '}· Delivered {formatSimLMST(selectedMessage.deliveredAtSimTime)}
                      {' '}· Communication delay {Math.max(0, Math.floor((selectedMessage.deliveredAtSimTime - selectedMessage.sentAtSimTime) / 60))} min
                      {linkedObservation?.createdAtSimTime !== undefined && (
                        <> · Information age {Math.max(0, Math.floor((simTime - linkedObservation.createdAtSimTime) / 60))} min</>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reply Section */}
            {selectedMessage.kind === 'status_update' ? (
              <p className="border border-[#3c342e] p-4 text-xs text-[#b3a595]">Status update received. Replies are available for delivered observation questions.</p>
            ) : selectedMessage.replyText ? (
              <div className="rounded-xl border border-[#3f5e36] bg-emerald-50/60 p-5 text-xs text-emerald-950 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-bold text-sm text-[#a9d494]">
                      Guidance Transmitted to Mars
                    </span>
                  </div>
                  <span className="text-[11px] text-[#a9d494]">
                    Sent at {selectedMessage.replySentAtSimTime ? formatSimLMST(selectedMessage.replySentAtSimTime) : ''}
                  </span>
                </div>

                <div className="rounded-lg bg-[#262019] p-4 border border-[#3f5e36] text-xs sm:text-sm text-[#f1e8db] leading-relaxed">
                  {selectedMessage.replyText}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#a9d494]">
                  <span>Author: {selectedMessage.scienceTeamAuthor}</span>
                  {selectedMessage.replyDeliveredAtSimTime && (
                    <span>
                      {simTime >= selectedMessage.replyDeliveredAtSimTime
                        ? `Delivered to Mars · Information age ${Math.max(0, Math.floor((simTime - selectedMessage.replyDeliveredAtSimTime) / 60))} min`
                        : `Reply in transit · ${formatSecondsCountdown(selectedMessage.replyDeliveredAtSimTime - simTime)} remaining`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#3c342e] bg-[#262019] p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#f1e8db] flex items-center gap-2">
                    <Send className="h-4 w-4 text-[#e8955f]" />
                    <span>Formulate Science Team Guidance</span>
                  </h3>
                  <span className="text-[11px] text-[#b3a595]">
                    Downlink transit: ~{oneWayDelayMinutes} min
                  </span>
                </div>

                {/* Templates */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#b3a595] flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Reference Guidance Protocols</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {GUIDANCE_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.label}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl.text)}
                        className="text-xs px-2.5 py-1 rounded-md border border-[#3c342e] bg-[#1f1a17] hover:bg-[#2b2520] text-[#f1e8db] transition cursor-pointer"
                      >
                        + {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Draft scientific guidance, rock sampling instructions, or safety cautions for the astronaut..."
                  className="w-full h-32 rounded-lg border border-[#3c342e] p-3 text-xs sm:text-sm text-[#f1e8db] focus:border-[#d86a33] focus:outline-none focus:ring-1 focus:ring-[#d86a33]"
                />

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-[#b3a595]">
                    Signed: <span className="font-medium text-[#f1e8db]">{authorName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSending || !replyText.trim()}
                      onClick={handleSendReply}
                      className="px-4 py-2 rounded-lg bg-[#d86a33] text-white text-xs font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Transmit to Mars</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[#b3a595]">
            Select an incoming message from the left to formulate guidance.
          </div>
        )}
      </main>
    </div>
  );
}
