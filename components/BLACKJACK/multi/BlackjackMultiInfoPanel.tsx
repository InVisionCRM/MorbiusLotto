'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, BarChart3, HelpCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BlackjackMultiRealTimeBetChart, {
  type BlackjackMultiRealTimeBetChartRef,
} from '@/components/BLACKJACK/BlackjackMultiRealTimeBetChart';

export type BlackjackMultiSystemChatMessage = {
  id: string;
  type: 'welcome' | 'factbot' | 'idle_warning';
  text: string;
  sender?: string;
  timestamp: number;
};

export type BlackjackMultiRoundHistoryItem = {
  roundNumber: number;
  roundId: string | null;
  dealerTotal: number;
  dealerCards: number[];
  seats: Array<{
    position: number;
    playerAddress: string;
    hands: Array<{ cards?: number[]; total: number }>;
    payout: string;
    result: string;
  }>;
  timestamp: number;
};

type ChatMessage = {
  id: string;
  displayName?: string | null;
  senderAddress: string | null;
  text: string;
  timestamp: string;
};

type BlackjackMultiInfoPanelProps = {
  chatMessages: ChatMessage[];
  systemChatMessages: BlackjackMultiSystemChatMessage[];
  roundHistory: BlackjackMultiRoundHistoryItem[];
  address?: string;
  wsConnected: boolean;
  onSendChatMessage: (text: string) => void;
  chartRef: React.RefObject<BlackjackMultiRealTimeBetChartRef | null>;
  chartSessionStartTime: number;
  formatMorbius: (wei: string) => string;
  viewportHeightClassName?: string;
};

const CHAT_MAX_LENGTH = 150;
const CHAT_BURST_LIMIT = 7;
const CHAT_COOLDOWN_MS = 30_000;
const CHAT_COOLDOWN_TOAST_THROTTLE_MS = 4000;
export const DEFAULT_INFO_PANEL_VIEWPORT_HEIGHT_CLASS = 'h-64 md:h-72';

function ChatMessages({
  messages,
  systemMessages,
}: {
  messages: ChatMessage[];
  systemMessages: BlackjackMultiSystemChatMessage[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, systemMessages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  type MergedMsg = { key: string; ts: number } & (
    | { kind: 'player'; displayName?: string | null; senderAddress: string | null; text: string }
    | { kind: 'system'; type: BlackjackMultiSystemChatMessage['type']; sender?: string; text: string }
  );

  const merged: MergedMsg[] = useMemo(() => {
    const items: MergedMsg[] = [
      ...messages.map((m) => ({
        key: m.id,
        ts: new Date(m.timestamp).getTime(),
        kind: 'player' as const,
        displayName: m.displayName,
        senderAddress: m.senderAddress,
        text: m.text,
      })),
      ...systemMessages.map((m) => ({
        key: m.id,
        ts: m.timestamp,
        kind: 'system' as const,
        type: m.type,
        sender: m.sender,
        text: m.text,
      })),
    ];
    items.sort((a, b) => a.ts - b.ts);
    return items;
  }, [messages, systemMessages]);

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-0.5 min-h-0 px-3 py-1 pr-1.5">
      {merged.map((m) => {
        if (m.kind === 'player') {
          return (
            <div key={m.key} className="text-xs text-white/75 break-words">
              <span className="text-cyan-400 font-medium">{m.displayName ?? m.senderAddress?.slice(0, 6)}: </span>
              {m.text}
            </div>
          );
        }
        const isWelcome = m.type === 'welcome';
        const isFactBot = m.type === 'factbot';
        const isIdle = m.type === 'idle_warning';
        return (
          <div key={m.key} className={`text-xs break-words py-0.5 ${isWelcome ? 'text-white/85' : isFactBot ? 'text-emerald-400/80' : 'text-orange-400/80'}`}>
            {isWelcome && <span className="font-bold text-white">Morbius: </span>}
            {isFactBot && <span className="font-bold text-emerald-400">FactBot: </span>}
            {isIdle && <span className="font-bold text-orange-400">⚠ System: </span>}
            {isWelcome ? <span dangerouslySetInnerHTML={{ __html: m.text }} /> : m.text}
          </div>
        );
      })}
      {merged.length === 0 && (
        <div className="text-xs text-white/35 text-center py-6">No messages yet</div>
      )}
    </div>
  );
}

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const sentTimestamps = useRef<number[]>([]);
  const lastCooldownToastAt = useRef(0);
  const maxLengthToastShownForDraft = useRef(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (cooldownEnd <= Date.now()) { setCooldownLeft(0); return; }
    const tick = () => setCooldownLeft(Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  const handleSend = () => {
    const msg = text.trim();
    if (!msg) return;
    const now = Date.now();
    if (now < cooldownEnd) {
      if (now - lastCooldownToastAt.current >= CHAT_COOLDOWN_TOAST_THROTTLE_MS) {
        lastCooldownToastAt.current = now;
        const s = Math.max(1, Math.ceil((cooldownEnd - now) / 1000));
        toast.message('Chat cooldown', {
          description: `Wait ${s}s — you're sending messages too fast.`,
        });
      }
      return;
    }

    sentTimestamps.current = sentTimestamps.current.filter((t) => now - t < CHAT_COOLDOWN_MS);
    if (sentTimestamps.current.length >= CHAT_BURST_LIMIT) {
      const end = sentTimestamps.current[0] + CHAT_COOLDOWN_MS;
      setCooldownEnd(end);
      const s = Math.ceil((end - now) / 1000);
      setCooldownLeft(s);
      lastCooldownToastAt.current = now;
      toast.warning('Slow down', {
        description: `${CHAT_BURST_LIMIT} messages in 30s — wait ${s}s before chatting again.`,
      });
      return;
    }

    sentTimestamps.current.push(now);
    onSend(msg);
    setText('');
    maxLengthToastShownForDraft.current = false;
  };

  const onCooldown = cooldownLeft > 0;

  return (
    <form className="flex gap-2 mt-1.5" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <div className="relative flex-1">
        <Input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (v.length >= CHAT_MAX_LENGTH && !maxLengthToastShownForDraft.current) {
              maxLengthToastShownForDraft.current = true;
              toast.message('Character limit', {
                description: `${CHAT_MAX_LENGTH} characters max per message.`,
              });
            }
            if (v.length < CHAT_MAX_LENGTH) maxLengthToastShownForDraft.current = false;
          }}
          placeholder={onCooldown ? `Wait ${cooldownLeft}s…` : 'Table chat…'}
          className="h-7 text-xs bg-white/10 border-white/20 text-slate-200 placeholder:text-white/30 pr-8"
          maxLength={CHAT_MAX_LENGTH}
          disabled={onCooldown}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-white/25 tabular-nums pointer-events-none">
          {text.length}/{CHAT_MAX_LENGTH}
        </span>
      </div>
      <button type="submit" disabled={onCooldown || !text.trim()}
        className="px-3 h-7 text-xs rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors disabled:opacity-40 disabled:pointer-events-none">
        Send
      </button>
    </form>
  );
}

