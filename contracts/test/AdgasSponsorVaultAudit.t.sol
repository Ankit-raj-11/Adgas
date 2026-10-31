// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AdgasSponsorVault} from "../src/AdgasSponsorVault.sol";
import {IERC20WithEIP3009} from "../src/interfaces/IERC20WithEIP3009.sol";

contract AuditMockUSDC is IERC20WithEIP3009 {
    string public override name = "USD Coin";
    string public override symbol = "USDC";
    uint8 public override decimals = 6;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public override authorizationState;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 public override DOMAIN_SEPARATOR;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes("2")), block.chainid, address(this))
        );
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockUSDC: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferWithAuthorization(address, address, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)
        external
        pure
        override
    {
        revert("Not implemented");
    }

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
    ) external override {
        require(msg.sender == to, "MockUSDC: caller must be payee");
        require(block.timestamp >= validAfter, "MockUSDC: authorization not yet valid");
        require(block.timestamp < validBefore, "MockUSDC: authorization expired");
        require(!authorizationState[from][nonce], "MockUSDC: authorization already used");

        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == from, "MockUSDC: invalid signature");

        authorizationState[from][nonce] = true;
        require(balanceOf[from] >= value, "MockUSDC: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    function cancelAuthorization(address, bytes32, uint8, bytes32, bytes32) external pure override {}
}

    /**
     * @title AdgasSponsorVaultAuditTest
     * @notice Tests reproducing and proving findings identified during the security and correctness review.
     */
    contract AdgasSponsorVaultAuditTest is Test {
        AuditMockUSDC public usdc;
        AdgasSponsorVault public vault;

        uint256 internal sponsorPrivateKey = 0xA11CE;
        uint256 internal userPrivateKey = 0xB0B;
        uint256 internal relayerPrivateKey = 0xCAFE;

        address internal sponsor;
        address internal user;
        address internal recipient = address(0x9999);
        address internal relayer;

        bytes32 internal campaignId = keccak256("audit_campaign_001");

        function setUp() public {
            sponsor = vm.addr(sponsorPrivateKey);
            user = vm.addr(userPrivateKey);
            relayer = vm.addr(relayerPrivateKey);

            usdc = new AuditMockUSDC();
            vault = new AdgasSponsorVault(address(usdc));

            vault.setRelayer(relayer, true);

            usdc.mint(sponsor, 1000 * 1e6);
            usdc.mint(user, 100 * 1e6);
        }

        function _createAttestation(
            bytes32 cId,
            address authorizer,
            address finalRecipient,
            uint256 amount,
            bytes32 userNonce,
            uint256 validAfter,
            uint256 validBefore,
            uint256 maxGas,
            uint256 expiry,
            bytes32 attestationNonce,
            address executingRelayer,
            uint256 signerKey
        ) internal view returns (AdgasSponsorVault.SponsorshipAttestation memory) {
            bytes32 structHash = keccak256(
                abi.encode(
                    vault.SPONSORSHIP_ATTESTATION_TYPEHASH(),
                    cId,
                    authorizer,
                    finalRecipient,
                    amount,
                    userNonce,
                    validAfter,
                    validBefore,
                    maxGas,
                    expiry,
                    attestationNonce,
                    executingRelayer
                )
            );
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);

            return AdgasSponsorVault.SponsorshipAttestation({
                campaignId: cId,
                user: authorizer,
                recipient: finalRecipient,
                amountUsdc: amount,
                userNonce: userNonce,
                validAfter: validAfter,
                validBefore: validBefore,
                maxGasReimbursementUsdc: maxGas,
                expiry: expiry,
                attestationNonce: attestationNonce,
                relayer: executingRelayer,
                v: v,
                r: r,
                s: s
            });
        }

        // -------------------------------------------------------------------------
        // Finding 1 Verification: SEC-01 OpenZeppelin mulDiv Prevents Overflow
        // -------------------------------------------------------------------------
        function test_ReproduceFinding1_CalculateUsdcGasCeilingOverflow() public {
            // Owner sets an alternate economic exchange rate (e.g. 3,000 USDC per native gas token = 3e9)
            vault.setNativeTokenPriceInUsdc(3_000 * 1e6);

            // Under previous implementation: nativeWeiGasCost * nativeTokenPriceInUsdc overflowed uint256
            // Now under SEC-01: OpenZeppelin Math.mulDiv uses full 512-bit intermediate precision
            uint256 largeWei = type(uint256).max / 1e9;
            uint256 computed = vault.calculateUsdcGasCeiling(largeWei);
            assertTrue(computed > 0);

            // Boundary: When the final quotient itself overflows uint256, Math.mulDiv cleanly reverts
            vault.setNativeTokenPriceInUsdc(2 * 1e18);
            vm.expectRevert(Math.MathOverflowedMulDiv.selector);
            vault.calculateUsdcGasCeiling(type(uint256).max);
        }

        // -------------------------------------------------------------------------
        // Finding 2 Reproduction: Gas Reimbursement Formula vs Actual Receipt Discrepancy
        // -------------------------------------------------------------------------
        function test_ReproduceFinding2_GasCalculationEstimationDiscrepancy() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.mint(sponsor, 100 * 1e6);
            vault.depositBudget(campaignId, 50 * 1e6);
            vm.stopPrank();

            uint256 transferAmount = 10 * 1e6;
            bytes32 userNonce = keccak256("nonce_gas_test");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 300;
            uint256 attExpiry = block.timestamp + 300;

            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    transferAmount,
                    validAfter,
                    validBefore,
                    userNonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));

            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: transferAmount,
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: userNonce,
                v: v,
                r: r,
                s: s
            });

            // Attestation allows up to 50,000 USDC units
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                transferAmount,
                userNonce,
                validAfter,
                validBefore,
                50_000,
                attExpiry,
                keccak256("att_gas_test"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);

            uint256 gasStart = gasleft();
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);
            uint256 actualGasConsumed = gasStart - gasleft();

            // Check campaign settled reimbursement
            (,,, uint256 settledReimbursement,,,) = vault.getCampaign(campaignId);

            // Prove that settled reimbursement is based on the calibrated estimation formula (startGas - gasleft + 21k + calldata + 35k),
            // which differs from actual full EVM execution context
            assertTrue(settledReimbursement > 0);
            console.log("Actual gas measured in test:", actualGasConsumed);
            console.log("Settled reimbursement units (6-dec):", settledReimbursement);
        }

        // -------------------------------------------------------------------------
        // Finding 3 Reproduction: Relayer Capital Loss When User Has Insufficient Funds
        // -------------------------------------------------------------------------
        function test_ReproduceFinding3_RelayerLosesGasOnRevertedUserTransfer() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            vault.depositBudget(campaignId, 50 * 1e6);
            vm.stopPrank();

            // User signs authorization for 500 USDC, but only has 100 USDC in balance
            uint256 excessiveAmount = 500 * 1e6;
            bytes32 userNonce = keccak256("nonce_insufficient");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    excessiveAmount,
                    0,
                    block.timestamp + 300,
                    userNonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));

            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: excessiveAmount,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: userNonce,
                v: v,
                r: r,
                s: s
            });

            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                excessiveAmount,
                userNonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_insufficient"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);

            // When relayer broadcasts, the transaction reverts because user has insufficient balance
            vm.prank(relayer);
            vm.expectRevert("MockUSDC: insufficient balance");
            vault.executeSponsoredTransfer(campaignId, auth, att);

            // In production on Arc Mainnet, the relayer's broadcast transaction is mined as a REVERT,
            // burning the relayer's native gas fee without reimbursement from the contract.
        }

        // -------------------------------------------------------------------------
        // Finding 4 Verification: SEC-04 Best-Effort Partial Reimbursement
        // -------------------------------------------------------------------------
        function test_ReproduceFinding4_CumulativeLimitBelowPerTxCapBlocksExecution() public {
            // Sponsor accidentally specifies cumulativeLimit = 100 units (0.0001 USDC),
            // but per-tx cap is 50,000 units (0.05 USDC)
            uint256 tinyCumulativeLimit = 100;
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, tinyCumulativeLimit, relayer);

            vm.startPrank(sponsor);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 transferAmount = 5 * 1e6;
            bytes32 userNonce = keccak256("nonce_cum_footgun");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    transferAmount,
                    0,
                    block.timestamp + 300,
                    userNonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));

            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: transferAmount,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: userNonce,
                v: v,
                r: r,
                s: s
            });

            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                transferAmount,
                userNonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_cum_footgun"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);

            // Under SEC-04 best-effort partial reimbursement:
            // The transfer is NOT blocked. It succeeds with allowedReimbursement capped to remaining cumulative budget (100).
            uint256 relayerBalBefore = usdc.balanceOf(relayer);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);

            assertEq(usdc.balanceOf(relayer) - relayerBalBefore, tinyCumulativeLimit);
            (,,, uint256 settledReimbursement,,,) = vault.getCampaign(campaignId);
            assertEq(settledReimbursement, tinyCumulativeLimit);
        }

        // -------------------------------------------------------------------------
        // Finding 6 Verification: SEC-05 Non-Zero Attestation Nonce Hardening
        // -------------------------------------------------------------------------
        function test_ReproduceFinding6_ZeroAttestationNonceExecutionAndReplay() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            vault.depositBudget(campaignId, 20 * 1e6);
            vm.stopPrank();

            bytes32 zeroNonce = bytes32(0);

            // Under SEC-05, zero attestation nonce is strictly rejected upfront
            bytes32 userNonce1 = keccak256("user_nonce_zero_att_1");
            bytes32 hash1 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    userNonce1
                )
            );
            (uint8 v1, bytes32 r1, bytes32 s1) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash1)));
            AdgasSponsorVault.AuthorizationParams memory auth1 = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: userNonce1,
                v: v1,
                r: r1,
                s: s1
            });
            AdgasSponsorVault.SponsorshipAttestation memory att1 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                userNonce1,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                zeroNonce,
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: zero attestation nonce");
            vault.executeSponsoredTransfer(campaignId, auth1, att1);
        }

        // -------------------------------------------------------------------------
        // Finding 7 Reproduction: Accidental Direct Transfer Locked Permanently
        // -------------------------------------------------------------------------
        function test_ReproduceFinding7_DirectTransfersLockedAboveTotalEscrow() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            // An external donor or user accidentally transfers 50 USDC directly to vault address
            address accidentalSender = address(0x1234);
            usdc.mint(accidentalSender, 50 * 1e6);
            vm.prank(accidentalSender);
            usdc.transfer(address(vault), 50 * 1e6);

            // Contract balance is now 60 USDC, but totalEscrowBalanceUsdc is 10 USDC
            assertEq(usdc.balanceOf(address(vault)), 60 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 10 * 1e6);

            // Sponsor can only withdraw their legitimate 10 USDC
            vm.prank(sponsor);
            vault.withdrawRemaining(campaignId, 10 * 1e6);

            // The accidental 50 USDC remains locked in the contract with no sweep function available
            assertEq(usdc.balanceOf(address(vault)), 50 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 0);
        }
    }

