/**
 * Poker (cash + SNG): `poker_join_table.buyInChips` and `poker_add_chips.amount` are **positive whole-chip**
 * decimal strings (not wei). Session messages `auth_success` / `connection_established` may include
 * `pokerChipBalance` (chip string). Tournament complete payloads use `*Chips` fields — see `lib/poker-tournament-completed.ts`.
 */
export const WS_MESSAGE_TYPES = {
  // Auth/session
  authChallenge: 'auth_challenge',
  authSuccess: 'auth_success',
  connectionEstablished: 'connection_established',
  authResponse: 'auth_response',
  ping: 'ping',

  // Single-player blackjack
  getServerSeedHash: 'get_server_seed_hash',
  createGame: 'create_game',
  playerAction: 'player_action',
  getGameState: 'get_game_state',
  syncBalance: 'sync_balance',
  getBalance: 'get_balance',
  tipDealer: 'tip_dealer',

  // Chat/profile
  joinRoom: 'join_room',
  chatMessage: 'chat_message',
  roomJoined: 'room_joined',
  chatMessageDeleted: 'chat_message_deleted',
  setDisplayName: 'set_display_name',
  displayNameSet: 'display_name_set',
  getProfile: 'get_profile',
  getChatHistory: 'get_chat_history',

  // Responsible gaming
  checkExclusionStatus: 'check_exclusion_status',
  setExclusion: 'set_exclusion',
  getExclusionHistory: 'get_exclusion_history',

  // Poker cash
  pokerListTables: 'poker_list_tables',
  pokerTableList: 'poker_table_list',
  pokerTableState: 'poker_table_state',
  pokerJoinTable: 'poker_join_table',
  pokerLeaveTable: 'poker_leave_table',
  pokerAddChips: 'poker_add_chips',
  pokerAction: 'poker_action',
  pokerGetState: 'poker_get_state',
  pokerCreateTable: 'poker_create_table',
  pokerUpdateTableLogo: 'poker_update_table_logo',
  pokerPurchaseTableLogo: 'poker_purchase_table_logo',
  pokerQuickReaction: 'poker_quick_reaction',
  pokerAvatarEmotion: 'poker_avatar_emotion',
  pokerSitOut: 'poker_sit_out',
  pokerSitBack: 'poker_sit_back',

  // Poker tournaments
  pokerTournamentList: 'poker_tournament_list',
  pokerTournamentJoin: 'poker_tournament_join',
  pokerTournamentGetState: 'poker_tournament_get_state',
  pokerTournamentRegistrants: 'poker_tournament_registrants',
  pokerTournamentCreate: 'poker_tournament_create',
  pokerTournamentCancel: 'poker_tournament_cancel',

  // Broadcast/event responses
  gameUpdated: 'game_updated',
  gameCompleted: 'game_completed',
  globalGameCompleted: 'global_game_completed',
} as const;

export const WS_AUTH_MESSAGES = [
  WS_MESSAGE_TYPES.authResponse,
  WS_MESSAGE_TYPES.ping,
] as const;

export const WS_PUBLIC_MESSAGES = [
  WS_MESSAGE_TYPES.joinRoom,
  WS_MESSAGE_TYPES.getChatHistory,
  'recent_global_wins',
  WS_MESSAGE_TYPES.pokerListTables,
  WS_MESSAGE_TYPES.pokerTournamentList,
  WS_MESSAGE_TYPES.pokerTournamentGetState,
  WS_MESSAGE_TYPES.pokerTournamentRegistrants,
  'bj_multi_list_tables',
] as const;

export const WS_BLACKJACK_MESSAGES = [
  WS_MESSAGE_TYPES.getServerSeedHash,
  WS_MESSAGE_TYPES.createGame,
  WS_MESSAGE_TYPES.playerAction,
  WS_MESSAGE_TYPES.getGameState,
  WS_MESSAGE_TYPES.syncBalance,
  WS_MESSAGE_TYPES.getBalance,
  WS_MESSAGE_TYPES.tipDealer,
] as const;

