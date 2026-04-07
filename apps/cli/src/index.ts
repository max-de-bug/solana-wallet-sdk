import { LedgerAdapter, TransportCreator } from '@solana-wallet-sdk/ledger-adapter';
import { TrezorAdapter } from '@solana-wallet-sdk/trezor-adapter';
import { KeystoneAdapter } from '@solana-wallet-sdk/keystone-adapter';
import { SafePalAdapter } from '@solana-wallet-sdk/safepal-adapter';
import {
  TransportMethod,
  QRInteractionProvider,
  DEFAULT_DERIVATION_PATH,
  HardwareWalletAdapter,
} from '@solana-wallet-sdk/core';

// ─── CLI QR Provider (mock for CLI environment) ─────────────────────────────

/** A deterministic dummy Solana public key for simulation purposes. */
const DUMMY_PUBKEY = '11111111111111111111111111111111';

/**
 * In a CLI environment, QR interaction is simulated.
 * In production, you'd use a terminal QR renderer + camera input.
 *
 * The mock returns correctly-shaped responses for each adapter's protocol
 * so the demo can run end-to-end without crashing on JSON parse errors.
 */
const cliQRProvider: QRInteractionProvider = {
  displayQR: async (data: string, type: string) => {
    console.log(`\n📱 [QR Display] Type: ${type}`);
    console.log(`   Data: ${data.substring(0, 80)}...`);
    console.log('   (In a real app, this would render a QR code)');
  },
  scanQR: async (expectedTypes: string[]) => {
    console.log(`\n📷 [QR Scan] Waiting for types: ${expectedTypes.join(', ')}`);
    console.log('   (In a real app, this would activate a camera scanner)');

    // Return protocol-appropriate mock responses
    if (expectedTypes.includes('crypto-multi-accounts')) {
      // Keystone sync: the SDK will try to parse this as a UR —
      // since we can't generate a valid UR without the real device,
      // this will still fail gracefully, but won't crash with an NPE.
      return '';
    }
    // SafePal / generic: return a valid-shaped JSON response
    return JSON.stringify({ status: 'ok', result: DUMMY_PUBKEY });
  },
};

// ─── Utility ────────────────────────────────────────────────────────────────

