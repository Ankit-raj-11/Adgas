// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IERC20WithEIP3009.sol";
import "./utils/ECDSA.sol";

/**
 * @title AdgasSponsorVault
 * @notice Production-grade on-chain escrow vault, payment router, and gas reimbursement engine for Adgas on Arc Mainnet.
 *
 * Core Architectural Safeguards:
 * 1. Front-Running Immune Routing (EIP-3009): Uses receiveWithAuthorization where auth.to == address(this).
 *    Because EIP-3009 enforces msg.sender == to, third-party mempool front-running is impossible.
 *    The vault receives the tokens and forwards them to attestation.recipient.
 * 2. Relayer Substitution Defense: The attestation explicitly binds the executing relayer (attestation.relayer == msg.sender).
 * 3. Temporal Coupling: User authorization validity window is strictly bounded to expire no later than the attestation.
 * 4. Campaign-Scoped Attestation Replay Protection: executedAttestations is keyed by keccak256(campaignId, attester, nonce),
 *    preventing cross-campaign or cross-signer nonce collisions. Non-zero nonces are strictly enforced.
 * 5. Sovereign Sponsor Access Control: Sponsors explicitly designate and manage authorized attesters for their campaigns.
 * 6. Best-Effort Partial Reimbursement (SEC-04): Reimbursement is bounded by min(gas ceiling, attestation cap, per-tx cap,
 *    remaining cumulative budget, available campaign balance). User payments always execute even if subsidy is partial or zero.
 * 7. OpenZeppelin Math Library (SEC-01): calculateUsdcGasCeiling uses version-pinned OpenZeppelin Math.mulDiv with Rounding.Ceil.
 * 8. Trapped Capital Recovery (SEC-06): sweepUnallocatedTokens enables owner recovery of accidental direct transfers,
 *    strictly bounded above totalEscrowBalanceUsdc with post-sweep solvency assertion.
 *
 * Operational & Economic Limitations (SEC-02 & SEC-03):
 * - On-Chain Reimbursement is an Estimate (SEC-03): Transaction gas reimbursement calculated on-chain provides a calibrated
 *   economic subsidy ceiling. Exact network gas costs and relayer P&L must be reconciled off-chain against mined transaction receipts.
 * - Relayer Revert Risk (SEC-02): EVM transactions are atomic. If a sponsored transfer reverts on-chain (e.g. user revoked balance
 *   between broadcast and mining), the relayer pays the network base gas fee without on-chain reimbursement. Relayers must
 *   mitigate this risk off-chain via preflight simulation and rate limiting.
 */