export const WS_CHAT_MESSAGES = [
  WS_MESSAGE_TYPES.chatMessage,
  WS_MESSAGE_TYPES.setDisplayName,
  WS_MESSAGE_TYPES.getProfile,
  WS_MESSAGE_TYPES.checkExclusionStatus,
  WS_MESSAGE_TYPES.setExclusion,
  WS_MESSAGE_TYPES.getExclusionHistory,
] as const;

export const WS_TOURNAMENT_MESSAGES = [
  'tournament_enter',
  'tournament_leave',
  'tournament_state',
  'tournament_game_start',
  'tournament_player_action',
  'tournament_leaderboard',
  'tournament_leaderboard_by_id',
  'tournament_info',
  'tournament_create',
  'create_freeroll',
  'tournament_list',
  'tournament_join',
  'tournament_unregister',
  'tournament_get_info',
  'freeroll_list',
  'freeroll_register',
  'freeroll_join',
  'tournament_entries_list',
  'creator_tournaments',
  'creator_earnings',
  'tournament_cancel',
  'tournament_reclaim',
] as const;

export const WS_POKER_MESSAGES = [
  WS_MESSAGE_TYPES.pokerJoinTable,
  WS_MESSAGE_TYPES.pokerLeaveTable,
  WS_MESSAGE_TYPES.pokerAddChips,
  WS_MESSAGE_TYPES.pokerAction,
  WS_MESSAGE_TYPES.pokerGetState,
  WS_MESSAGE_TYPES.pokerCreateTable,
  WS_MESSAGE_TYPES.pokerUpdateTableLogo,
  WS_MESSAGE_TYPES.pokerPurchaseTableLogo,
  WS_MESSAGE_TYPES.pokerQuickReaction,
  WS_MESSAGE_TYPES.pokerAvatarEmotion,
  WS_MESSAGE_TYPES.pokerSitOut,
  WS_MESSAGE_TYPES.pokerSitBack,
  WS_MESSAGE_TYPES.pokerTournamentCreate,
  WS_MESSAGE_TYPES.pokerTournamentJoin,
  WS_MESSAGE_TYPES.pokerTournamentCancel,
] as const;

/** Multiplayer BJ: `bj_multi_place_bet` payload may include optional `clientSeed` (string, max 255). */
export const WS_BJ_MULTI_MESSAGES = [
  'bj_multi_join_table',
  'bj_multi_leave_table',
  'bj_multi_place_bet',
  'bj_multi_action',
  'bj_multi_get_state',
  'bj_multi_create_table',
  'bj_multi_delete_table',
  'bj_multi_table_history',
  'bj_multi_tip_dealer',
  'bj_multi_quick_reaction',
  'bj_multi_avatar_emotion',
] as const;

export const WS_KNOWN_EVENT_TYPES = new Set<string>([
  WS_MESSAGE_TYPES.connectionEstablished,
  'pong',
  WS_MESSAGE_TYPES.globalGameCompleted,
  WS_MESSAGE_TYPES.chatMessage,
  WS_MESSAGE_TYPES.chatMessageDeleted,
  WS_MESSAGE_TYPES.roomJoined,
  WS_MESSAGE_TYPES.pokerTableState,
  WS_MESSAGE_TYPES.pokerTableList,
  WS_MESSAGE_TYPES.pokerQuickReaction,
  WS_MESSAGE_TYPES.pokerAvatarEmotion,
  'poker_tournament_started',
  'poker_tournament_state',
  'poker_tournament_blind_level_up',
  'poker_tournament_player_eliminated',
  'poker_tournament_completed',
  'poker_tournament_cancelled',
  'bj_multi_table_state',
  'bj_multi_table_list',
  'bj_multi_tip_notification',
  'bj_multi_quick_reaction',
  'bj_multi_avatar_emotion',
]);
