// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice EIP-2612 permit-capable ERC20 used by Hardhat tests for the *WithPermit entrypoints.
/// NOT for production.
contract TestPermitToken is ERC20, ERC20Permit {
  constructor() ERC20("PermitTest", "PTST") ERC20Permit("PermitTest") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
