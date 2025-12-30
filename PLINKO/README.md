# Neon Plinko Adventure

A physics-based Plinko game built with React, TypeScript, and Matter.js. This project implements a fully interactive Plinko board with realistic physics simulation, multiple risk levels, and dynamic scoring multipliers.

## Features

- **Realistic Physics**: Built with Matter.js for accurate ball physics and collision detection
- **Risk Levels**: Three difficulty tiers (Green, Yellow, Red) with different payout multipliers
- **Dynamic Animations**: Smooth peg glow effects and bucket animations on collision
- **Responsive Design**: Adapts to different screen sizes with proper scaling
- **Performance Optimized**: Efficient rendering and physics calculations

## Technology Stack

- **Frontend**: React 19 + TypeScript
- **Physics Engine**: Matter.js
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (planned for future integration)
- **Smart Contracts**: Solidity (planned for blockchain integration)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd neon-plinko-adventure
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Game Mechanics

### Risk Levels
- **Green**: Lower risk, moderate multipliers (0.5x - 2.0x)
- **Yellow**: Medium risk, higher multipliers (1.0x - 5.0x)
- **Red**: High risk, highest multipliers (2.0x - 10.0x)

### How to Play
1. Select your risk level and ball count
2. Click "Drop Ball" to release a ball into the Plinko board
3. Watch as physics guide the ball through the pegs
4. Score points based on which bucket the ball lands in

## Project Structure

```
src/
├── components/
│   ├── PlinkoGame.tsx     # Main game component with physics
│   ├── Controls.tsx       # Game controls and UI
│   └── ScoreDisplay.tsx   # Score and multiplier display
├── constants.ts           # Game configuration and multipliers
├── types.ts              # TypeScript type definitions
└── App.tsx               # Main application component
```

## Future Development

- **Smart Contract Integration**: Connect to Solidity contracts on blockchain
- **Token Rewards**: Implement cryptocurrency payouts
- **Multiplayer**: Real-time multiplayer functionality
- **Enhanced UI**: Advanced animations and visual effects
- **Mobile Optimization**: Touch controls and mobile-specific features

## Contributing

This project is currently in active development. Focus is on perfecting the core Plinko gameplay mechanics before blockchain integration.

## License

[Add your license here]
