// Sources flattened with hardhat v2.27.1 https://hardhat.org
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// File @openzeppelin/contracts/access/Ownable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}

// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// File contracts/SuperStakeLottery6of55.sol

// Original license: SPDX_License_Identifier: MIT

/**
 * @title SuperStakeLottery6of55
 * @notice 6-of-55 number matching lottery with multiple prize brackets, MegaMillions, and HEX overlay jackpots
 * @dev Players pick 6 unique numbers from 1-55. Prizes awarded based on match count (1-6 matches).
 *      - 55% of pot distributed to winners across 6 brackets
 *      - 25% sent to SuperStake stake address
 *      - 20% added to MegaMillions bank (drops every 55th round)
 *      - HEX overlay jackpot triggers on bracket 6 wins
 *      - Free ticket credits awarded to non-winners
 */
contract SuperStakeLottery6of55 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    IERC20 public immutable pSSH_TOKEN;
    IERC20 public immutable HEX_TOKEN;

    address public constant SUPERSTAKE_HEX_STAKE_ADDRESS = 0xdC48205df8aF83c97de572241bB92DB45402Aa0E;
    address public constant HEX_TOKEN_ADDRESS = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;

    uint256 public constant TICKET_PRICE = 1e9; // 1 pSSH (9 decimals)
    uint8 public constant NUMBERS_PER_TICKET = 6;
    uint8 public constant MIN_NUMBER = 1;
    uint8 public constant MAX_NUMBER = 55;
    uint256 public constant MEGA_MILLIONS_INTERVAL = 55; // Every 55th round

    // Distribution percentages (basis points, 1% = 100 bp)
    uint256 public constant WINNERS_POOL_PCT = 5500; // 55%
    uint256 public constant STAKE_ALLOCATION_PCT = 2500; // 25%
    uint256 public constant MEGA_BANK_PCT = 2000; // 20%
    uint256 public constant TOTAL_PCT = 10000; // 100%

    // Bracket percentages (of roundPot, in basis points)
    // Bracket 1: 2%, Bracket 2: 4%, Bracket 3: 6%, Bracket 4: 8%, Bracket 5: 10%, Bracket 6: 25%
    uint256[6] public BRACKET_PERCENTAGES = [200, 400, 600, 800, 1000, 2500];

    // Leftover split for high brackets (5 & 6)
    uint256 public constant LEFTOVER_TO_FREE_TICKETS_PCT = 4000; // 40%
    uint256 public constant LEFTOVER_TO_MEGA_PCT = 6000; // 60%

    // HEX overlay split when bracket 6 hit
    uint256 public constant HEX_TO_WINNERS_PCT = 7000; // 70%
    uint256 public constant HEX_TO_STAKE_PCT = 3000; // 30%

    // Randomness delay (configurable for testing)
    uint256 public blockDelay = 5; // Use blockhash N blocks in the future

    // ============ Enums ============

    enum RoundState { OPEN, LOCKED, FINALIZED }

    // ============ Structs ============

    struct Ticket {
        address player;
        uint8[6] numbers; // Sorted ascending
        uint256 ticketId;
        bool isFreeTicket;
    }

    struct BracketWinners {
        uint256 matchCount; // 1-6
        uint256 poolAmount; // pSSH allocated to this bracket
        uint256 winnerCount;
        uint256 payoutPerWinner;
        uint256[] winningTicketIds;
    }

    struct Round {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 closingBlock;
        uint8[6] winningNumbers; // Set when finalized
        uint256 totalPsshCollected;
        uint256 totalTickets;
        uint256 uniquePlayers;
        BracketWinners[6] brackets; // Index 0 = bracket 1 (1 match), index 5 = bracket 6 (6 matches)
        uint256 megaBankContribution;
        bool isMegaMillionsRound;
        bool hexOverlayTriggered;
        uint256 hexPrizeAmount;
        RoundState state;
    }

    // ============ State Variables ============

    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    RoundState public currentRoundState;

    // Banks
    uint256 public megaPsshBank;
    uint256 public freeTicketReserve;
    uint256 public hexBankTracked; // Track HEX separately for accounting

    // Current round tracking
    uint256 public currentRoundTotalPssh;
    uint256 public currentRoundTotalTickets;
    uint256 public nextTicketId; // Global ticket ID counter

    // Mappings
    mapping(uint256 => Round) public rounds; // roundId => Round
    mapping(uint256 => Ticket[]) public roundTickets; // roundId => tickets array
    mapping(uint256 => mapping(address => uint256[])) public playerTicketIds; // roundId => player => ticketIds
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound; // roundId => player => hasEntered
    mapping(address => uint256) public freeTicketCredits; // player => credits for next round
    mapping(uint256 => address[]) public roundPlayers; // roundId => unique players

    // Claiming system (to avoid gas limit on distribution)
    mapping(uint256 => mapping(address => uint256)) public claimableWinnings; // roundId => player => amount
    mapping(uint256 => mapping(address => bool)) public hasClaimed; // roundId => player => claimed

    // ============ Events ============

    event RoundStarted(
        uint256 indexed roundId,
        uint256 startTime,
        uint256 endTime,
        bool isMegaMillionsRound
    );

    event TicketsPurchased(
        address indexed player,
        uint256 indexed roundId,
        uint256 ticketCount,
        uint256 freeTicketsUsed,
        uint256 psshSpent
    );

    event RoundLocked(
        uint256 indexed roundId,
        uint256 closingBlock,
        uint256 totalTickets,
        uint256 totalPssh
    );

    event RoundFinalized(
        uint256 indexed roundId,
        uint8[6] winningNumbers,
        uint256 totalPssh,
        uint256 totalTickets,
        uint256 uniquePlayers
    );

    event BracketResults(
        uint256 indexed roundId,
        uint256 bracket,
        uint256 winnerCount,
        uint256 poolAmount,
        uint256 payoutPerWinner
    );

    event MegaMillionsTriggered(
        uint256 indexed roundId,
        uint256 bankAmount,
        uint256 toBracket6,
        uint256 toBracket5
    );

    event HexOverlayTriggered(
        uint256 indexed roundId,
        uint256 hexAmount,
        uint256 toWinners,
        uint256 toStake
    );

    event WinningsClaimed(
        address indexed player,
        uint256 indexed roundId,
        uint256 amount
    );

    event FreeTicketsCredited(
        address indexed player,
        uint256 credits
    );

    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);

    // ============ Constructor ============

    /**
     * @notice Initialize the lottery contract
     * @param _psshTokenAddress Address of SuperStake (pSSH) token
     * @param _initialRoundDuration Duration of each round in seconds
     */
    constructor(
        address _psshTokenAddress,
        uint256 _initialRoundDuration
    ) Ownable(msg.sender) {
        require(_psshTokenAddress != address(0), "Invalid pSSH address");
        require(_initialRoundDuration > 0, "Duration must be positive");

        pSSH_TOKEN = IERC20(_psshTokenAddress);
        HEX_TOKEN = IERC20(HEX_TOKEN_ADDRESS);
        roundDuration = _initialRoundDuration;

        // Start first round
        _startNewRound();
    }

    // ============ Public Functions ============

    /**
     * @notice Buy lottery tickets with user-selected numbers
     * @param ticketNumbers Array of tickets, each ticket is 6 numbers (1-55, unique per ticket)
     * @dev If round expired, automatically finalizes and starts new round
     *      Handles free ticket credits automatically
     */
    function buyTickets(uint8[6][] calldata ticketNumbers) external nonReentrant {
        // If round expired, finalize and start new
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");

        uint256 freeTicketsToUse = 0;
        uint256 ticketsToBuy = ticketNumbers.length;

        // Apply free ticket credits
        if (freeTicketCredits[msg.sender] > 0) {
            freeTicketsToUse = freeTicketCredits[msg.sender] < ticketsToBuy
                ? freeTicketCredits[msg.sender]
                : ticketsToBuy;
            freeTicketCredits[msg.sender] -= freeTicketsToUse;
        }

        uint256 ticketsToPayFor = ticketsToBuy - freeTicketsToUse;
        uint256 psshRequired = ticketsToPayFor * TICKET_PRICE;

        // Transfer pSSH for paid tickets
        if (psshRequired > 0) {
            pSSH_TOKEN.safeTransferFrom(msg.sender, address(this), psshRequired);
            currentRoundTotalPssh += psshRequired;
        }

        // Validate and store tickets
        for (uint256 i = 0; i < ticketNumbers.length; i++) {
            _validateTicket(ticketNumbers[i]);

            Ticket memory ticket = Ticket({
                player: msg.sender,
                numbers: _sortNumbers(ticketNumbers[i]),
                ticketId: nextTicketId,
                isFreeTicket: i < freeTicketsToUse
            });

            roundTickets[currentRoundId].push(ticket);
            playerTicketIds[currentRoundId][msg.sender].push(nextTicketId);
            nextTicketId++;
        }

        // Track unique players
        if (!hasEnteredRound[currentRoundId][msg.sender]) {
            roundPlayers[currentRoundId].push(msg.sender);
            hasEnteredRound[currentRoundId][msg.sender] = true;
        }

        currentRoundTotalTickets += ticketNumbers.length;

        emit TicketsPurchased(
            msg.sender,
            currentRoundId,
            ticketNumbers.length,
            freeTicketsToUse,
            psshRequired
        );
    }

    /**
     * @notice Manually finalize the current round (if time expired)
     * @dev Can be called by anyone once round duration elapsed
     */
    function finalizeRound() external nonReentrant {
        require(_isRoundExpired(), "Round not expired");
        require(currentRoundState == RoundState.OPEN, "Round already finalized");

        _finalizeRound();
        _startNewRound();
    }

    /**
     * @notice Claim winnings from a specific round
     * @param roundId The round to claim from
     */
    function claimWinnings(uint256 roundId) external nonReentrant {
        require(rounds[roundId].state == RoundState.FINALIZED, "Round not finalized");
        require(!hasClaimed[roundId][msg.sender], "Already claimed");
        require(claimableWinnings[roundId][msg.sender] > 0, "Nothing to claim");

        uint256 amount = claimableWinnings[roundId][msg.sender];
        hasClaimed[roundId][msg.sender] = true;

        pSSH_TOKEN.safeTransfer(msg.sender, amount);

        emit WinningsClaimed(msg.sender, roundId, amount);
    }

    /**
     * @notice Update round duration (owner only)
     * @param _newDuration New duration in seconds
     */
    function updateRoundDuration(uint256 _newDuration) external onlyOwner {
        require(_newDuration > 0, "Duration must be positive");
        uint256 oldDuration = roundDuration;
        roundDuration = _newDuration;
        emit RoundDurationUpdated(oldDuration, _newDuration);
    }

    /**
     * @notice Update block delay for randomness (owner only, for testing)
     * @param _newDelay New block delay
     */
    function updateBlockDelay(uint256 _newDelay) external onlyOwner {
        blockDelay = _newDelay;
    }

    /**
     * @notice Emergency sweep of HEX tokens to stake address
     */
    function sweepHexTokens() external nonReentrant {
        _forwardHexIfAny();
    }

    // ============ View Functions ============

    /**
     * @notice Get current round information
     */
    function getCurrentRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPssh,
        uint256 totalTickets,
        uint256 uniquePlayers,
        uint256 timeRemaining,
        bool isMegaMillionsRound,
        RoundState state
    ) {
        roundId = currentRoundId;
        startTime = currentRoundStartTime;
        endTime = currentRoundStartTime + roundDuration;
        totalPssh = currentRoundTotalPssh;
        totalTickets = currentRoundTotalTickets;
        uniquePlayers = roundPlayers[currentRoundId].length;

        if (block.timestamp >= endTime) {
            timeRemaining = 0;
        } else {
            timeRemaining = endTime - block.timestamp;
        }

        isMegaMillionsRound = (currentRoundId % MEGA_MILLIONS_INTERVAL == 0);
        state = currentRoundState;
    }

    /**
     * @notice Get player's tickets for a round
     */
    function getPlayerTickets(uint256 roundId, address player) external view returns (Ticket[] memory) {
        uint256[] memory ticketIds = playerTicketIds[roundId][player];
        Ticket[] memory tickets = new Ticket[](ticketIds.length);

        Ticket[] storage allTickets = roundTickets[roundId];
        uint256 foundCount = 0;

        for (uint256 i = 0; i < allTickets.length && foundCount < ticketIds.length; i++) {
            if (allTickets[i].player == player) {
                tickets[foundCount] = allTickets[i];
                foundCount++;
            }
        }

        return tickets;
    }

    /**
     * @notice Get round history
     */
    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    /**
     * @notice Get MegaMillions bank balance
     */
    function getMegaMillionsBank() external view returns (uint256) {
        return megaPsshBank;
    }

    /**
     * @notice Get HEX jackpot balance
     */
    function getHexJackpot() external view returns (uint256) {
        return HEX_TOKEN.balanceOf(address(this));
    }

    /**
     * @notice Get player's free ticket credits
     */
    function getFreeTicketCredits(address player) external view returns (uint256) {
        return freeTicketCredits[player];
    }

    /**
     * @notice Get player's claimable winnings for a round
     */
    function getClaimableWinnings(uint256 roundId, address player) external view returns (uint256) {
        return claimableWinnings[roundId][player];
    }

    // ============ Internal Functions ============

    /**
     * @dev Validate ticket numbers
     */
    function _validateTicket(uint8[6] memory numbers) private pure {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            require(numbers[i] >= MIN_NUMBER && numbers[i] <= MAX_NUMBER, "Number out of range");

            // Check for duplicates
            for (uint256 j = i + 1; j < NUMBERS_PER_TICKET; j++) {
                require(numbers[i] != numbers[j], "Duplicate numbers");
            }
        }
    }

    /**
     * @dev Sort numbers in ascending order (bubble sort, efficient for 6 elements)
     */
    function _sortNumbers(uint8[6] memory numbers) private pure returns (uint8[6] memory) {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET - 1; i++) {
            for (uint256 j = 0; j < NUMBERS_PER_TICKET - 1 - i; j++) {
                if (numbers[j] > numbers[j + 1]) {
                    (numbers[j], numbers[j + 1]) = (numbers[j + 1], numbers[j]);
                }
            }
        }
        return numbers;
    }

    /**
     * @dev Check if current round has expired
     */
    function _isRoundExpired() private view returns (bool) {
        return block.timestamp >= currentRoundStartTime + roundDuration;
    }

    /**
     * @dev Start a new round
     */
    function _startNewRound() private {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        currentRoundState = RoundState.OPEN;
        currentRoundTotalPssh = 0;
        currentRoundTotalTickets = 0;

        bool isMegaMillions = (currentRoundId % MEGA_MILLIONS_INTERVAL == 0);

        emit RoundStarted(
            currentRoundId,
            currentRoundStartTime,
            currentRoundStartTime + roundDuration,
            isMegaMillions
        );
    }

    /**
     * @dev Finalize the current round
     */
    function _finalizeRound() private {
        require(currentRoundState == RoundState.OPEN, "Round not open");

        uint256 finalizingRoundId = currentRoundId;
        uint256 closingBlock = block.number;

        // Lock the round
        currentRoundState = RoundState.LOCKED;

        emit RoundLocked(
            finalizingRoundId,
            closingBlock,
            currentRoundTotalTickets,
            currentRoundTotalPssh
        );

        // Handle empty round immediately
        if (currentRoundTotalTickets == 0) {
            _handleEmptyRound(finalizingRoundId);
            return;
        }

        // Wait for block delay for randomness
        require(block.number >= closingBlock + blockDelay, "Wait for randomness");

        // Generate winning numbers
        uint8[6] memory winningNumbers = _generateWinningNumbers(finalizingRoundId, closingBlock);

        // Calculate matches and distribute to brackets
        _calculateBrackets(finalizingRoundId, winningNumbers);

        // Handle MegaMillions if applicable
        bool isMegaMillions = (finalizingRoundId % MEGA_MILLIONS_INTERVAL == 0);
        if (isMegaMillions) {
            _handleMegaMillions(finalizingRoundId);
        }

        // Distribute prizes
        _distributePrizes(finalizingRoundId);

        // Check for HEX overlay (bracket 6 winners)
        _checkHexOverlay(finalizingRoundId);

        // Award free tickets to non-winners
        _awardFreeTickets(finalizingRoundId);

        // Mark as finalized
        currentRoundState = RoundState.FINALIZED;
        rounds[finalizingRoundId].state = RoundState.FINALIZED;

        emit RoundFinalized(
            finalizingRoundId,
            winningNumbers,
            currentRoundTotalPssh,
            currentRoundTotalTickets,
            roundPlayers[finalizingRoundId].length
        );
    }

    /**
     * @dev Handle empty round (no tickets sold)
     */
    function _handleEmptyRound(uint256 roundId) private {
        rounds[roundId] = Round({
            roundId: roundId,
            startTime: currentRoundStartTime,
            endTime: block.timestamp,
            closingBlock: block.number,
            winningNumbers: [0, 0, 0, 0, 0, 0],
            totalPsshCollected: 0,
            totalTickets: 0,
            uniquePlayers: 0,
            brackets: [
                BracketWinners(1, 0, 0, 0, new uint256[](0)),
                BracketWinners(2, 0, 0, 0, new uint256[](0)),
                BracketWinners(3, 0, 0, 0, new uint256[](0)),
                BracketWinners(4, 0, 0, 0, new uint256[](0)),
                BracketWinners(5, 0, 0, 0, new uint256[](0)),
                BracketWinners(6, 0, 0, 0, new uint256[](0))
            ],
            megaBankContribution: 0,
            isMegaMillionsRound: (roundId % MEGA_MILLIONS_INTERVAL == 0),
            hexOverlayTriggered: false,
            hexPrizeAmount: 0,
            state: RoundState.FINALIZED
        });

        currentRoundState = RoundState.FINALIZED;
    }

    /**
     * @dev Generate 6 unique winning numbers (1-55)
     */
    function _generateWinningNumbers(uint256 roundId, uint256 closingBlock) private view returns (uint8[6] memory) {
        uint256 targetBlock = closingBlock + blockDelay;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(targetBlock),
            blockhash(closingBlock),
            roundId,
            currentRoundTotalPssh,
            currentRoundTotalTickets,
            block.timestamp
        )));

        uint8[6] memory numbers;
        bool[56] memory used; // Index 0 unused, 1-55 used

        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            uint8 num;
            uint256 attempts = 0;

            do {
                seed = uint256(keccak256(abi.encodePacked(seed, i, attempts)));
                num = uint8((seed % MAX_NUMBER) + 1);
                attempts++;
            } while (used[num] && attempts < 100);

            require(!used[num], "RNG failed");
            numbers[i] = num;
            used[num] = true;
        }

        return _sortNumbers(numbers);
    }

    /**
     * @dev Count how many numbers match between ticket and winning numbers
     */
    function _countMatches(uint8[6] memory ticket, uint8[6] memory winning) private pure returns (uint8) {
        uint8 matches = 0;
        uint256 wi = 0;

        for (uint256 ti = 0; ti < NUMBERS_PER_TICKET && wi < NUMBERS_PER_TICKET; ti++) {
            while (wi < NUMBERS_PER_TICKET && winning[wi] < ticket[ti]) {
                wi++;
            }
            if (wi < NUMBERS_PER_TICKET && winning[wi] == ticket[ti]) {
                matches++;
                wi++;
            }
        }

        return matches;
    }

    /**
     * @dev Calculate bracket results
     */
    function _calculateBrackets(uint256 roundId, uint8[6] memory winningNumbers) private {
        Ticket[] storage tickets = roundTickets[roundId];

        // Initialize bracket counts
        uint256[7] memory bracketCounts; // Index 0 unused, 1-6 for brackets
        uint256[][7] memory bracketTicketIds; // Store ticket IDs per bracket

        for (uint256 i = 1; i <= 6; i++) {
            bracketTicketIds[i] = new uint256[](tickets.length);
        }

        // Count matches for all tickets
        for (uint256 i = 0; i < tickets.length; i++) {
            uint8 matches = _countMatches(tickets[i].numbers, winningNumbers);

            if (matches > 0) {
                bracketTicketIds[matches][bracketCounts[matches]] = tickets[i].ticketId;
                bracketCounts[matches]++;
            }
        }

        // Calculate payouts per bracket
        for (uint256 bracket = 1; bracket <= 6; bracket++) {
            uint256 bracketPool = (currentRoundTotalPssh * BRACKET_PERCENTAGES[bracket - 1]) / TOTAL_PCT;

            if (bracketCounts[bracket] > 0) {
                // Resize winning ticket IDs array
                uint256[] memory winningIds = new uint256[](bracketCounts[bracket]);
                for (uint256 i = 0; i < bracketCounts[bracket]; i++) {
                    winningIds[i] = bracketTicketIds[bracket][i];
                }

                rounds[roundId].brackets[bracket - 1] = BracketWinners({
                    matchCount: bracket,
                    poolAmount: bracketPool,
                    winnerCount: bracketCounts[bracket],
                    payoutPerWinner: bracketPool / bracketCounts[bracket],
                    winningTicketIds: winningIds
                });
            } else {
                // No winners in this bracket - handle leftover
                if (bracket >= 5) {
                    // Brackets 5 & 6: split leftover
                    uint256 toReserve = (bracketPool * LEFTOVER_TO_FREE_TICKETS_PCT) / TOTAL_PCT;
                    uint256 toMega = bracketPool - toReserve;
                    freeTicketReserve += toReserve;
                    megaPsshBank += toMega;
                }

                rounds[roundId].brackets[bracket - 1] = BracketWinners({
                    matchCount: bracket,
                    poolAmount: bracketPool,
                    winnerCount: 0,
                    payoutPerWinner: 0,
                    winningTicketIds: new uint256[](0)
                });
            }

            emit BracketResults(
                roundId,
                bracket,
                bracketCounts[bracket],
                bracketPool,
                rounds[roundId].brackets[bracket - 1].payoutPerWinner
            );
        }

        // Store winning numbers
        rounds[roundId].winningNumbers = winningNumbers;
        rounds[roundId].totalPsshCollected = currentRoundTotalPssh;
        rounds[roundId].totalTickets = currentRoundTotalTickets;
        rounds[roundId].uniquePlayers = roundPlayers[roundId].length;
    }

    /**
     * @dev Distribute prizes to winners (via claimable system)
     */
    function _distributePrizes(uint256 roundId) private {
        Ticket[] storage tickets = roundTickets[roundId];

        // Calculate claimable amounts per player
        for (uint256 bracket = 0; bracket < 6; bracket++) {
            BracketWinners storage bw = rounds[roundId].brackets[bracket];

            if (bw.winnerCount > 0) {
                for (uint256 i = 0; i < bw.winningTicketIds.length; i++) {
                    uint256 ticketId = bw.winningTicketIds[i];

                    // Find ticket and credit player
                    for (uint256 j = 0; j < tickets.length; j++) {
                        if (tickets[j].ticketId == ticketId) {
                            claimableWinnings[roundId][tickets[j].player] += bw.payoutPerWinner;
                            break;
                        }
                    }
                }
            }
        }

        // Send 25% to stake address
        uint256 stakeAllocation = (currentRoundTotalPssh * STAKE_ALLOCATION_PCT) / TOTAL_PCT;
        if (stakeAllocation > 0) {
            pSSH_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, stakeAllocation);
        }

        // Add 20% to MegaMillions bank
        uint256 megaContribution = (currentRoundTotalPssh * MEGA_BANK_PCT) / TOTAL_PCT;
        megaPsshBank += megaContribution;
        rounds[roundId].megaBankContribution = megaContribution;
    }

    /**
     * @dev Handle MegaMillions (every 55th round)
     */
    function _handleMegaMillions(uint256 roundId) private {
        if (megaPsshBank == 0) return;

        uint256 toBracket6 = (megaPsshBank * 80) / 100;
        uint256 toBracket5 = megaPsshBank - toBracket6;

        // Add to bracket pools
        rounds[roundId].brackets[5].poolAmount += toBracket6;
        rounds[roundId].brackets[4].poolAmount += toBracket5;

        // Recalculate payouts if there are winners
        if (rounds[roundId].brackets[5].winnerCount > 0) {
            rounds[roundId].brackets[5].payoutPerWinner =
                rounds[roundId].brackets[5].poolAmount / rounds[roundId].brackets[5].winnerCount;
        }

        if (rounds[roundId].brackets[4].winnerCount > 0) {
            rounds[roundId].brackets[4].payoutPerWinner =
                rounds[roundId].brackets[4].poolAmount / rounds[roundId].brackets[4].winnerCount;
        }

        rounds[roundId].isMegaMillionsRound = true;

        emit MegaMillionsTriggered(roundId, megaPsshBank, toBracket6, toBracket5);

        // Reset bank
        megaPsshBank = 0;
    }

    /**
     * @dev Check and handle HEX overlay if bracket 6 hit
     */
    function _checkHexOverlay(uint256 roundId) private {
        if (rounds[roundId].brackets[5].winnerCount > 0) {
            uint256 hexBalance = HEX_TOKEN.balanceOf(address(this));

            if (hexBalance > 0) {
                uint256 toWinners = (hexBalance * HEX_TO_WINNERS_PCT) / TOTAL_PCT;
                uint256 toStake = hexBalance - toWinners;

                // Distribute HEX to bracket 6 winners (via claimable - would need separate claiming)
                // For now, send directly
                if (toWinners > 0) {
                    Ticket[] storage tickets = roundTickets[roundId];
                    BracketWinners storage bracket6 = rounds[roundId].brackets[5];
                    uint256 hexPerWinner = toWinners / bracket6.winnerCount;

                    for (uint256 i = 0; i < bracket6.winningTicketIds.length; i++) {
                        uint256 ticketId = bracket6.winningTicketIds[i];

                        for (uint256 j = 0; j < tickets.length; j++) {
                            if (tickets[j].ticketId == ticketId) {
                                HEX_TOKEN.safeTransfer(tickets[j].player, hexPerWinner);
                                break;
                            }
                        }
                    }
                }

                if (toStake > 0) {
                    HEX_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, toStake);
                }

                rounds[roundId].hexOverlayTriggered = true;
                rounds[roundId].hexPrizeAmount = toWinners;

                emit HexOverlayTriggered(roundId, hexBalance, toWinners, toStake);
            }
        }
    }

    /**
     * @dev Award free tickets to non-winners
     */
    function _awardFreeTickets(uint256 roundId) private {
        address[] storage players = roundPlayers[roundId];
        Ticket[] storage tickets = roundTickets[roundId];

        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            bool wonAnyBracket = false;

            // Check if player won in any bracket
            for (uint256 j = 0; j < tickets.length; j++) {
                if (tickets[j].player == player) {
                    uint8 matches = _countMatches(tickets[j].numbers, rounds[roundId].winningNumbers);
                    if (matches > 0) {
                        wonAnyBracket = true;
                        break;
                    }
                }
            }

            // If didn't win anything, award 1 free ticket
            if (!wonAnyBracket && freeTicketReserve >= TICKET_PRICE) {
                freeTicketCredits[player]++;
                freeTicketReserve -= TICKET_PRICE;
                emit FreeTicketsCredited(player, 1);
            }
        }
    }

    /**
     * @dev Forward any HEX balance to stake address
     */
    function _forwardHexIfAny() private {
        uint256 hexBalance = HEX_TOKEN.balanceOf(address(this));
        if (hexBalance > 0) {
            HEX_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, hexBalance);
        }
    }
}