contract AdgasSponsorVault {
    // Canonical Arc Mainnet USDC Address & Chain ID
    address public constant ARC_MAINNET_USDC = 0x3600000000000000000000000000000000000000;
    uint256 public constant ARC_MAINNET_CHAIN_ID = 5042;

    // Maximum allowable reimbursement subsidy cap per transaction (10 USDC = 10,000,000 units with 6 decimals)
    uint256 public constant MAX_PER_TX_REIMBURSEMENT_CAP_USDC = 10 * 1e6;

    // Maximum single deposit cap (1,000,000 USDC)
    uint256 public constant MAX_SINGLE_DEPOSIT_CAP = 1_000_000 * 1e6;

    // Maximum transfer cap per sponsored payment (100,000 USDC)
    uint256 public constant MAX_TRANSFER_CAP = 100_000 * 1e6;

    // Maximum user authorization validity window (24 hours)
    uint256 public constant MAX_AUTHORIZATION_WINDOW = 24 hours;

    // Maximum attestation validity lifetime to prevent hoarding (30 minutes)
    uint256 public constant MAX_ATTESTATION_WINDOW = 30 minutes;

    // Scale factor between Arc 18-decimal native gas and 6-decimal USDC (10^12)
    uint256 public constant WEI_TO_USDC_SCALE = 1e12;

    // Base intrinsic transaction gas cost
    uint256 public constant BASE_INTRINSIC_GAS = 21_000;

    // Estimated post-measurement overhead gas (transfers, event emission, storage updates)
    uint256 public constant POST_EXECUTION_GAS_OVERHEAD = 35_000;

    // EIP-712 Attestation Domain Typehashes
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // Complete EIP-712 SponsorshipAttestation Typehash binding temporal window and executing relayer
    bytes32 public constant SPONSORSHIP_ATTESTATION_TYPEHASH = keccak256(
        "SponsorshipAttestation(bytes32 campaignId,address user,address recipient,uint256 amountUsdc,bytes32 userNonce,uint256 validAfter,uint256 validBefore,uint256 maxGasReimbursementUsdc,uint256 expiry,bytes32 attestationNonce,address relayer)"
    );

    // Canonical Arc Mainnet USDC Token Interface
    IERC20WithEIP3009 public immutable usdc;

    // EIP-712 Domain Separator for Sponsorship Attestations
    bytes32 public immutable DOMAIN_SEPARATOR;

    // Two-step ownership management
    address public owner;
    address public pendingOwner;

    // Emergency circuit-breaker pause
    bool public paused;

    // Total active escrow accounting invariant
    uint256 public totalEscrowBalanceUsdc;

    // Price of 1 native gas token in USDC units (scaled by 1e6).
    // On Arc Mainnet, the native fee token is USDC, so 1 native token = 1.000000 USDC (1e6).
    uint256 public nativeTokenPriceInUsdc = 1e6;

    struct AuthorizationParams {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct SponsorshipAttestation {
        bytes32 campaignId;
        address user;
        address recipient;
        uint256 amountUsdc;
        bytes32 userNonce;
        uint256 validAfter;
        uint256 validBefore;
        uint256 maxGasReimbursementUsdc;
        uint256 expiry;
        bytes32 attestationNonce;
        address relayer; // Bound executing relayer
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Campaign {
        address sponsor;
        uint256 availableBalanceUsdc;
        uint256 lifetimeDepositedUsdc;
        uint256 settledReimbursementUsdc;
        uint256 maxGasPerTxUsdc;
        uint256 cumulativeSpendLimitUsdc;
        bool isActive;
    }

    // campaignId => Campaign details
    mapping(bytes32 => Campaign) public campaigns;

    // campaignId => attester => isAuthorized
    mapping(bytes32 => mapping(address => bool)) public campaignAttesters;

    // Authorized relayers permitted to execute sponsored transfers on behalf of users
    mapping(address => bool) public authorizedRelayers;

    // Replay protection 1: Authorizer-scoped settlements (campaignId, authorizer, nonce)
    mapping(bytes32 => bool) public executedSettlements;

    // Replay protection 2: Campaign-scoped attestation nonces (campaignId, attester, nonce)
    mapping(bytes32 => bool) public executedAttestations;

    // Reentrancy guard
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    // -------------------------------------------------------------
    // Events
    // -------------------------------------------------------------
    event CampaignCreated(
        bytes32 indexed campaignId, address indexed sponsor, uint256 maxGasPerTxUsdc, uint256 cumulativeSpendLimitUsdc
    );
    event CampaignAttesterUpdated(bytes32 indexed campaignId, address indexed attester, bool authorized);
    event BudgetDeposited(bytes32 indexed campaignId, address indexed sponsor, uint256 amountUsdc);
    event FundsWithdrawn(bytes32 indexed campaignId, address indexed sponsor, uint256 amountUsdc);
    event SponsoredTransferExecuted(
        bytes32 indexed campaignId,
        bytes32 indexed settlementId,
        bytes32 attestationNonce,
        address indexed authorizer,
        address recipient,
        uint256 amountUsdc,
        uint256 gasReimbursementUsdc,
        address relayer
    );
    event CampaignStatusUpdated(bytes32 indexed campaignId, bool isActive);
    event CampaignMaxGasUpdated(bytes32 indexed campaignId, uint256 newMaxGasPerTxUsdc);
    event RelayerStatusUpdated(address indexed relayer, bool isAuthorized);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProtocolPaused(address account);
    event ProtocolUnpaused(address account);
    event NativeTokenPriceUpdated(uint256 newPriceUsdc);
    event UnallocatedTokensSwept(address indexed to, uint256 amountUsdc);

    // -------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "AdgasVault: caller is not the owner");
        _;
    }

    modifier onlyRelayer() {
        require(authorizedRelayers[msg.sender], "AdgasVault: caller is not an authorized relayer");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "AdgasVault: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier whenNotPaused() {
        require(!paused, "AdgasVault: contract is paused");
        _;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "AdgasVault: zero address for USDC");
        require(_usdc.code.length > 0, "AdgasVault: target USDC has no code");

        // Canonical USDC address enforcement on Arc Mainnet
        if (block.chainid == ARC_MAINNET_CHAIN_ID) {
            require(_usdc == ARC_MAINNET_USDC, "AdgasVault: must use canonical Arc USDC on mainnet");
        }

        usdc = IERC20WithEIP3009(_usdc);
        require(usdc.decimals() == 6, "AdgasVault: target token decimals must be 6");

        // Runtime verification of EIP-3009 interface support
        try usdc.authorizationState(address(0), bytes32(0)) returns (
            bool
        ) {
        // EIP-3009 authorizationState method exists and responds
        }
        catch {
            revert("AdgasVault: target token does not support EIP-3009 authorizationState");
        }

        try usdc.DOMAIN_SEPARATOR() returns (
            bytes32
        ) {
        // Token implements DOMAIN_SEPARATOR
        }
        catch {
            revert("AdgasVault: target token does not implement DOMAIN_SEPARATOR");
        }

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256(bytes("AdgasProtocol")), keccak256(bytes("1")), block.chainid, address(this)
            )
        );

        owner = msg.sender;
        _status = _NOT_ENTERED;
        paused = false;
    }

    // -------------------------------------------------------------
    // Two-Step Access Control & Circuit Breaker
    // -------------------------------------------------------------

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AdgasVault: zero address new owner");
        require(newOwner != owner, "AdgasVault: new owner is current owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "AdgasVault: caller is not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setRelayer(address relayer, bool status) external onlyOwner {
        require(relayer != address(0), "AdgasVault: zero address relayer");
        authorizedRelayers[relayer] = status;
        emit RelayerStatusUpdated(relayer, status);
    }

    function pause() external onlyOwner {
        require(!paused, "AdgasVault: already paused");
        paused = true;
        emit ProtocolPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        require(paused, "AdgasVault: not paused");
        paused = false;
        emit ProtocolUnpaused(msg.sender);
    }

    function setNativeTokenPriceInUsdc(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "AdgasVault: price must be > 0");
        nativeTokenPriceInUsdc = newPrice;
        emit NativeTokenPriceUpdated(newPrice);
    }

    // -------------------------------------------------------------
    // Campaign Management
    // -------------------------------------------------------------

    /**
     * @notice Creates a new sponsor campaign with caps and designates an initial authorized attester.
     * @param campaignId Unique 32-byte identifier for the campaign.
     * @param maxGasPerTxUsdc Maximum USDC reimbursement per transaction (up to MAX_PER_TX_REIMBURSEMENT_CAP_USDC = 10 USDC).
     * @param cumulativeSpendLimitUsdc Cumulative reimbursement limit across the campaign lifetime.
     *        Passing 0 indicates unlimited cumulative spend (internally represented as type(uint256).max),
     *        allowing the campaign to sponsor transactions up to its entire deposited available balance without an artificial cap.
     * @param initialAttester Address authorized to sign sponsorship attestations for this campaign.
     */
    function createCampaign(
        bytes32 campaignId,
        uint256 maxGasPerTxUsdc,
        uint256 cumulativeSpendLimitUsdc,
        address initialAttester
    ) external whenNotPaused {
        require(campaignId != bytes32(0), "AdgasVault: invalid campaignId");
        require(campaigns[campaignId].sponsor == address(0), "AdgasVault: campaign already exists");
        require(
            maxGasPerTxUsdc > 0 && maxGasPerTxUsdc <= MAX_PER_TX_REIMBURSEMENT_CAP_USDC,
            "AdgasVault: max gas outside bounds"
        );

        uint256 limit = cumulativeSpendLimitUsdc == 0 ? type(uint256).max : cumulativeSpendLimitUsdc;

        campaigns[campaignId] = Campaign({
            sponsor: msg.sender,
            availableBalanceUsdc: 0,
            lifetimeDepositedUsdc: 0,
            settledReimbursementUsdc: 0,
            maxGasPerTxUsdc: maxGasPerTxUsdc,
            cumulativeSpendLimitUsdc: limit,
            isActive: true
        });

        // The creator is automatically authorized as an attester
        campaignAttesters[campaignId][msg.sender] = true;
        emit CampaignAttesterUpdated(campaignId, msg.sender, true);

        if (initialAttester != address(0) && initialAttester != msg.sender) {
            campaignAttesters[campaignId][initialAttester] = true;
            emit CampaignAttesterUpdated(campaignId, initialAttester, true);
        }

        emit CampaignCreated(campaignId, msg.sender, maxGasPerTxUsdc, limit);
    }

    /**
     * @notice Overload for backward compatibility without initialAttester parameter.
     * @param campaignId Unique 32-byte identifier for the campaign.
     * @param maxGasPerTxUsdc Maximum USDC reimbursement per transaction (up to MAX_PER_TX_REIMBURSEMENT_CAP_USDC = 10 USDC).
     * @param cumulativeSpendLimitUsdc Cumulative reimbursement limit across the campaign lifetime.
     *        Passing 0 indicates unlimited cumulative spend (internally represented as type(uint256).max).
     */
    function createCampaign(bytes32 campaignId, uint256 maxGasPerTxUsdc, uint256 cumulativeSpendLimitUsdc)
        external
        whenNotPaused
    {
        require(campaignId != bytes32(0), "AdgasVault: invalid campaignId");
        require(campaigns[campaignId].sponsor == address(0), "AdgasVault: campaign already exists");
        require(
            maxGasPerTxUsdc > 0 && maxGasPerTxUsdc <= MAX_PER_TX_REIMBURSEMENT_CAP_USDC,
            "AdgasVault: max gas outside bounds"
        );

        uint256 limit = cumulativeSpendLimitUsdc == 0 ? type(uint256).max : cumulativeSpendLimitUsdc;

        campaigns[campaignId] = Campaign({
            sponsor: msg.sender,
            availableBalanceUsdc: 0,
            lifetimeDepositedUsdc: 0,
            settledReimbursementUsdc: 0,
            maxGasPerTxUsdc: maxGasPerTxUsdc,
            cumulativeSpendLimitUsdc: limit,
            isActive: true
        });

        campaignAttesters[campaignId][msg.sender] = true;
        emit CampaignAttesterUpdated(campaignId, msg.sender, true);

        emit CampaignCreated(campaignId, msg.sender, maxGasPerTxUsdc, limit);
    }

    /**
     * @notice Allows a campaign sponsor to authorize or revoke attestation signers specifically for their campaign.
     * Revocation takes immediate effect at execution time.
     */
    function setCampaignAttester(bytes32 campaignId, address attester, bool authorized) external whenNotPaused {
        require(campaigns[campaignId].sponsor == msg.sender, "AdgasVault: caller is not campaign sponsor");
        require(attester != address(0), "AdgasVault: zero address attester");
        campaignAttesters[campaignId][attester] = authorized;
        emit CampaignAttesterUpdated(campaignId, attester, authorized);
    }

    function isAttesterAuthorizedForCampaign(bytes32 campaignId, address attester) external view returns (bool) {
        return campaignAttesters[campaignId][attester];
    }

    /**
     * @notice Deposit USDC budget into an existing campaign using ERC-20 transferFrom with balance measurement.
     */
    function depositBudget(bytes32 campaignId, uint256 amountUsdc) external nonReentrant whenNotPaused {
        require(amountUsdc > 0 && amountUsdc <= MAX_SINGLE_DEPOSIT_CAP, "AdgasVault: invalid deposit amount");
        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor != address(0), "AdgasVault: campaign does not exist; call createCampaign first");
        require(camp.sponsor == msg.sender, "AdgasVault: only campaign sponsor can deposit funds");

        uint256 balBefore = usdc.balanceOf(address(this));
        _safeTransferFrom(address(usdc), msg.sender, address(this), amountUsdc);
        uint256 actualReceived = usdc.balanceOf(address(this)) - balBefore;
        require(actualReceived > 0, "AdgasVault: zero deposit received");

        camp.availableBalanceUsdc += actualReceived;
        camp.lifetimeDepositedUsdc += actualReceived;
        totalEscrowBalanceUsdc += actualReceived;

        // Solvency post-check
        require(usdc.balanceOf(address(this)) >= totalEscrowBalanceUsdc, "AdgasVault: solvency check failed");

        emit BudgetDeposited(campaignId, msg.sender, actualReceived);
    }

    /**
     * @notice Deposit USDC budget using EIP-3009 receiveWithAuthorization.
     * Front-running proof: authorization specifies recipient as address(this).
     */
    function depositBudgetWithReceiveAuthorization(bytes32 campaignId, AuthorizationParams calldata auth)
        external
        nonReentrant
        whenNotPaused
    {
        require(auth.value > 0 && auth.value <= MAX_SINGLE_DEPOSIT_CAP, "AdgasVault: invalid deposit amount");
        require(auth.to == address(this), "AdgasVault: recipient must be vault");
        require(auth.validAfter <= block.timestamp, "AdgasVault: authorization not yet valid");
        require(block.timestamp < auth.validBefore, "AdgasVault: authorization expired");
        require(
            auth.validBefore <= block.timestamp + MAX_AUTHORIZATION_WINDOW,
            "AdgasVault: authorization validity window too long"
        );
        require(!usdc.authorizationState(auth.from, auth.nonce), "AdgasVault: authorization already used");

        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor != address(0), "AdgasVault: campaign does not exist; call createCampaign first");
        require(camp.sponsor == auth.from, "AdgasVault: sponsor mismatch");

        uint256 balBefore = usdc.balanceOf(address(this));
        usdc.receiveWithAuthorization(
            auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );
        uint256 actualReceived = usdc.balanceOf(address(this)) - balBefore;
        require(actualReceived > 0, "AdgasVault: zero deposit received");

        camp.availableBalanceUsdc += actualReceived;
        camp.lifetimeDepositedUsdc += actualReceived;
        totalEscrowBalanceUsdc += actualReceived;

        require(usdc.balanceOf(address(this)) >= totalEscrowBalanceUsdc, "AdgasVault: solvency check failed");

        emit BudgetDeposited(campaignId, auth.from, actualReceived);
    }

    // -------------------------------------------------------------
    // Calibrated Calldata Gas Calculation
    // -------------------------------------------------------------

    function _calculateCalldataGas() internal pure returns (uint256) {
        uint256 gasCost = 0;
        bytes calldata data = msg.data;
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == 0) {
                gasCost += 4;
            } else {
                gasCost += 16;
            }
        }
        return gasCost;
    }

    // -------------------------------------------------------------
    // Atomic Sponsored Transfer & Verified Gas Settlement
    // -------------------------------------------------------------

    /**
     * @notice Atomic Sponsored Transfer:
     * 1. Front-Running Immune Routing: User signs EIP-3009 receiveWithAuthorization where auth.to == address(this).
     *    Because EIP-3009 enforces msg.sender == to, third-party mempool front-running is impossible.
     *    The vault receives the tokens and forwards them to attestation.recipient.
     * 2. Relayer Substitution Defense: attestation.relayer == msg.sender is strictly asserted.
     * 3. Temporal Coupling: auth.validBefore <= attestation.expiry ensures authorization cannot outlive attestation.
     * 4. Strict Expiry Upper Bound: block.timestamp < attestation.expiry.
     * 5. Campaign-Scoped Attestation Replay: executedAttestations is keyed by keccak256(campaignId, attester, nonce).
     *    Non-zero attestation nonces are strictly enforced.
     * 6. Best-Effort Partial Reimbursement (SEC-04): Reimbursement is bounded by min(gas ceiling, attestation cap, per-tx cap,
     *    remaining cumulative limit, available balance). User payment proceeds even if remaining budget provides partial/zero subsidy.
     * 7. Safe Failure Behavior for Gas Cost: Evaluates intermediate wei cost with Math.tryMul to prevent arithmetic
     *    multiplication overflow in gas expenditure from reverting the user payment. If the wei cost or quotient
     *    overflows uint256, the ceiling safely defaults to attestation.maxGasReimbursementUsdc rather than bricking the tx.
     * 8. Revert Coupling & Atomicity: All state modifications occur in a single atomic transaction. If the relayer
     *    reimbursement transfer fails (e.g. relayer is blacklisted by token), the entire call reverts atomically,
     *    rolling back the user payment so no user funds are deducted and no recipient tokens are transferred.
     */
    function executeSponsoredTransfer(
        bytes32 campaignId,
        AuthorizationParams calldata auth,
        SponsorshipAttestation calldata attestation
    ) external onlyRelayer nonReentrant whenNotPaused {
        uint256 startGas = gasleft();

        // Unconditionally reject zero gas price transactions
        require(tx.gasprice > 0, "AdgasVault: zero gas price transaction rejected");

        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor != address(0), "AdgasVault: campaign does not exist");
        require(camp.isActive, "AdgasVault: campaign is inactive or paused");

        // 1. Relayer Binding: executing relayer must match attestation
        require(attestation.relayer == msg.sender, "AdgasVault: attestation not bound to executing relayer");

        // 2. Exact Parameter Binding Verification
        require(attestation.campaignId == campaignId, "AdgasVault: attestation campaign mismatch");
        require(attestation.user == auth.from, "AdgasVault: attestation authorizer mismatch");
        require(attestation.amountUsdc == auth.value, "AdgasVault: attestation value mismatch");
        require(attestation.userNonce == auth.nonce, "AdgasVault: attestation nonce mismatch");
        require(attestation.validAfter == auth.validAfter, "AdgasVault: attestation validAfter mismatch");
        require(attestation.validBefore == auth.validBefore, "AdgasVault: attestation validBefore mismatch");
        require(
            attestation.maxGasReimbursementUsdc <= MAX_PER_TX_REIMBURSEMENT_CAP_USDC,
            "AdgasVault: attestation max gas exceeds protocol cap"
        );
        require(attestation.attestationNonce != bytes32(0), "AdgasVault: zero attestation nonce");

        // 3. Strict Expiry & Temporal Coupling Safeguards
        require(block.timestamp < attestation.expiry, "AdgasVault: attestation expired");
        require(
            attestation.expiry <= block.timestamp + MAX_ATTESTATION_WINDOW,
            "AdgasVault: attestation window exceeds maximum allowed"
        );
        require(auth.validBefore <= attestation.expiry, "AdgasVault: authorization validity exceeds attestation expiry");

        // 4. Recipient Integrity: Front-running immune routing
        require(
            auth.to == address(this), "AdgasVault: authorization recipient must be vault for receiveWithAuthorization"
        );
        require(attestation.recipient != address(this), "AdgasVault: final recipient cannot be vault");
        require(attestation.recipient != address(0), "AdgasVault: final recipient cannot be zero address");

        // 5. Pre-validate User Authorization Parameters
        require(auth.from != address(0), "AdgasVault: invalid from address");
        require(auth.value > 0 && auth.value <= MAX_TRANSFER_CAP, "AdgasVault: transfer value outside bounds");
        require(auth.validAfter <= block.timestamp, "AdgasVault: authorization not yet valid");
        require(block.timestamp < auth.validBefore, "AdgasVault: authorization expired");
        require(
            auth.validBefore <= block.timestamp + MAX_AUTHORIZATION_WINDOW, "AdgasVault: authorization window too long"
        );
        require(!usdc.authorizationState(auth.from, auth.nonce), "AdgasVault: authorization nonce already used");

        // 6. Cryptographic EIP-712 Verification with OpenZeppelin-standard ECDSA
        bytes32 attestationStructHash = keccak256(
            abi.encode(
                SPONSORSHIP_ATTESTATION_TYPEHASH,
                attestation.campaignId,
                attestation.user,
                attestation.recipient,
                attestation.amountUsdc,
                attestation.userNonce,
                attestation.validAfter,
                attestation.validBefore,
                attestation.maxGasReimbursementUsdc,
                attestation.expiry,
                attestation.attestationNonce,
                attestation.relayer
            )
        );
        bytes32 attestationDigest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, attestationStructHash));
        address attester = ECDSA.recover(attestationDigest, attestation.v, attestation.r, attestation.s);

        // 7. Campaign-Specific Attester Authorization: Sponsor sovereign control
        require(campaignAttesters[campaignId][attester], "AdgasVault: attester not authorized for this campaign");

        // 8. Independent Replay Protection with Campaign-Scoped Attestation Key
        bytes32 settlementId = computeSettlementId(campaignId, auth.from, auth.nonce);
        require(!executedSettlements[settlementId], "AdgasVault: settlement already executed");
        executedSettlements[settlementId] = true;

        bytes32 attestationKey = keccak256(abi.encode(campaignId, attester, attestation.attestationNonce));
        require(!executedAttestations[attestationKey], "AdgasVault: attestation already executed");
        executedAttestations[attestationKey] = true;

        // 9. Execute Front-Running Immune User Payment
        // Step 9a: Pull authorized payment into vault via receiveWithAuthorization (cannot be front-run)
        usdc.receiveWithAuthorization(
            auth.from, address(this), auth.value, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );

        // Step 9b: Forward user's USDC directly to the final recipient
        _safeTransfer(address(usdc), attestation.recipient, auth.value);

        // 10. Calibrated Gas Reimbursement Calculation (SEC-01 & SEC-04)
        uint256 allowedReimbursement = 0;
        if (attestation.maxGasReimbursementUsdc > 0) {
            uint256 executionGas = startGas - gasleft();
            uint256 calldataGas = _calculateCalldataGas();
            uint256 totalGasExpenditure = BASE_INTRINSIC_GAS + calldataGas + executionGas + POST_EXECUTION_GAS_OVERHEAD;
            // Safe failure behavior: guard against intermediate wei gas cost overflow
            (bool mulOk, uint256 actualWeiCost) = Math.tryMul(totalGasExpenditure, tx.gasprice);
            uint256 actualUsdcCeiling;
            if (!mulOk) {
                // Wei gas cost calculation overflows uint256: gas price is astronomically high.
                // Safely cap ceiling to attestation.maxGasReimbursementUsdc rather than reverting the user payment.
                actualUsdcCeiling = attestation.maxGasReimbursementUsdc;
            } else {
                try this.calculateUsdcGasCeiling(actualWeiCost) returns (uint256 ceiling) {
                    actualUsdcCeiling = ceiling;
                } catch {
                    // Quotient overflow in calculateUsdcGasCeiling: safely cap to attestation ceiling
                    actualUsdcCeiling = attestation.maxGasReimbursementUsdc;
                }
            }

            // Bounded to minimum of calibrated gas ceiling, attestation cap, and campaign per-tx cap
            uint256 desiredReimbursement = actualUsdcCeiling < attestation.maxGasReimbursementUsdc
                ? actualUsdcCeiling
                : attestation.maxGasReimbursementUsdc;

            if (desiredReimbursement > camp.maxGasPerTxUsdc) {
                desiredReimbursement = camp.maxGasPerTxUsdc;
            }

            // Determine remaining cumulative cap allowance
            uint256 remainingCumulative = camp.settledReimbursementUsdc >= camp.cumulativeSpendLimitUsdc
                ? 0
                : camp.cumulativeSpendLimitUsdc - camp.settledReimbursementUsdc;

            // Partial reimbursement (SEC-04): capped to lesser of remaining cumulative budget and available liquid balance
            allowedReimbursement = desiredReimbursement;
            if (allowedReimbursement > remainingCumulative) {
                allowedReimbursement = remainingCumulative;
            }
            if (allowedReimbursement > camp.availableBalanceUsdc) {
                allowedReimbursement = camp.availableBalanceUsdc;
            }

            if (allowedReimbursement > 0) {
                camp.availableBalanceUsdc -= allowedReimbursement;
                camp.settledReimbursementUsdc += allowedReimbursement;
                totalEscrowBalanceUsdc -= allowedReimbursement;

                // Reimbursement is paid strictly to msg.sender (the executing relayer)
                _safeTransfer(address(usdc), msg.sender, allowedReimbursement);
            }
        }

        // 11. Solvency Post-Check Invariant
        require(usdc.balanceOf(address(this)) >= totalEscrowBalanceUsdc, "AdgasVault: solvency check failed");

        // 12. Emit Event Unconditionally
        emit SponsoredTransferExecuted(
            campaignId,
            settlementId,
            attestation.attestationNonce,
            auth.from,
            attestation.recipient,
            auth.value,
            allowedReimbursement,
            msg.sender
        );
    }

    // -------------------------------------------------------------
    // Sponsor Withdrawals & Controls (Emergency Recovery Enabled)
    // -------------------------------------------------------------

    /**
     * @notice Sponsor reclaims unspent USDC from their campaign escrow balance.
     * Accessible even during an emergency protocol pause so sponsors can safely recover capital.
     */
    function withdrawRemaining(bytes32 campaignId, uint256 amountUsdc) external nonReentrant {
        require(amountUsdc > 0, "AdgasVault: amount must be > 0");
        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor == msg.sender, "AdgasVault: only sponsor can withdraw");
        require(camp.availableBalanceUsdc >= amountUsdc, "AdgasVault: insufficient available balance");
        require(totalEscrowBalanceUsdc >= amountUsdc, "AdgasVault: invariant error in escrow accounting");

        camp.availableBalanceUsdc -= amountUsdc;
        totalEscrowBalanceUsdc -= amountUsdc;

        _safeTransfer(address(usdc), msg.sender, amountUsdc);

        require(usdc.balanceOf(address(this)) >= totalEscrowBalanceUsdc, "AdgasVault: solvency check failed");

        emit FundsWithdrawn(campaignId, msg.sender, amountUsdc);
    }

    /**
     * @notice Sponsor pauses/resumes their campaign. Callable even during a protocol pause.
     */
    function setCampaignStatus(bytes32 campaignId, bool isActive) external {
        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor == msg.sender, "AdgasVault: only sponsor can modify campaign");
        camp.isActive = isActive;
        emit CampaignStatusUpdated(campaignId, isActive);
    }

    /**
     * @notice Sponsor adjusts per-tx reimbursement ceiling within protocol bounds.
     */
    function setCampaignMaxGas(bytes32 campaignId, uint256 newMaxGasPerTxUsdc) external whenNotPaused {
        Campaign storage camp = campaigns[campaignId];
        require(camp.sponsor == msg.sender, "AdgasVault: only sponsor can modify campaign");
        require(
            newMaxGasPerTxUsdc > 0 && newMaxGasPerTxUsdc <= MAX_PER_TX_REIMBURSEMENT_CAP_USDC,
            "AdgasVault: max gas outside bounds"
        );
        camp.maxGasPerTxUsdc = newMaxGasPerTxUsdc;
        emit CampaignMaxGasUpdated(campaignId, newMaxGasPerTxUsdc);
    }

    // -------------------------------------------------------------
    // Admin Trapped Capital Recovery (SEC-06)
    // -------------------------------------------------------------

    /**
     * @notice Sweeps unallocated tokens (e.g. accidental direct ERC-20 transfers).
     * Restricted strictly to contract owner. Can only sweep tokens strictly above totalEscrowBalanceUsdc.
     * Accounted campaign funds are never touched.
     */
    function sweepUnallocatedTokens(address to) external onlyOwner nonReentrant {
        require(to != address(0), "AdgasVault: zero address recipient");
        uint256 contractBalance = usdc.balanceOf(address(this));
        require(contractBalance > totalEscrowBalanceUsdc, "AdgasVault: no unallocated tokens to sweep");
        uint256 unallocated = contractBalance - totalEscrowBalanceUsdc;

        _safeTransfer(address(usdc), to, unallocated);

        // Strict formal solvency invariant post-check
        require(usdc.balanceOf(address(this)) >= totalEscrowBalanceUsdc, "AdgasVault: solvency check failed");

        emit UnallocatedTokensSwept(to, unallocated);
    }

    // -------------------------------------------------------------
    // View Functions & Utilities
    // -------------------------------------------------------------

    /**
     * @notice Converts Arc 18-decimal native wei gas cost into 6-decimal USDC units using ceiling division.
     * Incorporates version-pinned OpenZeppelin Math.mulDiv with Rounding.Ceil (SEC-01).
     *
     * Unit Conversion Math:
     * - Arc Mainnet Native Fee Token: 18 decimals (1 token = 1e18 wei).
     * - ERC-20 USDC Token: 6 decimals (1 USDC = 1e6 units).
     * - Decimal scale difference: 18 - 6 = 12 (WEI_TO_USDC_SCALE = 1e12).
     *
     * At 1:1 Parity (nativeTokenPriceInUsdc == 1e6):
     *   usdcCost = ceil(nativeWeiGasCost * 1 / 1e12)
     *   - 0 wei -> 0 USDC
     *   - 1 wei -> 1 USDC unit (0.000001 USDC) due to ceiling rounding.
     *   - 1e12 wei -> 1 USDC unit.
     *   - 1e12 + 1 wei -> 2 USDC units.
     *   - 1e18 wei (1 full native token) -> 1e6 USDC units (1.000000 USDC).
     *
     * At General Economic Exchange Rate (nativeTokenPriceInUsdc != 1e6):
     *   usdcCost = ceil((nativeWeiGasCost * nativeTokenPriceInUsdc) / 1e18)
     *   where nativeTokenPriceInUsdc is the price of 1 native token in 6-decimal USDC units.
     *
     * @param nativeWeiGasCost Gas cost in 18-decimal wei.
     * @return Reimbursement ceiling in 6-decimal USDC units.
     */
    function calculateUsdcGasCeiling(uint256 nativeWeiGasCost) public view returns (uint256) {
        if (nativeWeiGasCost == 0) return 0;
        if (nativeTokenPriceInUsdc == 1e6) {
            // 1:1 Parity (Arc Mainnet native USDC fee token to 6-decimal USDC token)
            return Math.mulDiv(nativeWeiGasCost, 1, WEI_TO_USDC_SCALE, Math.Rounding.Ceil);
        } else {
            // General economic exchange rate: ceil((nativeWeiGasCost * nativeTokenPriceInUsdc) / 1e18)
            return Math.mulDiv(nativeWeiGasCost, nativeTokenPriceInUsdc, 1e18, Math.Rounding.Ceil);
        }
    }

    function computeSettlementId(bytes32 campaignId, address authorizer, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode(campaignId, authorizer, nonce));
    }

    function computeAttestationKey(bytes32 campaignId, address attester, bytes32 attestationNonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(campaignId, attester, attestationNonce));
    }

    function getCampaign(bytes32 campaignId)
        external
        view
        returns (
            address sponsor,
            uint256 availableBalanceUsdc,
            uint256 lifetimeDepositedUsdc,
            uint256 settledReimbursementUsdc,
            uint256 maxGasPerTxUsdc,
            uint256 cumulativeSpendLimitUsdc,
            bool isActive
        )
    {
        Campaign storage camp = campaigns[campaignId];
        return (
            camp.sponsor,
            camp.availableBalanceUsdc,
            camp.lifetimeDepositedUsdc,
            camp.settledReimbursementUsdc,
            camp.maxGasPerTxUsdc,
            camp.cumulativeSpendLimitUsdc,
            camp.isActive
        );
    }

    // -------------------------------------------------------------
    // SafeERC20 Low-Level Helper Functions
    // -------------------------------------------------------------

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20WithEIP3009.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "AdgasVault: safeTransfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20WithEIP3009.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "AdgasVault: safeTransferFrom failed");
    }
}
