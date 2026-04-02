export const BLACKJACK_MESSAGE_HANDLER_MAP: Record<string, string> = {
  get_server_seed_hash: 'handleGetServerSeedHash',
  create_game: 'handleCreateGame',
  player_action: 'handlePlayerAction',
  get_game_state: 'handleGetGameState',
  sync_balance: 'handleSyncBalance',
  get_balance: 'handleGetBalance',
  tip_dealer: 'handleGenericTipDealer',
};
