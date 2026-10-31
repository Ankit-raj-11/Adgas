// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AdgasSponsorVault} from "../src/AdgasSponsorVault.sol";
import {IERC20WithEIP3009} from "../src/interfaces/IERC20WithEIP3009.sol";

contract MockUSDC is IERC20WithEIP3009 {
    string public override name = "USD Coin";
    string public override symbol = "USDC";
    uint8 public override decimals = 6;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public override authorizationState;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
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

    mapping(address => bool) public failTransfersTo;
    mapping(address => bool) public revertTransfersTo;

    function setFailTransfersTo(address account, bool fail) external {
        failTransfersTo[account] = fail;
    }

    function setRevertTransfersTo(address account, bool rev) external {
        revertTransfersTo[account] = rev;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (revertTransfersTo[to]) {
            revert("MockUSDC: transfer reverted");
        }
        if (failTransfersTo[to]) {
            return false;
        }
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
    ) public override {
        require(block.timestamp >= validAfter, "MockUSDC: authorization not yet valid");
        require(block.timestamp < validBefore, "MockUSDC: authorization expired");
        require(!authorizationState[from][nonce], "MockUSDC: authorization already used");

        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == from, "MockUSDC: invalid signature");

        authorizationState[from][nonce] = true;
        require(balanceOf[from] >= value, "MockUSDC: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
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
    ) public override {
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

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external override {
        require(!authorizationState[authorizer][nonce], "MockUSDC: authorization already used");
        bytes32 hash = keccak256(
            abi.encode(keccak256("CancelAuthorization(address authorizer,bytes32 nonce)"), authorizer, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hash));
        address signer = ecrecover(digest, v, r, s);
        require(signer == authorizer, "MockUSDC: invalid cancel signature");
        authorizationState[authorizer][nonce] = true;
    }
}

    contract AdgasSponsorVaultTest is Test {
        MockUSDC public usdc;
        AdgasSponsorVault public vault;

        uint256 internal sponsorPrivateKey = 0xA11CE;
        uint256 internal userPrivateKey = 0xB0B;
        uint256 internal user2PrivateKey = 0xC001;
        uint256 internal relayerPrivateKey = 0xCAFE;
        uint256 internal rogueRelayerPrivateKey = 0xBADC0DE;

        address internal sponsor;
        address internal user;
        address internal user2;
        address internal recipient = address(0x9999);
        address internal relayer;
        address internal rogueRelayer;

        bytes32 internal campaignId = keccak256(abi.encodePacked("campaign_demo_001"));

        function setUp() public {
            sponsor = vm.addr(sponsorPrivateKey);
            user = vm.addr(userPrivateKey);
            user2 = vm.addr(user2PrivateKey);
            relayer = vm.addr(relayerPrivateKey);
            rogueRelayer = vm.addr(rogueRelayerPrivateKey);

            usdc = new MockUSDC();
            vault = new AdgasSponsorVault(address(usdc));

            // Authorize relayers explicitly in the vault
            vault.setRelayer(relayer, true);
            vault.setRelayer(rogueRelayer, true);

            // Mint USDC to sponsor and users (6 decimals)
            usdc.mint(sponsor, 1000 * 1e6); // 1,000 USDC
            usdc.mint(user, 100 * 1e6); // 100 USDC
            usdc.mint(user2, 100 * 1e6); // 100 USDC
        }

        // Helper to generate a valid signed EIP-712 SponsorshipAttestation
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
        // Campaign Creation & Deposit Tests
        // -------------------------------------------------------------

        function test_CreateCampaign() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 100 * 1e6, relayer);

            (
                address sp,
                uint256 available,
                uint256 lifetimeDeposited,
                uint256 settledReimbursement,
                uint256 maxGas,
                uint256 cumulativeLimit,
                bool isActive
            ) = vault.getCampaign(campaignId);

            assertEq(sp, sponsor);
            assertEq(available, 0);
            assertEq(lifetimeDeposited, 0);
            assertEq(settledReimbursement, 0);
            assertEq(maxGas, 50_000);
            assertEq(cumulativeLimit, 100 * 1e6);
            assertTrue(isActive);

            assertTrue(vault.isAttesterAuthorizedForCampaign(campaignId, sponsor));
            assertTrue(vault.isAttesterAuthorizedForCampaign(campaignId, relayer));
            assertFalse(vault.isAttesterAuthorizedForCampaign(campaignId, rogueRelayer));
        }

        function test_DepositBudget() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);

            vm.startPrank(sponsor);
            usdc.approve(address(vault), 50 * 1e6);
            vault.depositBudget(campaignId, 50 * 1e6);
            vm.stopPrank();

            (, uint256 available, uint256 lifetimeDeposited,,,,) = vault.getCampaign(campaignId);
            assertEq(available, 50 * 1e6);
            assertEq(lifetimeDeposited, 50 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 50 * 1e6);
            assertEq(usdc.balanceOf(address(vault)), 50 * 1e6);
        }

        function test_DepositBudgetWithReceiveAuthorization() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);

            bytes32 nonce = keccak256("sponsor_receive_auth_nonce");
            uint256 value = 25 * 1e6;
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 3600;

            bytes32 structHash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    sponsor,
                    address(vault),
                    value,
                    validAfter,
                    validBefore,
                    nonce
                )
            );
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(sponsorPrivateKey, digest);

            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: sponsor,
                to: address(vault),
                value: value,
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });

            vault.depositBudgetWithReceiveAuthorization(campaignId, auth);

            (, uint256 available, uint256 lifetimeDeposited,,,,) = vault.getCampaign(campaignId);
            assertEq(available, 25 * 1e6);
            assertEq(lifetimeDeposited, 25 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 25 * 1e6);
        }

        // -------------------------------------------------------------
        // Blockers 35, 1, 2, 3, 37 Verification Tests
        // -------------------------------------------------------------

        // Blocker 35: EIP-3009 Front-running defense via receiveWithAuthorization
        function test_ExecuteSponsoredTransfer_FrontRunningDefense_HappyPath() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);

            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 transferAmount = 10 * 1e6;
            bytes32 userNonce = keccak256("user_nonce_fr_1");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 300;
            uint256 attExpiry = block.timestamp + 300;

            // User signs receiveWithAuthorization with payee = address(vault)
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
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, digest);

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

            // Relayer signs SponsorshipAttestation with final recipient
            bytes32 attNonce = keccak256("att_nonce_fr_1");
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                transferAmount,
                userNonce,
                validAfter,
                validBefore,
                10_000,
                attExpiry,
                attNonce,
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            uint256 relayerBalBefore = usdc.balanceOf(relayer);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);

            // Final recipient receives full transfer amount
            assertEq(usdc.balanceOf(recipient), transferAmount);
            assertEq(usdc.balanceOf(user), 90 * 1e6);
            assertTrue(usdc.balanceOf(relayer) > relayerBalBefore);

            // Vault escrow is solvent
            assertGe(usdc.balanceOf(address(vault)), vault.totalEscrowBalanceUsdc());
        }

        // Blocker 35 Proof: Mempool attacker cannot front-run receiveWithAuthorization
        function test_RevertWhen_MempoolAttackerTriesToFrontRunReceive() public {
            uint256 transferAmount = 10 * 1e6;
            bytes32 userNonce = keccak256("user_nonce_fr_intercept");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 300;

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
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, digest);

            // Rogue attacker intercepts authorization from mempool and attempts to call token directly
            address attacker = address(0x666);
            vm.prank(attacker);
            vm.expectRevert("MockUSDC: caller must be payee");
            usdc.receiveWithAuthorization(
                user, address(vault), transferAmount, validAfter, validBefore, userNonce, v, r, s
            );
        }

        // Blocker 2: Attestation not bound to executing relayer reverts
        function test_RevertWhen_RelayerNotBound() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 transferAmount = 5 * 1e6;
            bytes32 userNonce = keccak256("user_nonce_bound");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 300;

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

            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                transferAmount,
                userNonce,
                validAfter,
                validBefore,
                10_000,
                block.timestamp + 300,
                keccak256("att_bound"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(rogueRelayer);
            vm.expectRevert("AdgasVault: attestation not bound to executing relayer");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        // Blocker 3: Temporal coupling (authorization cannot outlive attestation)
        function test_RevertWhen_AuthorizationValidityExceedsAttestationExpiry() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 userNonce = keccak256("user_nonce_coupling");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 600; // 10 minutes
            uint256 attExpiry = block.timestamp + 300; // 5 minutes

            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
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
                value: 5 * 1e6,
                validAfter: validAfter,
                validBefore: validBefore,
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
                validAfter,
                validBefore,
                10_000,
                attExpiry,
                keccak256("att_coup"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: authorization validity exceeds attestation expiry");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        // Issue 4: Strict upper bound for expiry
        function test_RevertWhen_AttestationExactTimestampExpiry() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 userNonce = keccak256("user_nonce_exact_exp");
            uint256 validAfter = 0;
            uint256 validBefore = block.timestamp + 300;
            uint256 attExpiry = block.timestamp + 300;

            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
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
                value: 5 * 1e6,
                validAfter: validAfter,
                validBefore: validBefore,
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
                validAfter,
                validBefore,
                10_000,
                attExpiry,
                keccak256("att_exact_exp"),
                relayer,
                relayerPrivateKey
            );

            // Warp to the exact expiry timestamp
            vm.warp(attExpiry);

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: attestation expired");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        // Issue 6 & 7: Campaign-Scoped Attestation Replay
        function test_AttestationKey_CampaignScoped() public {
            bytes32 camp1 = keccak256("campaign_scope_1");
            bytes32 camp2 = keccak256("campaign_scope_2");

            vm.startPrank(sponsor);
            vault.createCampaign(camp1, 50_000, 0, relayer);
            vault.createCampaign(camp2, 50_000, 0, relayer);
            usdc.approve(address(vault), 20 * 1e6);
            vault.depositBudget(camp1, 10 * 1e6);
            vault.depositBudget(camp2, 10 * 1e6);
            vm.stopPrank();

            bytes32 sharedAttNonce = keccak256("shared_att_nonce_across_camps");

            bytes32 attKey1 = vault.computeAttestationKey(camp1, relayer, sharedAttNonce);
            bytes32 attKey2 = vault.computeAttestationKey(camp2, relayer, sharedAttNonce);

            assertTrue(attKey1 != attKey2);
        }

        // Issue 22 & 23: Emergency Withdrawals During Protocol Pause
        function test_EmergencyWithdrawDuringProtocolPause() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 20 * 1e6);
            vault.depositBudget(campaignId, 20 * 1e6);
            vm.stopPrank();

            // Admin pauses protocol
            vault.pause();
            assertTrue(vault.paused());

            // Sponsor can still safely recover funds during emergency pause
            uint256 sponsorBefore = usdc.balanceOf(sponsor);
            vm.prank(sponsor);
            vault.withdrawRemaining(campaignId, 20 * 1e6);
            uint256 sponsorAfter = usdc.balanceOf(sponsor);

            assertEq(sponsorAfter - sponsorBefore, 20 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 0);
        }

        // Issue 24: Idempotent Pause and Unpause
        function test_IdempotentPauseAndUnpause() public {
            assertFalse(vault.paused());

            vault.pause();
            assertTrue(vault.paused());

            vm.expectRevert("AdgasVault: already paused");
            vault.pause();

            vault.unpause();
            assertFalse(vault.paused());

            vm.expectRevert("AdgasVault: not paused");
            vault.unpause();
        }

        // Issue 28 & 29: OpenZeppelin ECDSA zero-check on r and s
        function test_RevertWhen_ZeroRSInECDSA() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 userNonce = keccak256("user_nonce_zero_rs");
            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: userNonce,
                v: 27,
                r: bytes32(0),
                s: bytes32(0)
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
                keccak256("att_zero_rs"),
                relayer,
                relayerPrivateKey
            );
            att.r = bytes32(0);

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("ECDSA: invalid zero r or s");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        // Issue 37: Configurable Economic Exchange Rate
        function test_EconomicExchangeRateGasConversion() public {
            uint256 oneGweiWei = 1e9; // 1 gwei
            // Default parity: 1 native token = 1.0 USDC
            uint256 defaultCost = vault.calculateUsdcGasCeiling(oneGweiWei);
            assertEq(defaultCost, 1);

            // Custom rate: 1 native token = 3,000 USDC (ETH model on testnet)
            vault.setNativeTokenPriceInUsdc(3_000 * 1e6);
            uint256 ethModelCost = vault.calculateUsdcGasCeiling(1e15); // 0.001 ETH
            // 0.001 * 3000 = 3 USDC (3,000,000 units)
            assertEq(ethModelCost, 3 * 1e6);
        }

        // Main Blocker 5: OpenZeppelin ECDSA Signature Malleability Rejection
        function test_RevertWhen_SignatureMalleability() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 userNonce = keccak256("user_nonce_malleability");
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
                keccak256("att_mal"),
                relayer,
                relayerPrivateKey
            );

            // Invert `s` into the upper half of the secp256k1 curve order n
            uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
            att.s = bytes32(n - uint256(att.s));
            att.v = att.v == 27 ? 28 : 27;

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("ECDSA: invalid signature 's' value");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        function test_RevertWhen_ZeroGasPriceClaimsReimbursement() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 nonce = keccak256("nonce_zero_gas");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_zg"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(0);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: zero gas price transaction rejected");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        function test_CumulativeSpendingLimitEnforced() public {
            uint256 cumulativeLimit = 250;
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, cumulativeLimit, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 nonce1 = keccak256("nonce_cum_1");
            bytes32 hash1 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce1
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
                nonce: nonce1,
                v: v1,
                r: r1,
                s: s1
            });
            AdgasSponsorVault.SponsorshipAttestation memory att1 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce1,
                0,
                block.timestamp + 300,
                15_000,
                block.timestamp + 300,
                keccak256("att_cum_1"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth1, att1);

            bytes32 nonce2 = keccak256("nonce_cum_2");
            bytes32 hash2 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce2
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
                nonce: nonce2,
                v: v2,
                r: r2,
                s: s2
            });
            AdgasSponsorVault.SponsorshipAttestation memory att2 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce2,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_cum_2"),
                relayer,
                relayerPrivateKey
            );

            // Transfer 2: Reimburses the remaining cumulative budget, reaching exactly cumulativeLimit
            uint256 recipientBalBefore = usdc.balanceOf(recipient);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth2, att2);

            // Recipient received full 5 USDC
            assertEq(usdc.balanceOf(recipient) - recipientBalBefore, 5 * 1e6);
            // Relayer received remaining cumulative budget, bringing total settled reimbursement to exactly cumulativeLimit
            assertEq(usdc.balanceOf(relayer), cumulativeLimit);

            // Campaign cumulative settled reimbursement strictly equals the cap (250)
            (,,, uint256 settledReimbursement,,,) = vault.getCampaign(campaignId);
            assertEq(settledReimbursement, cumulativeLimit);

            // Transfer 3: Budget is completely exhausted (remaining cumulative = 0).
            // Best-effort sponsorship allows user payment to proceed with ZERO reimbursement.
            bytes32 nonce3 = keccak256("nonce_cum_3");
            bytes32 hash3 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce3
                )
            );
            (uint8 v3, bytes32 r3, bytes32 s3) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash3)));
            AdgasSponsorVault.AuthorizationParams memory auth3 = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: block.timestamp + 300,
                nonce: nonce3,
                v: v3,
                r: r3,
                s: s3
            });
            AdgasSponsorVault.SponsorshipAttestation memory att3 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce3,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_cum_3"),
                relayer,
                relayerPrivateKey
            );

            uint256 relayerBalBefore3 = usdc.balanceOf(relayer);
            uint256 recipientBalBefore3 = usdc.balanceOf(recipient);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth3, att3);

            // User payment completed
            assertEq(usdc.balanceOf(recipient) - recipientBalBefore3, 5 * 1e6);
            // Relayer received 0 reimbursement because budget was already exhausted
            assertEq(usdc.balanceOf(relayer), relayerBalBefore3);
            // Settled reimbursement remains strictly at cumulativeLimit
            (,,, uint256 settledReimbursement3,,,) = vault.getCampaign(campaignId);
            assertEq(settledReimbursement3, cumulativeLimit);
        }

        function test_TwoStepOwnershipAndRelayerSeparation() public {
            address contractOwner = vault.owner();
            assertFalse(vault.authorizedRelayers(contractOwner));

            address newAdmin = address(0x7777);
            vault.transferOwnership(newAdmin);
            assertEq(vault.pendingOwner(), newAdmin);

            vm.prank(newAdmin);
            vault.acceptOwnership();
            assertEq(vault.owner(), newAdmin);
            assertEq(vault.pendingOwner(), address(0));

            assertFalse(vault.authorizedRelayers(contractOwner));
            assertFalse(vault.authorizedRelayers(newAdmin));
        }

        function testFuzz_AccountingInvariant(uint256 depositAmt) public {
            depositAmt = bound(depositAmt, 1 * 1e6, 500 * 1e6);

            bytes32 fuzzCampId = keccak256(abi.encodePacked("fuzz_campaign", depositAmt));
            vm.startPrank(sponsor);
            vault.createCampaign(fuzzCampId, 50_000, 0, relayer);
            usdc.mint(sponsor, depositAmt);
            usdc.approve(address(vault), depositAmt);
            vault.depositBudget(fuzzCampId, depositAmt);
            vm.stopPrank();

            (, uint256 available, uint256 lifetimeDeposited, uint256 settledReimbursement,,,) =
                vault.getCampaign(fuzzCampId);
            assertEq(available + settledReimbursement, lifetimeDeposited);
            assertEq(lifetimeDeposited, depositAmt);
            assertGe(usdc.balanceOf(address(vault)), vault.totalEscrowBalanceUsdc());
        }

        // -------------------------------------------------------------
        // Additional Comprehensive Security & Invariant Tests
        // -------------------------------------------------------------

        function test_RevertWhen_ReimbursementTransferFailsRevertsEntireTransaction_ReturnFalse() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 userBalBefore = usdc.balanceOf(user);
            uint256 recipientBalBefore = usdc.balanceOf(recipient);
            uint256 vaultBalBefore = usdc.balanceOf(address(vault));
            uint256 totalEscrowBefore = vault.totalEscrowBalanceUsdc();

            bytes32 nonce = keccak256("nonce_fail_reimb_return_false");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            bytes32 attNonce = keccak256("att_fail_reimb_return_false");
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                attNonce,
                relayer,
                relayerPrivateKey
            );

            // Configure mock USDC to fail (return false) on transfers to relayer
            usdc.setFailTransfersTo(relayer, true);

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: safeTransfer failed");
            vault.executeSponsoredTransfer(campaignId, auth, att);

            // Verify strict atomicity: all state is completely untouched!
            assertEq(usdc.balanceOf(user), userBalBefore, "User balance must be untouched");
            assertEq(usdc.balanceOf(recipient), recipientBalBefore, "Recipient balance must be untouched");
            assertEq(usdc.balanceOf(address(vault)), vaultBalBefore, "Vault balance must be untouched");
            assertEq(vault.totalEscrowBalanceUsdc(), totalEscrowBefore, "Escrow balance must be untouched");
            assertFalse(
                vault.executedSettlements(vault.computeSettlementId(campaignId, user, nonce)),
                "Settlement must not be consumed"
            );
            assertFalse(
                vault.executedAttestations(vault.computeAttestationKey(campaignId, relayer, attNonce)),
                "Attestation must not be consumed"
            );

            // Clean up toggle and verify identical transaction now succeeds cleanly
            usdc.setFailTransfersTo(relayer, false);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);
            assertEq(usdc.balanceOf(recipient) - recipientBalBefore, 5 * 1e6);
        }

        function test_RevertWhen_ReimbursementTransferFailsRevertsEntireTransaction_Revert() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 userBalBefore = usdc.balanceOf(user);
            uint256 recipientBalBefore = usdc.balanceOf(recipient);

            bytes32 nonce = keccak256("nonce_fail_reimb_revert");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            bytes32 attNonce = keccak256("att_fail_reimb_revert");
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                attNonce,
                relayer,
                relayerPrivateKey
            );

            // Configure mock USDC to revert on transfers to relayer
            usdc.setRevertTransfersTo(relayer, true);

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: safeTransfer failed");
            vault.executeSponsoredTransfer(campaignId, auth, att);

            assertEq(usdc.balanceOf(user), userBalBefore);
            assertEq(usdc.balanceOf(recipient), recipientBalBefore);
        }

        function test_RevertWhen_RecipientTransferFailsRevertsEntireTransaction() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            uint256 userBalBefore = usdc.balanceOf(user);
            uint256 relayerBalBefore = usdc.balanceOf(relayer);

            bytes32 nonce = keccak256("nonce_fail_recipient");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            bytes32 attNonce = keccak256("att_fail_recipient");
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                attNonce,
                relayer,
                relayerPrivateKey
            );

            // Configure mock USDC to fail on transfers to recipient
            usdc.setFailTransfersTo(recipient, true);

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: safeTransfer failed");
            vault.executeSponsoredTransfer(campaignId, auth, att);

            assertEq(usdc.balanceOf(user), userBalBefore);
            assertEq(usdc.balanceOf(relayer), relayerBalBefore);
        }

        function test_ZeroCumulativeLimitMeansUnlimitedSpend() public {
            // Creating campaign with cumulativeSpendLimitUsdc == 0 stores type(uint256).max (unlimited spend)
            bytes32 unlimCampId = keccak256("campaign_unlimited_spend");
            vm.prank(sponsor);
            vault.createCampaign(unlimCampId, 50_000, 0, relayer);

            (,,,,, uint256 limitStored,) = vault.getCampaign(unlimCampId);
            assertEq(limitStored, type(uint256).max);

            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(unlimCampId, 10 * 1e6);
            vm.stopPrank();

            // Perform multiple transfers; cumulative spend increases without being capped by any artificial limit
            for (uint256 i = 0; i < 3; i++) {
                bytes32 uNonce = keccak256(abi.encodePacked("unlim_user_nonce", i));
                bytes32 h = keccak256(
                    abi.encode(
                        usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                        user,
                        address(vault),
                        1 * 1e6,
                        0,
                        block.timestamp + 300,
                        uNonce
                    )
                );
                (uint8 v, bytes32 r, bytes32 s) =
                    vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), h)));
                AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                    from: user,
                    to: address(vault),
                    value: 1 * 1e6,
                    validAfter: 0,
                    validBefore: block.timestamp + 300,
                    nonce: uNonce,
                    v: v,
                    r: r,
                    s: s
                });
                AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                    unlimCampId,
                    user,
                    recipient,
                    1 * 1e6,
                    uNonce,
                    0,
                    block.timestamp + 300,
                    10_000,
                    block.timestamp + 300,
                    keccak256(abi.encodePacked("att_unlim", i)),
                    relayer,
                    relayerPrivateKey
                );

                uint256 relayerBalBefore = usdc.balanceOf(relayer);
                vm.txGasPrice(1 gwei);
                vm.prank(relayer);
                vault.executeSponsoredTransfer(unlimCampId, auth, att);

                // Relayer received positive reimbursement on every transfer
                assertTrue(usdc.balanceOf(relayer) > relayerBalBefore);
            }

            (,,, uint256 settled,,,) = vault.getCampaign(unlimCampId);
            assertTrue(settled > 0);
        }

        function test_WeiGasCostMultiplicationOverflowSafeFailure() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 nonce = keccak256("nonce_wei_overflow");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            // Max reimbursement is 8,000 units
            uint256 attCap = 8_000;
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                attCap,
                block.timestamp + 300,
                keccak256("att_wei_overflow"),
                relayer,
                relayerPrivateKey
            );

            // Maximum allowable tx.gasprice supported by EVM cheatcodes (uint64 max)
            vm.txGasPrice(type(uint64).max);

            uint256 relayerBalBefore = usdc.balanceOf(relayer);
            uint256 recipientBalBefore = usdc.balanceOf(recipient);

            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att);

            // User payment completed
            assertEq(usdc.balanceOf(recipient) - recipientBalBefore, 5 * 1e6);
            // Extremely high gas price safely capped reimbursement to attCap
            assertEq(usdc.balanceOf(relayer) - relayerBalBefore, attCap);

            // Unit test Math.tryMul overflow detection on extreme wei product
            (bool mulOk,) = Math.tryMul(80_000, type(uint256).max);
            assertFalse(mulOk, "Math.tryMul detects overflow when product exceeds uint256");
        }

        function test_UnitConversions_ExplicitBoundaries() public {
            // 1. Default Parity Rate (Arc Mainnet 1:1, nativeTokenPriceInUsdc = 1e6)
            assertEq(vault.calculateUsdcGasCeiling(0), 0);
            // Ceiling rounding on minimum positive value: 1 wei -> 1 unit
            assertEq(vault.calculateUsdcGasCeiling(1), 1);
            // Just below 1e12 scale factor
            assertEq(vault.calculateUsdcGasCeiling(1e12 - 1), 1);
            // Exact 1e12 scale factor
            assertEq(vault.calculateUsdcGasCeiling(1e12), 1);
            // Just above 1e12 -> 2 units
            assertEq(vault.calculateUsdcGasCeiling(1e12 + 1), 2);
            // 1 full native token (1e18 wei) -> 1e6 USDC units (1.000000 USDC)
            assertEq(vault.calculateUsdcGasCeiling(1e18), 1e6);
            // 1,000 native tokens -> 1,000 USDC
            assertEq(vault.calculateUsdcGasCeiling(1000 * 1e18), 1000 * 1e6);

            // 2. Alternative Rate (ETH Model: 1 native token = 3,000 USDC = 3e9 units)
            vault.setNativeTokenPriceInUsdc(3_000 * 1e6);
            assertEq(vault.calculateUsdcGasCeiling(0), 0);
            assertEq(vault.calculateUsdcGasCeiling(1), 1);
            // 0.001 token (1e15 wei) -> 3 USDC (3,000,000 units)
            assertEq(vault.calculateUsdcGasCeiling(1e15), 3 * 1e6);
            // 1 full token (1e18 wei) -> 3,000 USDC (3,000,000,000 units)
            assertEq(vault.calculateUsdcGasCeiling(1e18), 3000 * 1e6);
            // 50 tokens (50e18 wei) -> 150,000 USDC
            assertEq(vault.calculateUsdcGasCeiling(50 * 1e18), 150_000 * 1e6);
        }

        function test_PausedState_BlocksExecutionAndDeposit_AllowsSponsorWithdrawal() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            // Admin pauses vault
            vault.pause();
            assertTrue(vault.paused());

            // 1. executeSponsoredTransfer is blocked
            bytes32 nonce = keccak256("nonce_pause_test");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_pause"),
                relayer,
                relayerPrivateKey
            );
            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: contract is paused");
            vault.executeSponsoredTransfer(campaignId, auth, att);

            // 2. depositBudget is blocked
            vm.startPrank(sponsor);
            vm.expectRevert("AdgasVault: contract is paused");
            vault.depositBudget(campaignId, 1 * 1e6);

            // 3. createCampaign is blocked
            vm.expectRevert("AdgasVault: contract is paused");
            vault.createCampaign(keccak256("blocked_camp"), 50_000, 0, relayer);

            // 4. Emergency capital recovery: sponsor CAN safely withdraw remaining budget during pause!
            uint256 sponsorBalBefore = usdc.balanceOf(sponsor);
            vault.withdrawRemaining(campaignId, 10 * 1e6);
            assertEq(usdc.balanceOf(sponsor) - sponsorBalBefore, 10 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), 0);
            vm.stopPrank();

            // 5. Admin unpauses vault
            vault.unpause();
            assertFalse(vault.paused());
        }

        function test_MultipleCampaigns_AccountingIsolation() public {
            bytes32 campA = keccak256("campaign_A");
            bytes32 campB = keccak256("campaign_B");

            address sponsorB = address(0xBBBB);
            usdc.mint(sponsorB, 100 * 1e6);

            vm.prank(sponsor);
            vault.createCampaign(campA, 50_000, 0, relayer);

            vm.prank(sponsorB);
            vault.createCampaign(campB, 50_000, 0, relayer);

            // Deposit 10 USDC into Campaign A, 20 USDC into Campaign B
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campA, 10 * 1e6);
            vm.stopPrank();

            vm.startPrank(sponsorB);
            usdc.approve(address(vault), 20 * 1e6);
            vault.depositBudget(campB, 20 * 1e6);
            vm.stopPrank();

            assertEq(vault.totalEscrowBalanceUsdc(), 30 * 1e6);

            // Execute transfer using Campaign A
            bytes32 nonce = keccak256("nonce_multi_camp_A");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campA,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_multi_A"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campA, auth, att);

            // Verify Campaign B available balance was 100% UNTOUCHED
            (, uint256 availB, uint256 lifeB, uint256 settledB,,,) = vault.getCampaign(campB);
            assertEq(availB, 20 * 1e6);
            assertEq(lifeB, 20 * 1e6);
            assertEq(settledB, 0);

            // Verify Campaign A reflects its own deduction
            (, uint256 availA,, uint256 settledA,,,) = vault.getCampaign(campA);
            assertEq(availA + settledA, 10 * 1e6);
            assertEq(vault.totalEscrowBalanceUsdc(), availA + availB);
        }

        function test_RevertWhen_AuthorizationExpired() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            // Warp time to 1,000
            vm.warp(1000);

            bytes32 nonce = keccak256("nonce_auth_expired");
            // validBefore is in the past (900 < 1000)
            uint256 validBefore = 900;
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), user, address(vault), 5 * 1e6, 0, validBefore, nonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));
            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: validBefore,
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                validBefore,
                10_000,
                1100,
                keccak256("att_auth_expired"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: authorization expired");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        function test_RevertWhen_AttestationExpired() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            vm.warp(1000);

            bytes32 nonce = keccak256("nonce_att_expired");
            uint256 validBefore = 1100;
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), user, address(vault), 5 * 1e6, 0, validBefore, nonce
                )
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(userPrivateKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), hash)));
            AdgasSponsorVault.AuthorizationParams memory auth = AdgasSponsorVault.AuthorizationParams({
                from: user,
                to: address(vault),
                value: 5 * 1e6,
                validAfter: 0,
                validBefore: validBefore,
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            // Attestation expiry is in the past (1000 <= 1000)
            AdgasSponsorVault.SponsorshipAttestation memory att = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                validBefore,
                10_000,
                1000,
                keccak256("att_expired"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: attestation expired");
            vault.executeSponsoredTransfer(campaignId, auth, att);
        }

        function test_RevertWhen_ReplaySettlementId() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 nonce = keccak256("nonce_replay_settlement");
            bytes32 hash = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce
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
                nonce: nonce,
                v: v,
                r: r,
                s: s
            });
            AdgasSponsorVault.SponsorshipAttestation memory att1 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_rep_1"),
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth, att1);

            // Attempt second execution with same user nonce (settlement ID)
            AdgasSponsorVault.SponsorshipAttestation memory att2 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                keccak256("att_rep_2"),
                relayer,
                relayerPrivateKey
            );
            // Step 5 blocks reuse via authorizationState
            vm.prank(relayer);
            vm.expectRevert("AdgasVault: authorization nonce already used");
            vault.executeSponsoredTransfer(campaignId, auth, att2);

            // Verify the vault's independent settlement replay protection mapping recorded the execution
            bytes32 settlementId = vault.computeSettlementId(campaignId, user, nonce);
            assertTrue(vault.executedSettlements(settlementId), "Settlement ID must be marked executed");
        }

        function test_RevertWhen_ReplayAttestationNonce() public {
            vm.prank(sponsor);
            vault.createCampaign(campaignId, 50_000, 0, relayer);
            vm.startPrank(sponsor);
            usdc.approve(address(vault), 10 * 1e6);
            vault.depositBudget(campaignId, 10 * 1e6);
            vm.stopPrank();

            bytes32 reusedAttNonce = keccak256("shared_att_nonce");

            bytes32 nonce1 = keccak256("nonce_att_rep_1");
            bytes32 hash1 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce1
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
                nonce: nonce1,
                v: v1,
                r: r1,
                s: s1
            });
            AdgasSponsorVault.SponsorshipAttestation memory att1 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce1,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                reusedAttNonce,
                relayer,
                relayerPrivateKey
            );

            vm.txGasPrice(1 gwei);
            vm.prank(relayer);
            vault.executeSponsoredTransfer(campaignId, auth1, att1);

            // Attempt second execution with different user nonce but same attestation nonce
            bytes32 nonce2 = keccak256("nonce_att_rep_2");
            bytes32 hash2 = keccak256(
                abi.encode(
                    usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    user,
                    address(vault),
                    5 * 1e6,
                    0,
                    block.timestamp + 300,
                    nonce2
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
                nonce: nonce2,
                v: v2,
                r: r2,
                s: s2
            });
            AdgasSponsorVault.SponsorshipAttestation memory att2 = _createAttestation(
                campaignId,
                user,
                recipient,
                5 * 1e6,
                nonce2,
                0,
                block.timestamp + 300,
                10_000,
                block.timestamp + 300,
                reusedAttNonce,
                relayer,
                relayerPrivateKey
            );

            vm.prank(relayer);
            vm.expectRevert("AdgasVault: attestation already executed");
            vault.executeSponsoredTransfer(campaignId, auth2, att2);
        }
    }
