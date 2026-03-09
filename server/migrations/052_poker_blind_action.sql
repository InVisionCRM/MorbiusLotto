-- Migration 052: Add 'blind' action type to poker_hand_actions for tracking blind posts.
-- This allows getCurrentBetToCall to correctly compute preflop call amounts.

ALTER TABLE poker_hand_actions
  DROP CONSTRAINT IF EXISTS poker_hand_actions_action_check;

ALTER TABLE poker_hand_actions
  ADD CONSTRAINT poker_hand_actions_action_check
  CHECK (action IN ('fold', 'check', 'call', 'bet', 'raise', 'blind'));
