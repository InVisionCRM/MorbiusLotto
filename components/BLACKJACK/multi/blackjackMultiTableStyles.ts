export const BLACKJACK_MULTI_TABLE_STYLES = `
  /* Desktop: overlapping card margins — tighter for small cards */
  @media (min-width: 641px) {
    .card-overlap-dealer { margin-left: -15px; }
    .card-overlap-player { margin-left: -18px; }
  }
  /* Mobile: card overlap */
  @media (max-width: 640px) {
    .card-overlap-dealer { margin-left: -12px; }
    .card-overlap-player { margin-left: -14px; }
  }
  .card-slide-in {
    animation: cardSlideIn 0.4s ease-out forwards;
  }
  @keyframes cardSlideIn {
    from { opacity: 0; transform: translateX(60px) translateY(-40px); }
    to { opacity: 1; transform: translateX(0) translateY(0); }
  }
  .tip-chip-fly {
    animation: tipChipFly 0.7s ease-in forwards;
  }
  @keyframes tipChipFly {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    60% { opacity: 1; transform: translateY(-80px) scale(0.8); }
    100% { opacity: 0; transform: translateY(-120px) scale(0.3); }
  }
  .animate-fade-in {
    animation: fadeIn 0.3s ease-out forwards;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  /* Card counter active border animation — matches single-player */
  @keyframes cyanGlow {
    0%, 100% {
      box-shadow: 0 0 8px rgba(34, 211, 238, 0.4),
                  0 0 16px rgba(34, 211, 238, 0.2),
                  inset 0 0 8px rgba(34, 211, 238, 0.1);
      border-color: rgba(34, 211, 238, 0.5);
    }
    50% {
      box-shadow: 0 0 16px rgba(34, 211, 238, 0.6),
                  0 0 24px rgba(34, 211, 238, 0.3),
                  inset 0 0 12px rgba(34, 211, 238, 0.15);
      border-color: rgba(34, 211, 238, 0.7);
    }
  }
  .glass-counter {
    background: rgba(0, 0, 0, 0.2);
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    box-shadow:
      inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
  .card-counter-active {
    border: 2px solid rgba(34, 211, 238, 0.6);
    animation: cyanGlow 2s ease-in-out infinite;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      0 0 12px rgba(34, 211, 238, 0.3);
  }
  .card-counter-winner {
    transform: scale(1.25);
  }
  /* Blackjack celebration animation */
  @keyframes blackjackFloat {
    0% { opacity: 0; transform: translateY(20px) scale(0.9); }
    30% { opacity: 1; transform: translateY(-4px) scale(1.02); }
    50% { transform: translateY(0px) scale(1); }
    100% { transform: translateY(0px) scale(1); }
  }
  .blackjack-text-enter {
    animation: blackjackFloat 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .glass-distort-panel {
    background: rgba(255, 255, 255, 0.1);
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: url(#glass-distort-multi) blur(4px);
    -webkit-backdrop-filter: url(#glass-distort-multi) blur(4px);
    box-shadow:
      inset 0 0 10px 3px rgba(255, 255, 255, 0.3),
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
`;

