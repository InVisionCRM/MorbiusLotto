// Sources flattened with hardhat v2.27.1 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.28;

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

pragma solidity ^0.8.28;

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

pragma solidity >=0.4.16;

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

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

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

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


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

pragma solidity ^0.8.28;


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

pragma solidity ^0.8.28;

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


// File contracts/SuperStakeLotterySimple.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.28;




/**
 * @title SuperStakeLotterySimple
 * @notice Simplified lottery - just send PSSH tokens directly to contract to buy tickets
 * @dev Users send PSSH tokens directly, contract automatically enters them into lottery
 */
contract SuperStakeLotterySimple is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    IERC20 public immutable superstakeToken;
    address public constant SUPERSTAKE_HEX_STAKE_ADDRESS = 0xdC48205df8aF83c97de572241bB92DB45402Aa0E;
    address public constant HEX_TOKEN_ADDRESS = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;
    uint256 public constant TOKENS_PER_TICKET = 1 * 10**9; // 1 token = 1 ticket (9 decimals for PSSH)

    // Distribution percentages (in basis points: 1% = 100 bp)
    uint256 public constant PRIZE_PERCENTAGE = 6000; // 60%
    uint256 public constant ROLLOVER_PERCENTAGE = 2000; // 20%
    uint256 public constant BURN_PERCENTAGE = 2000; // 20%
    uint256 public constant TOTAL_PERCENTAGE = 10000; // 100%

    // Lottery state
    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    uint256 public currentRoundTotalTokens;
    uint256 public rolloverAmount;

    // Current round participants
    address[] public currentRoundPlayers;
    mapping(address => uint256) public currentRoundTickets;
    mapping(address => bool) private hasEnteredCurrentRound;

    // Historical data
    struct RoundHistory {
        uint256 roundId;
        uint256 totalTokens;
        uint256 totalTickets;
        uint256 participantCount;
        address winner;
        uint256 prizeAmount;
        uint256 burnAmount;
        uint256 rolloverAmount;
        uint256 endTime;
    }

    mapping(uint256 => RoundHistory) public rounds;

    // Events
    event TicketsPurchased(
        address indexed player,
        uint256 indexed roundId,
        uint256 tokensDeposited,
        uint256 ticketsReceived
    );

    event RoundConcluded(
        uint256 indexed roundId,
        address indexed winner,
        uint256 prizeAmount,
        uint256 burnAmount,
        uint256 rolloverAmount,
        uint256 totalParticipants,
        uint256 totalTickets
    );

    event RoundStarted(
        uint256 indexed roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 initialRollover
    );

    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);

    /**
     * @notice Initialize the lottery contract
     * @param _tokenAddress Address of SuperStake token
     * @param _initialRoundDuration Duration of each round in seconds
     */
    constructor(
        address _tokenAddress,
        uint256 _initialRoundDuration
    ) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
        require(_initialRoundDuration > 0, "Duration must be positive");

        superstakeToken = IERC20(_tokenAddress);
        roundDuration = _initialRoundDuration;

        // Start first round
        _startNewRound();
    }

    /**
     * @notice Receive function - automatically called when PSSH tokens are sent
     * @dev This won't work for token transfers, keeping for native token protection
     */
    receive() external payable {
        revert("Send PSSH tokens using transfer, not native tokens");
    }

    /**
     * @notice Manual ticket purchase (approve + call this function)
     * @param amount Amount of tokens to deposit
     */
    function buyTickets(uint256 amount) external nonReentrant {
        // If the round already expired, conclude it and start the next one automatically
        if (_roundExpired()) {
            _concludeRoundAndStart();
        }

        require(block.timestamp < currentRoundStartTime + roundDuration, "Round ended");
        require(amount > 0, "Amount must be greater than 0");

        uint256 balanceBefore = superstakeToken.balanceOf(address(this));

        // Transfer tokens from user to contract
        superstakeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 balanceAfter = superstakeToken.balanceOf(address(this));
        uint256 tokensReceived = balanceAfter - balanceBefore;

        _processTicketPurchase(msg.sender, tokensReceived);
    }

    /**
     * @notice Process ticket purchase for a user
     * @param player Address of the player
     * @param tokensReceived Amount of tokens received
     */
    function _processTicketPurchase(address player, uint256 tokensReceived) private {
        require(tokensReceived > 0, "No tokens received");

        // Calculate tickets (using 9 decimal precision for PSSH)
        uint256 ticketsEarned = (tokensReceived * 10**9) / TOKENS_PER_TICKET;

        require(ticketsEarned > 0, "Insufficient tokens for ticket");

        // Add player to round if first time
        if (!hasEnteredCurrentRound[player]) {
            currentRoundPlayers.push(player);
            hasEnteredCurrentRound[player] = true;
        }

        // Update player tickets and round total
        currentRoundTickets[player] += ticketsEarned;
        currentRoundTotalTokens += tokensReceived;

        emit TicketsPurchased(player, currentRoundId, tokensReceived, ticketsEarned);
    }

    /**
     * @notice Conclude current round and start new one
     * @dev Can be called by anyone once round duration has elapsed
     */
    function concludeRound() external nonReentrant {
        _concludeRoundAndStart();
    }

    /**
     * @notice Sweep any HEX accidentally sent to this contract to the staking address
     */
    function sweepHexTokens() external nonReentrant {
        _forwardHexIfAny();
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
     * @notice Get current round information
     */
    function getRoundInfo()
        external
        view
        returns (
            uint256 roundId,
            uint256 startTime,
            uint256 endTime,
            uint256 totalTokens,
            uint256 participantCount,
            uint256 timeRemaining
        )
    {
        roundId = currentRoundId;
        startTime = currentRoundStartTime;
        endTime = currentRoundStartTime + roundDuration;
        totalTokens = currentRoundTotalTokens + rolloverAmount;
        participantCount = currentRoundPlayers.length;

        if (block.timestamp >= endTime) {
            timeRemaining = 0;
        } else {
            timeRemaining = endTime - block.timestamp;
        }
    }

    /**
     * @notice Get player's tickets in current round
     */
    function getPlayerTickets(address player) external view returns (uint256 tickets) {
        return currentRoundTickets[player];
    }

    /**
     * @notice Get historical round data
     */
    function getRoundHistory(uint256 roundId) external view returns (RoundHistory memory) {
        return rounds[roundId];
    }

    /**
     * @notice Get all players in current round
     */
    function getCurrentPlayers() external view returns (address[] memory) {
        return currentRoundPlayers;
    }

    /**
     * @notice Get total tickets in current round
     */
    function getCurrentTotalTickets() external view returns (uint256) {
        return _calculateTotalTickets();
    }

    /**
     * @dev Start a new round
     */
    function _startNewRound() private {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        currentRoundTotalTokens = 0;

        // Clear previous round data
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            address player = currentRoundPlayers[i];
            delete currentRoundTickets[player];
            delete hasEnteredCurrentRound[player];
        }
        delete currentRoundPlayers;

        emit RoundStarted(
            currentRoundId,
            currentRoundStartTime,
            currentRoundStartTime + roundDuration,
            rolloverAmount
        );
    }

    /**
     * @dev Check whether the current round has expired
     */
    function _roundExpired() private view returns (bool) {
        return block.timestamp >= currentRoundStartTime + roundDuration;
    }

    /**
     * @dev Conclude the current round and start the next one
     */
    function _concludeRoundAndStart() private {
        require(_roundExpired(), "Round not ended");

        uint256 endingRoundId = currentRoundId;
        uint256 totalTokens = currentRoundTotalTokens + rolloverAmount;

        // Handle empty round
        if (currentRoundPlayers.length == 0) {
            rounds[endingRoundId] = RoundHistory({
                roundId: endingRoundId,
                totalTokens: totalTokens,
                totalTickets: 0,
                participantCount: 0,
                winner: address(0),
                prizeAmount: 0,
                burnAmount: 0,
                rolloverAmount: totalTokens,
                endTime: block.timestamp
            });

            emit RoundConcluded(
                endingRoundId,
                address(0),
                0,
                0,
                totalTokens,
                0,
                0
            );

            // Rollover increases for next round
            rolloverAmount = totalTokens;
            _startNewRound();
            _forwardHexIfAny();
            return;
        }

        // Select winner using randomness
        address winner = _selectWinner();

        // Calculate distributions
        uint256 prizeAmount = (totalTokens * PRIZE_PERCENTAGE) / TOTAL_PERCENTAGE;
        uint256 burnAmount = (totalTokens * BURN_PERCENTAGE) / TOTAL_PERCENTAGE;
        uint256 newRollover = totalTokens - prizeAmount - burnAmount;

        // Get total tickets for history
        uint256 totalTickets = _calculateTotalTickets();

        // Record history
        rounds[endingRoundId] = RoundHistory({
            roundId: endingRoundId,
            totalTokens: totalTokens,
            totalTickets: totalTickets,
            participantCount: currentRoundPlayers.length,
            winner: winner,
            prizeAmount: prizeAmount,
            burnAmount: burnAmount,
            rolloverAmount: newRollover,
            endTime: block.timestamp
        });

        // Execute transfers
        superstakeToken.safeTransfer(winner, prizeAmount);
        superstakeToken.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, burnAmount);
        _forwardHexIfAny();

        emit RoundConcluded(
            endingRoundId,
            winner,
            prizeAmount,
            burnAmount,
            newRollover,
            currentRoundPlayers.length,
            totalTickets
        );

        // Update rollover for next round
        rolloverAmount = newRollover;

        // Start new round
        _startNewRound();
        _forwardHexIfAny();
    }

    /**
     * @dev Select winner using block hash randomness with weighted tickets
     */
    function _selectWinner() private view returns (address) {
        require(currentRoundPlayers.length > 0, "No players");

        uint256 randomSeed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    blockhash(block.number - 1),
                    currentRoundTotalTokens,
                    currentRoundPlayers.length,
                    currentRoundId
                )
            )
        );

        uint256 totalTickets = _calculateTotalTickets();
        uint256 winningTicket = randomSeed % totalTickets;

        // Find winner based on weighted tickets
        uint256 cumulativeTickets = 0;
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            address player = currentRoundPlayers[i];
            cumulativeTickets += currentRoundTickets[player];

            if (winningTicket < cumulativeTickets) {
                return player;
            }
        }

        return currentRoundPlayers[currentRoundPlayers.length - 1];
    }

    /**
     * @dev Calculate total tickets in current round
     */
    function _calculateTotalTickets() private view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            total += currentRoundTickets[currentRoundPlayers[i]];
        }
        return total;
    }

    /**
     * @dev Forward any HEX tokens held by this contract to the staking address
     */
    function _forwardHexIfAny() private {
        IERC20 hexToken = IERC20(HEX_TOKEN_ADDRESS);
        uint256 hexBalance = hexToken.balanceOf(address(this));
        if (hexBalance > 0) {
            hexToken.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, hexBalance);
        }
    }
}
