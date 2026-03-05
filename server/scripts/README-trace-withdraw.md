# Tracing failed withdraw transactions

To get the revert reason for a failed `withdrawWithSignature` tx, simulate it with `eth_call`:

```bash
TX=0x7a2f65b39dba192041b97517ade65ae534e45c4faf460086d3a5c16fd4fa8f07
curl -s -X POST "$PULSECHAIN_RPC_URL" -H "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionByHash\",\"params\":[\"$TX\"]}" | jq .
# Then use blockNumber and tx input in eth_call to reproduce the revert.
```

The RPC returns the revert string, e.g. `execution reverted: Invalid signature`.
