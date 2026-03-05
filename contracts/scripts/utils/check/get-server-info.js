// Script to get server information for contract configuration
// Run this to get the server address needed for AUTHORIZED_SERVER

import hre from "hardhat";

async function main() {
  console.log("🔍 Getting Server Configuration Info\n");

  console.log("📋 To configure your Blackjack contract, you need to set the AUTHORIZED_SERVER address.");
  console.log("This should be your deployed server's public IP address or domain.\n");

  console.log("🚀 Server Deployment Options:\n");

  console.log("1. Railway.app (Recommended for quick deployment):");
  console.log("   - Deploy your server to: https://railway.app");
  console.log("   - Get your domain from Railway dashboard");
  console.log("   - Example: https://your-project.up.railway.app");

  console.log("\n2. Vercel (for full-stack deployment):");
  console.log("   - Deploy both frontend and server");
  console.log("   - Use Vercel's domain");

  console.log("\n3. VPS/Cloud Server (AWS/GCP/DigitalOcean):");
  console.log("   - Get your server's public IP");
  console.log("   - Example: http://123.456.789.0:3001");

  console.log("\n📝 Environment Variables to Set:\n");

  console.log("# In your .env file or deployment environment:");
  console.log("AUTHORIZED_SERVER=http://your-server-domain.com");
  console.log("# OR");
  console.log("AUTHORIZED_SERVER=http://123.456.789.0:3001");
  console.log("# OR for Railway:");
  console.log("AUTHORIZED_SERVER=https://your-project.up.railway.app");

  console.log("\n🔧 Configuration Commands:\n");

  console.log("# 1. Set environment variable:");
  console.log("export AUTHORIZED_SERVER=https://your-server-domain.com");

  console.log("\n# 2. Run configuration script:");
  console.log("npx hardhat run scripts/configure-blackjack.js --network pulsechain");

  console.log("\n⚠️  IMPORTANT NOTES:\n");

  console.log("- Your server must be publicly accessible");
  console.log("- Use HTTPS in production (Railway provides this automatically)");
  console.log("- The server must be running for contract settlements to work");
  console.log("- Keep your server address secure - it's authorized to settle games");

  console.log("\n📞 Need help with server deployment?");
  console.log("Contact your hosting provider or check their documentation.");
}

// Run: npx hardhat run scripts/get-server-info.js --network pulsechain

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});