function printHeader(text: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'═'.repeat(60)}`);
}

function printStep(n: number, text: string): void {
  console.log(`\n  [${n}] ${text}`);
}

function printSuccess(text: string): void {
  console.log(`  ✅ ${text}`);
}

function printError(text: string): void {
  console.log(`  ❌ ${text}`);
}

function printInfo(text: string): void {
  console.log(`  ℹ️  ${text}`);
}

// ─── Adapter Demos ──────────────────────────────────────────────────────────

async function demoLedger(): Promise<void> {
  printHeader('Ledger Demo (USB)');
  printInfo('Requires: Ledger device connected via USB, Solana app open');

  // In CLI/Node.js, use @ledgerhq/hw-transport-node-hid
  // This is a placeholder — real usage requires the actual transport module
  const mockTransport: TransportCreator = {
    create: async () => {
      throw new Error(
        'To run this demo, install @ledgerhq/hw-transport-node-hid ' +
        'and connect a Ledger device with the Solana app open.'
      );
    },
  };

  const adapter = new LedgerAdapter(mockTransport);

  try {
    printStep(1, 'Connecting to Ledger via USB...');
    await adapter.connect(TransportMethod.USB);

    printStep(2, 'Deriving standard account...');
    const pubkey = await adapter.deriveAccount(DEFAULT_DERIVATION_PATH);
    printSuccess(`Public key: ${pubkey.toBase58()}`);

    printStep(3, 'Deriving second account (index 1)...');
    const pubkey2 = await adapter.deriveAccount("m/44'/501'/1'/0'");
    printSuccess(`Public key (index 1): ${pubkey2.toBase58()}`);

    printStep(4, 'Signing a message (SIWS)...');
    const message = new TextEncoder().encode('Sign-In With Solana: example.com');
    const signature = await adapter.signMessage(message, DEFAULT_DERIVATION_PATH);
    printSuccess(`Signature: ${Buffer.from(signature).toString('hex').substring(0, 32)}...`);

    printStep(5, 'Disconnecting...');
    await adapter.disconnect();
    printSuccess('Disconnected');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    printError(msg);
  }
}

async function demoTrezor(): Promise<void> {
  printHeader('Trezor Demo (USB)');
  printInfo('Requires: Trezor device connected via USB, Trezor Bridge running');

  const adapter = new TrezorAdapter({
    email: 'developer@example.com',
    appUrl: 'https://example.com',
  });

  try {
    printStep(1, 'Initializing Trezor Connect...');
    await adapter.connect(TransportMethod.USB);

    printStep(2, 'Deriving standard account...');
    const pubkey = await adapter.deriveAccount(DEFAULT_DERIVATION_PATH);
    printSuccess(`Public key: ${pubkey.toBase58()}`);

    printStep(3, 'Signing a message (SIWS)...');
    const message = new TextEncoder().encode('Sign-In With Solana: example.com');
    const signature = await adapter.signMessage(message, DEFAULT_DERIVATION_PATH);
    printSuccess(`Signature: ${Buffer.from(signature).toString('hex').substring(0, 32)}...`);

    printStep(4, 'Disconnecting...');
    await adapter.disconnect();
    printSuccess('Disconnected');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    printError(msg);
  }
}

async function demoKeystone(): Promise<void> {
  printHeader('Keystone Demo (QR Air-Gapped)');
  printInfo('Requires: Keystone device with Solana app, camera for QR scanning');

  const adapter = new KeystoneAdapter(cliQRProvider);

  try {
    printStep(1, 'Syncing accounts via QR...');
    await adapter.connect(TransportMethod.QR);

    printStep(2, 'Deriving account...');
    const pubkey = await adapter.deriveAccount(DEFAULT_DERIVATION_PATH);
    printSuccess(`Public key: ${pubkey.toBase58()}`);

    printStep(3, 'Signing a message (SIWS)...');
    const message = new TextEncoder().encode('Sign-In With Solana: example.com');
    const signature = await adapter.signMessage(message, DEFAULT_DERIVATION_PATH);
    printSuccess(`Signature: ${Buffer.from(signature).toString('hex').substring(0, 32)}...`);

    printStep(4, 'Disconnecting...');
    await adapter.disconnect();
    printSuccess('Disconnected');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    printError(msg);
  }
}

async function demoSafePal(): Promise<void> {
  printHeader('SafePal Demo (QR)');
  printInfo('Requires: SafePal hardware wallet');

  const adapter = new SafePalAdapter({ qrProvider: cliQRProvider });

  try {
    printStep(1, 'Connecting via QR...');
    await adapter.connect(TransportMethod.QR);

    printStep(2, 'Deriving standard account...');
    const pubkey = await adapter.deriveAccount(DEFAULT_DERIVATION_PATH);
    printSuccess(`Public key: ${pubkey.toBase58()}`);

    printStep(3, 'Signing a message (SIWS)...');
    const message = new TextEncoder().encode('Sign-In With Solana: example.com');
    const signature = await adapter.signMessage(message, DEFAULT_DERIVATION_PATH);
    printSuccess(`Signature: ${Buffer.from(signature).toString('hex').substring(0, 32)}...`);

    printStep(4, 'Disconnecting...');
    await adapter.disconnect();
    printSuccess('Disconnected');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    printError(msg);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🔐 Solana Unified Hardware Wallet SDK — CLI Demo\n');
  console.log('This script demonstrates the SDK with all 4 supported wallets.');
  console.log('Each adapter will attempt to connect to a real hardware device.');
  console.log('Ensure the required devices/software are available.\n');

  const wallet = process.argv[2]?.toLowerCase();

  if (wallet === 'ledger') {
    await demoLedger();
  } else if (wallet === 'trezor') {
    await demoTrezor();
  } else if (wallet === 'keystone') {
    await demoKeystone();
  } else if (wallet === 'safepal') {
    await demoSafePal();
  } else {
    // Run all demos
    console.log('Usage: npm start -- <wallet>');
    console.log('  Wallets: ledger, trezor, keystone, safepal');
    console.log('  Omit wallet name to run all demos.\n');

    await demoLedger();
    await demoTrezor();
    await demoKeystone();
    await demoSafePal();
  }

  printHeader('Demo Complete');
}

main().catch(console.error);
