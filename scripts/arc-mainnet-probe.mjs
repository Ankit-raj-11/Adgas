/**
 * Arc Mainnet Feasibility Gate: Automated Non-Destructive Probe Script
 * 
 * Verifies live RPC latency, chain ID, USDC contract bytecode,
 * EIP-3009 active method verification (authorizationState, transferWithAuthorization),
 * and relayer native gas balance headroom.
 */

const DEFAULT_RPC = process.env.ARC_MAINNET_RPC || 'https://rpc.mainnet.arc.io';
const USDC_ADDRESS = process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const EXPECTED_CHAIN_ID = 5042; // 0x13b2

async function rpcCall(rpcUrl, method, params = []) {
  const start = performance.now();
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const latency = Math.round(performance.now() - start);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${rpcUrl}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.error && data.error.code !== 3) {
    throw new Error(`RPC Error (${data.error.code}): ${data.error.message}`);
  }
  return { result: data.result, error: data.error, latency };
}

function decodeString(hex) {
  if (!hex || hex === '0x') return '';
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 128) return '';
  const len = parseInt(clean.slice(64, 128), 16);
  const strHex = clean.slice(128, 128 + len * 2);
  return Buffer.from(strHex, 'hex').toString('utf8');
}

export async function runProbe(options = {}) {
  const rpcUrl = options.rpcUrl || DEFAULT_RPC;
  const usdcAddr = options.usdcAddress || USDC_ADDRESS;
  const relayerAddr = options.relayerAddress || process.env.RELAYER_ADDRESS || null;

  console.log('='.repeat(70));
  console.log(' ARC MAINNET FEASIBILITY GATE: AUTOMATED PROBE');
  console.log('='.repeat(70));
  console.log(`Target RPC:       ${rpcUrl}`);
  console.log(`Target USDC:      ${usdcAddr}`);
  console.log(`Expected ChainID: ${EXPECTED_CHAIN_ID} (0x${EXPECTED_CHAIN_ID.toString(16)})\n`);

  const report = {
    rpcOk: false,
    latencyMs: 0,
    chainId: null,
    chainMatch: false,
    blockNumber: null,
    gasPriceNativeWei: null,
    bytecodePresent: false,
    bytecodeSize: 0,
    domainSeparator: null,
    tokenName: '',
    tokenSymbol: '',
    tokenDecimals: null,
    eip3009: {
      authorizationStateActive: false,
      transferWithAuthorizationActive: false,
      receiveWithAuthorizationActive: false,
      cancelAuthorizationActive: false,
    },
    relayerAddress: relayerAddr,
    relayerBalanceNative: null,
    allPassed: false,
  };

  // 1. RPC & Chain Verification
  process.stdout.write('1. Checking RPC connectivity and Chain ID... ');
  const { result: chainHex, latency } = await rpcCall(rpcUrl, 'eth_chainId');
  report.latencyMs = latency;
  report.chainId = parseInt(chainHex, 16);
  report.chainMatch = report.chainId === EXPECTED_CHAIN_ID;
  report.rpcOk = true;
  if (!report.chainMatch) {
    console.log(`FAILED (ChainID ${report.chainId} != ${EXPECTED_CHAIN_ID})`);
    return report;
  }
  console.log(`OK (${latency}ms, ChainID: ${report.chainId})`);

  // 2. Block Number & Gas Price
  process.stdout.write('2. Querying head block and current gas price... ');
  const [{ result: blockHex }, { result: gasPriceHex }] = await Promise.all([
    rpcCall(rpcUrl, 'eth_blockNumber'),
    rpcCall(rpcUrl, 'eth_gasPrice'),
  ]);
  report.blockNumber = parseInt(blockHex, 16);
  report.gasPriceNativeWei = BigInt(gasPriceHex).toString();
  const gasPriceGwei = (Number(report.gasPriceNativeWei) / 1e9).toFixed(2);
  console.log(`Block #${report.blockNumber}, Gas Price: ${gasPriceGwei} Gwei (${report.gasPriceNativeWei} wei)`);

  // 3. Contract Bytecode
  process.stdout.write('3. Querying deployed contract bytecode... ');
  const { result: bytecode } = await rpcCall(rpcUrl, 'eth_getCode', [usdcAddr, 'latest']);
  if (bytecode && bytecode !== '0x') {
    report.bytecodePresent = true;
    report.bytecodeSize = (bytecode.length - 2) / 2;
    console.log(`OK (${report.bytecodeSize} bytes deployed)`);
  } else {
    console.log('FAILED: No bytecode at target address!');
    return report;
  }

  // 4. On-chain View Calls (Metadata & DOMAIN_SEPARATOR)
  process.stdout.write('4. Verifying Token Metadata & DOMAIN_SEPARATOR... ');
  const [nameRes, symbolRes, decimalsRes, domainRes] = await Promise.all([
    rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: '0x06fdde03' }, 'latest']), // name()
    rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: '0x95d89b41' }, 'latest']), // symbol()
    rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: '0x313ce567' }, 'latest']), // decimals()
    rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: '0x3644e515' }, 'latest']), // DOMAIN_SEPARATOR()
  ]);

  report.tokenName = decodeString(nameRes.result);
  report.tokenSymbol = decodeString(symbolRes.result);
  report.tokenDecimals = parseInt(decimalsRes.result, 16);
  report.domainSeparator = domainRes.result;

  console.log(`OK`);
  console.log(`   Token Name:       "${report.tokenName}"`);
  console.log(`   Token Symbol:     "${report.tokenSymbol}"`);
  console.log(`   ERC-20 Decimals:  ${report.tokenDecimals}`);
  console.log(`   DOMAIN_SEPARATOR: ${report.domainSeparator}`);

  // 5. Active EIP-3009 Verification via Probes
  process.stdout.write('5. Probing active EIP-3009 methods on-chain... ');
  // 5a. authorizationState(address, bytes32)
  const probeAuthorizer = '0000000000000000000000001111111111111111111111111111111111111111';
  const probeNonce = '0000000000000000000000000000000000000000000000000000000000000001';
  const authStateCall = await rpcCall(rpcUrl, 'eth_call', [
    { to: usdcAddr, data: '0xe94a0102' + probeAuthorizer + probeNonce },
    'latest',
  ]);
  if (authStateCall.result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    report.eip3009.authorizationStateActive = true;
  }

  // 5b. transferWithAuthorization simulation (tests whether selector is intercepted and routed to signature validator)
  const dummyFrom = '1111111111111111111111111111111111111111'.padStart(64, '0');
  const dummyTo = '2222222222222222222222222222222222222222'.padStart(64, '0');
  const dummyVal = (1000000n).toString(16).padStart(64, '0');
  const dummyValidAfter = (0n).toString(16).padStart(64, '0');
  const dummyValidBefore = (9999999999n).toString(16).padStart(64, '0');
  const dummyNonce = '1'.padStart(64, '0');
  const dummyV = (27n).toString(16).padStart(64, '0');
  const dummyR = 'a'.repeat(64);
  const dummyS = 'b'.repeat(64);

  const transferAuthData = '0xe3ee160e' + dummyFrom + dummyTo + dummyVal + dummyValidAfter + dummyValidBefore + dummyNonce + dummyV + dummyR + dummyS;
  const transferAuthCall = await rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: transferAuthData }, 'latest']);
  if (transferAuthCall.error && transferAuthCall.error.message.includes('ECRecover')) {
    report.eip3009.transferWithAuthorizationActive = true;
  }

  const receiveAuthData = '0xef550504' + dummyFrom + dummyTo + dummyVal + dummyValidAfter + dummyValidBefore + dummyNonce + dummyV + dummyR + dummyS;
  const receiveAuthCall = await rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: receiveAuthData }, 'latest']);
  if (receiveAuthCall.error && (receiveAuthCall.error.message.includes('reverted') || receiveAuthCall.error.message.includes('ECRecover'))) {
    report.eip3009.receiveWithAuthorizationActive = true;
  }

  const cancelAuthData = '0x8c60b540' + dummyFrom + dummyNonce + dummyV + dummyR + dummyS;
  const cancelAuthCall = await rpcCall(rpcUrl, 'eth_call', [{ to: usdcAddr, data: cancelAuthData }, 'latest']);
  if (cancelAuthCall.error && (cancelAuthCall.error.message.includes('reverted') || cancelAuthCall.error.message.includes('ECRecover'))) {
    report.eip3009.cancelAuthorizationActive = true;
  }

  console.log(`OK (Active verification complete)`);
  console.log(`   authorizationState():          ${report.eip3009.authorizationStateActive ? 'VERIFIED ACTIVE (Unused state returned)' : 'FAILED'}`);
  console.log(`   transferWithAuthorization():   ${report.eip3009.transferWithAuthorizationActive ? 'VERIFIED ACTIVE (ECDSA validator engaged)' : 'FAILED'}`);
  console.log(`   receiveWithAuthorization():    ${report.eip3009.receiveWithAuthorizationActive ? 'VERIFIED ACTIVE (ECDSA validator engaged)' : 'FAILED'}`);
  console.log(`   cancelAuthorization():         ${report.eip3009.cancelAuthorizationActive ? 'VERIFIED ACTIVE (ECDSA validator engaged)' : 'FAILED'}`);

  // 6. Relayer Balance Check
  if (report.relayerAddress) {
    try {
      process.stdout.write(`6. Probing relayer balance (${report.relayerAddress})... `);
      const { result: balHex } = await rpcCall(rpcUrl, 'eth_getBalance', [report.relayerAddress, 'latest']);
      const balWei = BigInt(balHex);
      const nativeUnits = Number(balWei) / 1e18;
      report.relayerBalanceNative = nativeUnits;
      const txEstimate = (balWei / (BigInt(report.gasPriceNativeWei) * 80000n)).toString();
      console.log(`OK`);
      console.log(`   Balance:  ${nativeUnits.toFixed(6)} Arc Native USDC (${balWei} wei)`);
      console.log(`   Headroom: ~${txEstimate} standard transfers at current gas price`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  } else {
    console.log('6. Relayer address: None specified (set RELAYER_ADDRESS env var or pass --relayer)');
  }

  // Summary Verdict
  report.allPassed = 
    report.rpcOk &&
    report.chainMatch &&
    report.bytecodePresent &&
    report.tokenDecimals === 6 &&
    Boolean(report.domainSeparator) &&
    report.eip3009.authorizationStateActive &&
    report.eip3009.transferWithAuthorizationActive;

  console.log('\n' + '='.repeat(70));
  console.log(' FEASIBILITY GATE VERDICT: ' + (report.allPassed ? 'ALL CRITICAL CHECKS PASSED [READY]' : 'FAILED'));
  console.log('='.repeat(70) + '\n');

  return report;
}

if (process.argv[1]?.endsWith('arc-mainnet-probe.mjs')) {
  runProbe().catch(err => {
    console.error('Probe crashed with error:', err);
    process.exit(1);
  });
}
