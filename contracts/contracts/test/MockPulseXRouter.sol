// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal PulseX router stand-in for Hardhat tests. NOT for production.
/// getAmountsOut returns [amountIn, ..., amountIn * rate] where `rate` is MORBIUS per 1 PLS.
contract MockPulseXRouter {
    uint256 public rate;

    constructor(uint256 _rate) {
        rate = _rate;
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn * rate;
    }
}
