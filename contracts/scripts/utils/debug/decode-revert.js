/**
 * Fetch a failed tx and try to get revert reason via eth_call replay.
 * Usage: node scripts/utils/debug/decode-revert.js <txHash>
 */
const RPC = process.env.RPC_URL || "https://rpc.pulsechain.com";

async function main() {
  const txHash = process.argv[2] || "0xb788e75a3644676af9fc573331945be7f01e65f6eb53c0e1de93c7512a58049d";
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: "1", method: "eth_getTransactionByHash", params: [txHash] },
      { jsonrpc: "2.0", id: "2", method: "eth_getTransactionReceipt", params: [txHash] },
    ]),
  });
  const [txResp, receiptResp] = await res.json();
  const tx = txResp.result;
  const receipt = receiptResp.result;
  if (!tx) {
    console.error("Transaction not found");
    process.exit(1);
  }
  console.log("From:", tx.from);
  console.log("To:", tx.to);
  console.log("Value:", tx.value);
  console.log("Block:", receipt?.blockNumber || "pending");
  console.log("Status:", receipt?.status === "0x0" ? "FAILED" : receipt?.status === "0x1" ? "SUCCESS" : "unknown");

  if (receipt?.status !== "0x0") {
    console.log("(No revert — tx succeeded or pending)");
    return;
  }

  // Replay with eth_call to get revert reason (use same block as tx for consistency)
  const callBody = {
    from: tx.from,
    to: tx.to,
    value: tx.value,
    data: tx.input,
    gas: tx.gas || "0x50000",
  };
  const callRes = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "3",
      method: "eth_call",
      params: [callBody, receipt.blockNumber],
    }),
  });
  const callJson = await callRes.json();
  if (callJson.error) {
    const msg = callJson.error.message || "";
    const data = callJson.error.data || "";
    console.log("\nRevert reason (from eth_call):");
    if (msg) console.log("  Message:", msg);
    if (data) {
      console.log("  Data:", data);
      // Decode common Error(string) selector 0x08c379a0
      if (typeof data === "string" && data.startsWith("0x08c379a0")) {
        try {
          const hex = data.slice(10);
          const offset = parseInt(hex.slice(0, 64), 16);
          const len = parseInt(hex.slice(64, 128), 16);
          const strHex = hex.slice(128, 128 + len * 2);
          const str = Buffer.from(strHex, "hex").toString("utf8");
          console.log("  Decoded string:", str);
        } catch (e) {
          console.log("  (could not decode string)");
        }
      }
    }
  } else {
    console.log("(eth_call succeeded; revert may be block-dependent)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