export function BlackjackMultiInfoPanel({
  chatMessages,
  systemChatMessages,
  roundHistory,
  address,
  wsConnected,
  onSendChatMessage,
  chartRef,
  chartSessionStartTime,
  formatMorbius,
  viewportHeightClassName = DEFAULT_INFO_PANEL_VIEWPORT_HEIGHT_CLASS,
}: BlackjackMultiInfoPanelProps) {
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    if (activeTab === 'chart') {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  }, [activeTab]);

  return (
    <div
      className="w-full min-w-0 md:flex-1 md:min-h-0 rounded-xl border border-cyan-500/25 overflow-hidden md:flex md:flex-col"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.65))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
      }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:flex md:flex-col md:flex-1 md:min-h-0">
        <TabsList className="w-full grid grid-cols-4 bg-black/40 rounded-none border-b border-cyan-500/15 h-9 p-0">
          <TabsTrigger value="chat" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="chart" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chart</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rules</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-none data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:shadow-none text-white/50 text-xs gap-1.5 h-full">
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        <div className={`relative overflow-hidden ${viewportHeightClassName}`}>
          <TabsContent value="chat" className="mt-0 h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
              <h3 className="text-xs font-semibold text-cyan-300/90 uppercase tracking-wide">Table chat</h3>
              {chatMessages.length > 0 && (
                <span className="text-[10px] text-white/40 tabular-nums">{chatMessages.length} msgs</span>
              )}
            </div>
            <ChatMessages messages={chatMessages} systemMessages={systemChatMessages} />
            <div className="px-3 pb-3 pt-1 mt-auto border-t border-white/5">
              {address && wsConnected ? (
                <ChatInput onSend={onSendChatMessage} />
              ) : (
                <p className="text-[11px] text-white/40 text-center py-1">Connect wallet to chat</p>
              )}
            </div>
          </TabsContent>

          <div
            className={activeTab === 'chart' ? 'p-3' : 'absolute top-0 left-0 right-0 opacity-0 pointer-events-none'}
            aria-hidden={activeTab !== 'chart'}
          >
            <div className="h-full min-w-0">
              <BlackjackMultiRealTimeBetChart
                ref={chartRef}
                sessionStartTime={chartSessionStartTime}
              />
            </div>
          </div>

          <TabsContent value="rules" className="mt-0 h-full p-3 overflow-y-auto">
            <div className="text-xs text-white/90 space-y-4">
              <p className="text-[11px] text-white/50 leading-relaxed">
                Full FAQ, fees, provably fair details, and contract addresses are in the section below the table (video + accordion).
              </p>
              <div>
                <h3 className="text-sm font-semibold text-cyan-300/95 mb-1.5">At this table</h3>
                <ul className="space-y-1 list-disc list-inside text-white/80">
                  <li>Take an open seat, then bet when the table is in the betting phase.</li>
                  <li>Play proceeds in seat order; use Hit, Stand, Double, or Split when it is your turn.</li>
                  <li>Chat is available in the Chat tab — keep it respectful.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-cyan-300/95 mb-1.5">Deposit & withdraw</h3>
                <ul className="space-y-1 list-disc list-inside text-white/80">
                  <li>
                    Use your balance / reserve controls on the table to move MORBIUS in or out. Keep a little PLS for gas.
                  </li>
                  <li>Bets use your table balance; winnings are credited back.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-cyan-300/95 mb-1.5">Blackjack rules</h3>
                <ul className="space-y-1 list-disc list-inside text-white/80">
                  <li>Get as close to 21 as you can without busting; beat the dealer total.</li>
                  <li>
                    <strong>Hit</strong> — take another card. <strong>Stand</strong> — keep your hand.
                  </li>
                  <li>
                    <strong>Double</strong> — double the bet, one more card only (when allowed).
                  </li>
                  <li>
                    <strong>Split</strong> — on a pair, play two hands (extra bet).
                  </li>
                  <li>Natural blackjack (Ace + 10-value) typically pays 3:2. Dealer stands on 17 unless table rules say otherwise.</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0 h-full p-3">
            {roundHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-10 text-white/35 text-sm gap-2">
                <History className="w-8 h-8 text-white/20" />
                <p>No rounds played yet this session</p>
              </div>
            ) : (
              <div className="space-y-2 h-full overflow-y-auto pr-1">
                {roundHistory.map((r) => {
                  const mySeatEntry = r.seats.find((s) => s.playerAddress.toLowerCase() === address?.toLowerCase());
                  return (
                    <div key={r.roundNumber} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white/70">Round #{r.roundNumber}</span>
                        <span className="text-[10px] text-white/40">{new Date(r.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/50">Dealer:</span>
                        <div className="flex gap-0.5">
                          {r.dealerCards.map((c, ci) => {
                            const suits = ['♠', '♥', '♦', '♣'];
                            const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                            const suit = suits[Math.floor(c / 13)];
                            const rank = ranks[c % 13];
                            const isRed = suit === '♥' || suit === '♦';
                            return (
                              <span key={ci} className={`px-1 py-0.5 rounded text-[10px] font-bold border border-white/10 bg-black/30 ${isRed ? 'text-red-400' : 'text-white/80'}`}>
                                {rank}{suit}
                              </span>
                            );
                          })}
                        </div>
                        <span className="text-white/60 font-bold">{r.dealerTotal}</span>
                      </div>
                      {mySeatEntry && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-white/50">You:</span>
                          {mySeatEntry.hands.map((h, hi) => (
                            <div key={hi} className="flex gap-0.5">
                              {(h.cards ?? []).map((c, ci) => {
                                const suits = ['♠', '♥', '♦', '♣'];
                                const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                                const suit = suits[Math.floor(c / 13)];
                                const rank = ranks[c % 13];
                                const isRed = suit === '♥' || suit === '♦';
                                return (
                                  <span key={ci} className={`px-1 py-0.5 rounded text-[10px] font-bold border border-white/10 bg-black/30 ${isRed ? 'text-red-400' : 'text-white/80'}`}>
                                    {rank}{suit}
                                  </span>
                                );
                              })}
                              <span className="text-white/60 font-bold">{h.total}</span>
                            </div>
                          ))}
                          <span className={`font-bold text-[10px] uppercase ${
                            mySeatEntry.result === 'win'
                              ? 'text-emerald-400'
                              : mySeatEntry.result === 'push'
                                ? 'text-yellow-400'
                                : mySeatEntry.result === 'mixed'
                                  ? 'text-cyan-300'
                                  : 'text-red-400'
                          }`}>
                            {mySeatEntry.result === 'win' ? `+${formatMorbius(mySeatEntry.payout)}` : mySeatEntry.result}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

