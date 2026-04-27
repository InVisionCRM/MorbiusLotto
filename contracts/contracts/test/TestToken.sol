// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Minimal ERC20 used by Hardhat tests. NOT for production.
contract TestToken is ERC20 {
  constructor() ERC20("Test", "TST") {}
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
