// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC20WithEIP3009
 * @dev Interface for Canonical USDC on Arc Mainnet (ERC-20 + EIP-3009).
 * Canonical Address on Arc Mainnet (Chain 5042): 0x3600000000000000000000000000000000000000
 */
interface IERC20WithEIP3009 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;

    // EIP-3009 boolean return type for authorization state
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

