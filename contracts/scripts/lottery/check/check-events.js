import hre from "hardhat";

async function main() {
  const PLINKO_ADDRESS = "0x8748EAFE150803fD61cB347589eD20340e30c847";

  console.log("Checking Plinko contract events...");

  const Plinko = await hre.ethers.getContractAt("Plinko", PLINKO_ADDRESS);

  // Get the contract interface
  const iface = Plinko.interface;

  // Find BallDropped event
  const ballDroppedEvent = iface.getEvent("BallDropped");
  console.log("BallDropped event:", ballDroppedEvent);

  if (ballDroppedEvent) {
    // Calculate topic hash
    const signature = iface.getEventTopic(ballDroppedEvent);
    console.log("Event signature:", ballDroppedEvent.format());
    console.log("Topic hash:", signature);

    // Also calculate manually
    const manualTopic = hre.ethers.id(ballDroppedEvent.format());
    console.log("Manual topic hash:", manualTopic);
  }
}

main().catch(console.error);
