import {
  WS_AUTH_MESSAGES,
  WS_BJ_MULTI_MESSAGES,
  WS_BLACKJACK_MESSAGES,
  WS_CHAT_MESSAGES,
  WS_CRAPS_MULTI_MESSAGES,
  WS_POKER_MESSAGES,
  WS_PUBLIC_MESSAGES,
  WS_TOURNAMENT_MESSAGES,
  WS_UTH_MULTI_MESSAGES,
} from './message-types';

export type WebSocketMessageDomain =
  | 'auth'
  | 'public'
  | 'blackjack'
  | 'chat'
  | 'tournament'
  | 'poker'
  | 'bj_multi'
  | 'craps_multi'
  | 'uth_multi'
  | 'unknown';

const POKER_PUBLIC_TYPES = new Set<string>([
  'poker_tournament_list',
  'poker_tournament_get_state',
  'poker_tournament_registrants',
]);

export function classifyWebSocketMessageType(type: string): WebSocketMessageDomain {
  if ((WS_AUTH_MESSAGES as readonly string[]).includes(type)) return 'auth';
  if ((WS_PUBLIC_MESSAGES as readonly string[]).includes(type)) return 'public';
  if ((WS_BLACKJACK_MESSAGES as readonly string[]).includes(type)) return 'blackjack';
  if ((WS_CHAT_MESSAGES as readonly string[]).includes(type)) return 'chat';
  if ((WS_TOURNAMENT_MESSAGES as readonly string[]).includes(type)) return 'tournament';
  if ((WS_POKER_MESSAGES as readonly string[]).includes(type) || POKER_PUBLIC_TYPES.has(type)) return 'poker';
  if ((WS_BJ_MULTI_MESSAGES as readonly string[]).includes(type)) return 'bj_multi';
  if ((WS_CRAPS_MULTI_MESSAGES as readonly string[]).includes(type)) return 'craps_multi';
  if ((WS_UTH_MULTI_MESSAGES as readonly string[]).includes(type)) return 'uth_multi';
  return 'unknown';
}
