# Plinko Game Testing Guide

## Quick Start Commands

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## What to Test

### 🎯 Core Gameplay
- [ ] Ball physics feel realistic and responsive
- [ ] Balls bounce off pegs naturally
- [ ] Collision detection works properly
- [ ] Balls land in buckets consistently

### 🎮 Risk Levels
- [ ] **Green**: Moderate risk (0.5x - 18x multipliers)
- [ ] **Yellow**: Medium risk (0.2x - 55x multipliers)
- [ ] **Red**: High risk (0x - 353x multipliers)

### 🎨 Visual Effects
- [ ] Pegs glow when hit
- [ ] Buckets animate when balls land
- [ ] Color coding matches risk levels
- [ ] History updates correctly

### ⚙️ Controls
- [ ] Wager adjustment (+/- buttons)
- [ ] Risk level selection
- [ ] Auto-drop toggle works
- [ ] Interval adjustment functions

### 💰 Balance System
- [ ] Wager is deducted correctly
- [ ] Wins are calculated properly
- [ ] Balance updates in real-time
- [ ] Insufficient funds handling

## Performance Checks

### 📊 Frame Rate
- [ ] Game runs at 60fps during normal play
- [ ] No lag during auto-drop mode
- [ ] Smooth animations and transitions

### 🔧 Physics
- [ ] No physics glitches or stuck balls
- [ ] Consistent ball behavior
- [ ] Proper collision responses

## Browser Compatibility

Test in these browsers:
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge

## Mobile Testing

- [ ] Responsive design works
- [ ] Touch controls function
- [ ] Performance on mobile devices

## Known Issues to Verify

- [ ] Ball sometimes gets stuck on pegs
- [ ] Physics inconsistencies at high speeds
- [ ] Visual artifacts during rapid auto-drop

## Next Steps After Testing

Once gameplay is polished:
1. **Add sound effects** for collisions and wins
2. **Implement particle effects** for celebrations
3. **Add more visual polish** (animations, transitions)
4. **Prepare for smart contract integration**
5. **Add wallet connectivity** for real transactions</contents>
</xai:function_call">Test the game locally and report any issues!
