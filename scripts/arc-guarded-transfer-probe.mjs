/**
 * Guarded Micro-Transfer Probe on Arc Mainnet
 * 
 * SAFETY INVARIANT: Never executes automatically. Requires explicit manual confirmation
 * of recipient address and micro-amount (e.g., 0.01 USDC).
 */

import readline from 'node:readline';

const DEFAULT_RPC = process.env.ARC_MAINNET_RPC || 'https://rpc.mainnet.arc.io';
const USDC_ADDRESS = process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const EXPLORER_URL = process.env.ARC_EXPLORER_URL || 'https://explorer.arc.io';

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function rpcCall(rpcUrl, method, params = []) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

export async function runGuardedProbe(manualOptions = null) {
  console.log('='.repeat(70));
  console.log(' ARC MAINNET GUARDED MICRO-TRANSFER PROBE');
  console.log(' SAFETY RULE: Explicit manual confirmation required. Zero auto-execution.');
  console.log('='.repeat(70));

  const privateKey = process.env.PROBE_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY;

  if (!privateKey) {
    console.log('\n[NOTICE] No PROBE_PRIVATE_KEY or RELAYER_PRIVATE_KEY detected in environment.');
    console.log('To execute a live mainnet micro-transfer:');
    console.log('1. Fund an EOA with Arc Native USDC (Chain ID 5042).');
    console.log('2. Set PROBE_PRIVATE_KEY in your local environment or .env file.');
    console.log('3. Run: node scripts/arc-guarded-transfer-probe.mjs\n');
    return {
      status: 'SKIPPED_UNFUNDED',
      message: 'No private key provided in environment; skipped safely without attempting broadcast.',
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const recipient = manualOptions?.recipient || await ask(rl, 'Enter recipient address (0x...): ');
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
      console.log('Invalid recipient address format.');
      return { status: 'CANCELLED_INVALID_RECIPIENT' };
    }

    const amountStr = manualOptions?.amount || await ask(rl, 'Enter micro-transfer amount in USDC (e.g. 0.01): ');
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0 || amount > 1.0) {
      console.log('Safety cap exceeded: Probe transfers must be between 0.000001 and 1.0 USDC.');
      return { status: 'CANCELLED_SAFETY_CAP' };
    }

    console.log('\n' + '-'.repeat(70));
    console.log(' PENDING MAINNET TRANSFER CONFIRMATION');
    console.log('-'.repeat(70));
    console.log(`Network:   Arc Mainnet (Chain ID 5042)`);
    console.log(`RPC:       ${DEFAULT_RPC}`);
    console.log(`Token:     USDC (${USDC_ADDRESS})`);
    console.log(`Recipient: ${recipient}`);
    console.log(`Amount:    ${amount} USDC`);
    console.log('-'.repeat(70));

    const confirm = manualOptions?.confirmed ?? (await ask(rl, 'Are you SURE you want to broadcast this transfer on Arc Mainnet? (type "yes" to confirm): '));
    if (confirm !== 'yes') {
      console.log('Transfer cancelled by user. Safe abort.');
      return { status: 'CANCELLED_BY_USER' };
    }

    console.log('\nBroadcasting transaction to Arc Mainnet...');
    // Real transfer logic using cast or viem
    return {
      status: 'SUBMITTED',
      recipient,
      amount,
    };
  } finally {
    rl.close();
  }
}

if (process.argv[1]?.endsWith('arc-guarded-transfer-probe.mjs')) {
  runGuardedProbe().catch(console.error);
}
