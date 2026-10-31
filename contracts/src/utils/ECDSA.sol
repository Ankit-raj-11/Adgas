// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ECDSA
 * @dev Elliptic Curve Digital Signature Algorithm (ECDSA) operations.
 * Implements OpenZeppelin-standard signature validation and recovery with protection
 * against signature malleability (EIP-2), explicit zero-check on r and s, and rejection of zero-address returns.
 */
library ECDSA {
    // SECP256k1 curve order n
    uint256 private constant _SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    // Upper limit for s (n / 2) to prevent signature malleability
    uint256 private constant _SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D57617F1A085D047E0F0C002D247764;

    /**
     * @dev Recover the signer of an EIP-191 or EIP-712 signed digest.
     * Reverts if the signature is malleable or invalid.
     */
    function recover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
        // Explicitly reject zero r and zero s
        if (uint256(r) == 0 || uint256(s) == 0) {
            revert("ECDSA: invalid zero r or s");
        }

        // r must be strictly less than the curve order n
        if (uint256(r) >= _SECP256K1_N) {
            revert("ECDSA: invalid signature 'r' value");
        }

        // EIP-2: s must be in the lower half of the curve order to prevent signature malleability
        if (uint256(s) > _SECP256K1_HALF_N) {
            revert("ECDSA: invalid signature 's' value");
        }

        // v must be 27 or 28
        if (v != 27 && v != 28) {
            revert("ECDSA: invalid signature 'v' value");
        }

        address signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) {
            revert("ECDSA: invalid signature");
        }

        return signer;
    }
}
