// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AdgasSponsorVault} from "../src/AdgasSponsorVault.sol";

/**
 * @title DeployAdgasSponsorVault
 * @notice Foundry deployment script for AdgasSponsorVault on Arc Mainnet.
 * Usage:
 *   forge script script/DeployAdgasSponsorVault.s.sol:DeployAdgasSponsorVault \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --broadcast \
 *     --account <my_keystore_or_private_key>
 */
contract DeployAdgasSponsorVault is Script {
    // Canonical Arc Mainnet USDC Address
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (AdgasSponsorVault vault) {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));

        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        address targetUsdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        vault = new AdgasSponsorVault(targetUsdc);
        require(address(vault.usdc()) == targetUsdc, "DeployScript: target USDC mismatch");
        require(vault.usdc().decimals() == 6, "DeployScript: target decimals must be 6");

        address initialRelayer = vm.envOr("RELAYER_ADDRESS", address(0));
        if (initialRelayer != address(0)) {
            vault.setRelayer(initialRelayer, true);
            console.log("Authorized initial relayer:", initialRelayer);
        }

        console.log("--------------------------------------------------");
        console.log("AdgasSponsorVault deployed at:", address(vault));
        console.log("Chain ID:", block.chainid);
        console.log("Target USDC contract:", targetUsdc);
        console.log("Decimals confirmed:", vault.usdc().decimals());
        console.log("--------------------------------------------------");

        vm.stopBroadcast();
    }
}
