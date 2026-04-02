# Hardhat
npx hardhat run scripts/blackjack/deploy/deploy-blackjack-v2.js --network pulsechain

# Node (e.g. keepers)
node scripts/keno/other/keno-keeper-fixed.cjs


In-script usage comments (e.g. npx hardhat run scripts/emergency-withdraw-blackjack.js) still use the old flat paths; behavior is unchanged since you pass the full path to Hardhat. You can later change those comments to the new paths if you want them to match the layout.

