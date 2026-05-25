-- Fix holder merkle_blocklist gaps: Plinko V10 typo, current live contracts, LP pairs, deployer wallets.

-- Remove wrong Plinko V10 typo address (dfdcadac — not a real contract).
DELETE FROM merkle_blocklist
WHERE lower(address) = '0xfe8d58174d26cc2c60103120cbceb8f75dfdcadac';

INSERT INTO merkle_blocklist (address, reason) VALUES
  -- Plinko V10 legacy (correct checksum)
  ('0xfe8d58174d26cc2c60103120cbceb8f75dfdcdac', 'Plinko V10 legacy'),

  -- MORBIUS token + current live game contracts (lib/contracts.ts)
  ('0xb7d4eb5fdfe3d4d3b5c16a44a49948c6ec77c6f1', 'MORBIUS ERC20 token'),
  ('0x6ccecfd3165f4d911ba8d196eb5202cc80fef8a8', 'Lottery Instant (current)'),
  ('0x496fce9733e2102102f448c533b84c7a88856e8a', 'Keno V2 (current)'),
  ('0xc2ae080de01108b5c9c0f2c5c86051cfd3d18c00', 'Blackjack V7 (current)'),
  ('0x5e51ecfa38c4254dd100e565620ac6e511723d27', 'Roulette (current)'),
  ('0x64dd1c933027d757212e43725c99bd4402211a1a', 'MerkleClaimLP vault'),

  -- Distribution / batch tooling
  ('0x4ea9064c08dc8b48e4537a0371261ab42e66ebd8', 'MorbiusBatchDisperse'),
  ('0xf3e44a91847ed037c63a7dbe4eba0b51367477a7', 'TournamentPrizeEscrow V6'),

  -- Protocol treasury
  ('0x41682815b05fe6b54a6c0f8813bb99423ee0309d', 'Shop treasury'),

  -- Deployer / ops wallets (hold MORBIUS but are not holder-drop recipients)
  ('0x70444750eedf1b2c9b777cbf096a5919a14895e5', 'Deployer 1 wallet'),
  ('0x2775dd8242c4f589536113475b7c80f42ab4a70a', 'Deployer 2 wallet'),
  ('0xc56606bf62611749ad6bb2a32e2755994c46d7c7', 'Deployer 3 wallet'),

  -- Legacy lottery keeper (not in ALL_DEPLOYMENTS migration 053)
  ('0x4704c7d7eef0968d8343e8574bc2865e612d84ed', 'Legacy lottery contract'),

  -- Blackjack legacy contracts still holding bankroll
  ('0x62cb20cd01f5af1f951b0ec6bbd499143aff906c', 'Blackjack V6 legacy'),
  ('0x73c35b2e4a640fdb253c04ec86aeda49bb50c72b', 'Blackjack V5 legacy'),
  ('0xe9b03e16f5c7d38b37b4f79ca250b714afb6755c', 'Blackjack V4 legacy')
ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason;

-- All LP pair contracts hold MORBIUS as pool liquidity — exclude from holder snapshots.
INSERT INTO merkle_blocklist (address, reason)
SELECT lower(pair_address), 'LP pair: ' || label
FROM merkle_lp_pairs
ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason;
