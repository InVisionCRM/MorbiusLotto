// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// ERC20 that burns a percentage on every transfer. Used to prove the escrow
/// credits what it RECEIVED rather than what the funder named. NOT for production.
contract FeeToken is ERC20 {
  uint256 public feeBps; // e.g. 500 = 5%

  constructor(uint256 _feeBps) ERC20("Fee", "FEE") {
    feeBps = _feeBps;
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function _update(address from, address to, uint256 value) internal override {
    if (from == address(0) || to == address(0) || feeBps == 0) {
      super._update(from, to, value);
      return;
    }
    uint256 fee = (value * feeBps) / 10000;
    super._update(from, to, value - fee);
    super._update(from, address(0), fee); // burn the skim
  }
}
