// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AdgasSponsorVault} from "../src/AdgasSponsorVault.sol";
import {IERC20WithEIP3009} from "../src/interfaces/IERC20WithEIP3009.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract RemediationMockUSDC is IERC20WithEIP3009 {
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

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockUSDC: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "MockUSDC: insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
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
     * @title AdgasSponsorVaultRemediationTest
     * @notice TDD regression tests for SEC-01, SEC-04, SEC-05, and SEC-06 remediations.
     */
    contract AdgasSponsorVaultRemediationTest is Test {
        RemediationMockUSDC public usdc;
        AdgasSponsorVault public vault;

        uint256 internal sponsorPrivateKey = 0xA11CE;
        uint256 internal userPrivateKey = 0xB0B;
        uint256 internal user2PrivateKey = 0xC001;
        uint256 internal relayerPrivateKey = 0xCAFE;

        address internal sponsor;
        address internal user;
        address internal user2;
        address internal recipient = address(0x9999);
        address internal relayer;

        bytes32 internal campaignId = keccak256("remediation_camp_1");

        function setUp() public {
            sponsor = vm.addr(sponsorPrivateKey);
            user = vm.addr(userPrivateKey);
            user2 = vm.addr(user2PrivateKey);
            relayer = vm.addr(relayerPrivateKey);

            usdc = new RemediationMockUSDC();
            vault = new AdgasSponsorVault(address(usdc));

            vault.setRelayer(relayer, true);

            usdc.mint(sponsor, 1000 * 1e6);
            usdc.mint(user, 100 * 1e6);
            usdc.mint(user2, 100 * 1e6);

            vm.prank(sponsor);
            usdc.approve(address(vault), type(uint256).max);

            vm.prank(user);
            usdc.approve(address(vault), type(uint256).max);
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

        // -------------------------------------------------------------
        // SEC-01 Tests: Math.mulDiv with Rounding.Ceil & Overflow Checks
        // -------------------------------------------------------------

        function test_MulDiv_IntermediateOverflowSucceeds() public {
            vault.setNativeTokenPriceInUsdc(3_000 * 1e6);
            uint256 largeWei = uint256(1) << 230;

            uint256 result = vault.calculateUsdcGasCeiling(largeWei);
            uint256 expected = Math.mulDiv(largeWei, 3_000 * 1e6, 1e18, Math.Rounding.Ceil);
            assertEq(result, expected);
            assertTrue(result > 0);
        }

        function test_MulDiv_CeilRoundingVerified() public view {
            uint256 oneWei = 1;
            assertEq(vault.calculateUsdcGasCeiling(oneWei), 1);

            uint256 exactWei = 1e12;
            assertEq(vault.calculateUsdcGasCeiling(exactWei), 1);

            uint256 ceilWei = 1e12 + 1;
            assertEq(vault.calculateUsdcGasCeiling(ceilWei), 2);
        }

        function test_MulDiv_OverflowRevertsCleanly() public {
            // Set price where nativeTokenPriceInUsdc > 1e18 so quotient itself overflows uint256
            vault.setNativeTokenPriceInUsdc(2 * 1e18);
            uint256 maxWei = type(uint256).max;
            vm.expectRevert(Math.MathOverflowedMulDiv.selector);
            vault.calculateUsdcGasCeiling(maxWei);
        }

        function testFuzz_DifferentialMulDiv(uint128 x, uint64 y) public view {
            vm.assume(y > 0);
            uint256 nativeWei = uint256(x);
            uint256 expected = Math.mulDiv(nativeWei, 1, 1e12, Math.Rounding.Ceil);
            uint256 actual = vault.calculateUsdcGasCeiling(nativeWei);
            assertEq(actual, expected);
        }

        // -------------------------------------------------------------
        // SEC-05 Tests: Nonzero Attestation Nonce & Campaign Scope
        // -------------------------------------------------------------

        function test_RevertWhen_ZeroAttestationNonceProvided() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.prank(sponsor);
            vault.depositBudget(campaignId, 20 * 1e6);

            bytes32 userNonce = keccak256("nonce_zero_att");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
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
                value: 5 * 1e6,
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
                5 * 1e6,
                userNonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                bytes32(0),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: zero attestation nonce");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        function test_CrossCampaignAttestationNonceIsolation() public {
            bytes32 campA = keccak256("camp_iso_A");
            bytes32 campB = keccak256("camp_iso_B");

            vm.startPrank(sponsor);
            vault.createCampaign(campA, 50_000, 0, relayer);
            vault.createCampaign(campB, 50_000, 0, relayer);
            vault.depositBudget(campA, 10 * 1e6);
            vault.depositBudget(campB, 10 * 1e6);
            vm.stopPrank();

            bytes32 sharedNonce = keccak256("shared_att_nonce_ok");

            bytes32 keyA = vault.computeAttestationKey(campA, relayer, sharedNonce);
            bytes32 keyB = vault.computeAttestationKey(campB, relayer, sharedNonce);

            assertTrue(keyA != keyB);
        }

        // -------------------------------------------------------------
        // SEC-04 Tests: Partial Reimbursement & Best-Effort Sponsorship
        // -------------------------------------------------------------

        function test_PartialReimbursement_WhenBudgetSmallerThanGasCost() public {
            uint256 smallLimit = 50;
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, smallLimit, relayer);
            vm.prank(sponsor);
            vault.depositBudget(campaignId, 10 * 1e6);

            bytes32 userNonce = keccak256("nonce_partial_1");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
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
                value: 5 * 1e6,
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
                5 * 1e6,
                userNonce,
                0,
                block.timestamp + 300,
                15_000,
                block.timestamp + 300,
                keccak256("att_partial_1"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            uint256 relayerBefore = usdc.balanceOf(relayer);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);

            assertEq(usdc.balanceOf(recipient), 5 * 1e6);
            assertEq(usdc.balanceOf(relayer) - relayerBefore, 50);

            (,,, uint256 settled,,,) = vault.getCampaign(campaignId);
            assertEq(settled, 50);
        }

        function test_ExactCumulativeExhaustionAndSubsequentZeroReimbursement() public {
            uint256 limit = 100;
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, limit, relayer);
            vm.prank(sponsor);
            vault.depositBudget(campaignId, 10 * 1e6);

            // Transfer 1: capped to 100 units
            bytes32 userNonce1 = keccak256("nonce_exhaust_1");
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
                100,
                block.timestamp + 300,
                keccak256("att_exhaust_1"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth1, att1);

            (,,, uint256 settledAfter1,,,) = vault.getCampaign(campaignId);
            assertEq(settledAfter1, 100);

            // Transfer 2: budget exhausted to 0. Payment succeeds with zero subsidy.
            bytes32 userNonce2 = keccak256("nonce_exhaust_2");
            bytes32 hash2 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    userNonce2
                )
            );
            (uint8 v2, bytes32 r2, bytes32 s2) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash2)));
            AdgasSponsorVault.AuthorizationParams memory auth2 = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: userNonce2,
                v: v2,
                r: r2,
                s: s2
            });
            AdgasSponsorVault.SponsorshipAttestation memory att2 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                userNonce2,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_exhaust_2"),
                relayer,
                relayerPrivateKey
            );

            uint256 relayerBalBefore2 = usdc.balanceOf(relayer);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth2, att2);

            assertEq(usdc.balanceOf(recipient), 10 * 1e6);
            assertEq(usdc.balanceOf(relayer), relayerBalBefore2);
        }

        function test_PartialReimbursement_WhenLiquidBalanceInsufficient() public {
            // High cumulative limit, but liquid balance is only 30 units
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.prank(sponsor);
            vault.depositBudget(campaignId, 30); // only 30 units deposited

            bytes32 userNonce = keccak256("nonce_liq_1");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
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
                value: 5 * 1e6,
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
                5 * 1e6,
                userNonce,
                0,
                block.timestamp + 300,
                15_000,
                block.timestamp + 300,
                keccak256("att_liq_1"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            uint256 relayerBefore = usdc.balanceOf(relayer);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);

            assertEq(usdc.balanceOf(recipient), 5 * 1e6);
            assertEq(usdc.balanceOf(relayer) - relayerBefore, 30);

            (, uint256 available,,,,,) = vault.getCampaign(campaignId);
            assertEq(available, 0);
            assertEq(vault.totalEscrowBalanceUsdc(), 0);
        }

        // -------------------------------------------------------------
        // SEC-06 Tests: Unallocated Token Sweep & Multi-Campaign Solvency
        // -------------------------------------------------------------

        function test_SweepUnallocatedTokens_MultiCampaignSolvency() public {
            bytes32 camp1 = keccak256("camp_sweep_1");
            bytes32 camp2 = keccak256("camp_sweep_2");

            vm.startPrank(sponsor);
            vault.createCampaign(camp1, 50_000, 0, relayer);
            vault.createCampaign(camp2, 50_000, 0, relayer);
            vault.depositBudget(camp1, 100 * 1e6);
            vault.depositBudget(camp2, 200 * 1e6);
            vm.stopPrank();

            assertEq(vault.totalEscrowBalanceUsdc(), 300 * 1e6);
            assertEq(usdc.balanceOf(address(vault)), 300 * 1e6);

            address accidentalDonor = address(0x4444);
            usdc.mint(accidentalDonor, 75 * 1e6);
            vm.prank(accidentalDonor);
            usdc.transfer(address(vault), 75 * 1e6);

            assertEq(usdc.balanceOf(address(vault)), 375 * 1e6);

            address recovery = address(0x8888);
            vm.prank(recovery);
            vm.expectRevert("AdgasVault: caller is not the owner");
            vault.sweepUnallocatedTokens(recovery);

            vm.expectRevert("AdgasVault: zero address recipient");
            vault.sweepUnallocatedTokens(address(0));

            vault.sweepUnallocatedTokens(recovery);
            assertEq(usdc.balanceOf(recovery), 75 * 1e6);
            assertEq(usdc.balanceOf(address(vault)), 300 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 300 * 1e6);

            vm.expectRevert("AdgasVault: no unallocated tokens to sweep");
            vault.sweepUnallocatedTokens(recovery);
        }

        // -------------------------------------------------------------
        // Multi-Campaign Escrow Solvency Invariant Fuzzing
        // -------------------------------------------------------------

        function testFuzz_MultiCampaignEscrowSolvency(uint32 depA, uint32 depB, uint32 transferVal) public {
            uint256 depositA = bound(uint256(depA), 1 * 1e6, 100 * 1e6);
            uint256 depositB = bound(uint256(depB), 1 * 1e6, 100 * 1e6);
            uint256 val = bound(uint256(transferVal), 1 * 1e6, 20 * 1e6);

            bytes32 fuzzCampA = keccak256(abi.encodePacked("fuzz_A", depositA));
            bytes32 fuzzCampB = keccak256(abi.encodePacked("fuzz_B", depositB));

            vm.startPrank(sponsor);
            vault.createCampaign(fuzzCampA, 50_000, 0, relayer);
            vault.createCampaign(fuzzCampB, 50_000, 0, relayer);
            usdc.mint(sponsor, depositA + depositB);
            vault.depositBudget(fuzzCampA, depositA);
            vault.depositBudget(fuzzCampB, depositB);
            vm.stopPrank();

            usdc.mint(user, val);
            bytes32 uNonce = keccak256(abi.encodePacked("fuzz_nonce", val));
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    val,
                    0,
                    block.timestamp + 300,
                    uNonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));
            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: val,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: uNonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                fuzzCampA,
                user,
                recipient,
                val,
                uNonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("fuzz_att"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(fuzzCampA, auth, att);

            assertGe(usdc.balanceOf(address(vault)), vault.totalEscrowBalanceUsdc());
        }
    }
