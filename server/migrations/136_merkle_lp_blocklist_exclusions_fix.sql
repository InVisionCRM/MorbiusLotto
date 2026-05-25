-- Align merkle_lp_blocklist with holder exclusions (deployer wallets, protocol contracts, batch tooling).

INSERT INTO merkle_lp_blocklist (address, reason) VALUES
  ('0xb7d4eb5fdfe3d4d3b5c16a44a49948c6ec77c6f1', 'MORBIUS ERC20 token'),
  ('0x6ccecfd3165f4d911ba8d196eb5202cc80fef8a8', 'Lottery Instant (current)'),
  ('0x496fce9733e2102102f448c533b84c7a88856e8a', 'Keno V2 (current)'),
  ('0xc2ae080de01108b5c9c0f2c5c86051cfd3d18c00', 'Blackjack V7 (current)'),
  ('0x5e51ecfa38c4254dd100e565620ac6e511723d27', 'Roulette (current)'),
  ('0x3807f417617e53d4c5c7d7a825a5ce4d105a75d2', 'MerkleClaimMorbius vault'),
  ('0x64dd1c933027d757212e43725c99bd4402211a1a', 'MerkleClaimLP vault'),
  ('0x4ea9064c08dc8b48e4537a0371261ab42e66ebd8', 'MorbiusBatchDisperse'),
  ('0x70444750eedf1b2c9b777cbf096a5919a14895e5', 'Deployer 1 wallet'),
  ('0x2775dd8242c4f589536113475b7c80f42ab4a70a', 'Deployer 2 wallet'),
  ('0xc56606bf62611749ad6bb2a32e2755994c46d7c7', 'Deployer 3 wallet')
ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason;
