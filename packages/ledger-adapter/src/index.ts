import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
} from '@solana-wallet-sdk/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import Solana from '@ledgerhq/hw-app-solana';
import type Transport from '@ledgerhq/hw-transport';

// ─── Transport Creator ─────────────────────────────────────────────────────

/**
 * Factory interface for creating Ledger transport instances.
 * Consumers inject the platform-specific transport module:
 *   - `@ledgerhq/hw-transport-node-hid` for Node.js / CLI
 *   - `@ledgerhq/hw-transport-react-native-ble` for React Native BLE
 *   - `@ledgerhq/hw-transport-webusb` for Web
 */
export interface TransportCreator {
  create(): Promise<Transport>;
}

// ─── Ledger Adapter ─────────────────────────────────────────────────────────

export class LedgerAdapter implements HardwareWalletAdapter {
  public readonly name = 'Ledger';
  public readonly transportMethods = [
    TransportMethod.USB,
    TransportMethod.BLUETOOTH,
  ] as const;

  private transport: Transport | null = null;
  private app: Solana | null = null;

  /**
   * @param transportCreator - Platform-specific Ledger transport factory.
   *   Must expose a static-like `create()` that returns a Transport instance.
   */
  constructor(private readonly transportCreator: TransportCreator) {}

  public async connect(method: TransportMethod): Promise<void> {
    if (!this.transportMethods.includes(method as any)) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Ledger. ` +
        `Supported: ${this.transportMethods.join(', ')}`
      );
    }

    try {
      this.transport = await this.transportCreator.create();
      if (!this.transport) {
        throw new Error('Transport creation returned null');
      }
      this.app = new Solana(this.transport);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletConnectionError(
        `Ledger connection failed: ${message}. ` +
        'Ensure the Solana app is open on your Ledger device.',
        e
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.app = null;
    }
  }

  public async deriveAccount(path: string): Promise<PublicKey> {
    this.assertConnected();
    try {
      const cleanPath = stripDerivationPrefix(path);
      const response = await this.app!.getAddress(cleanPath);
      return new PublicKey(response.address);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(`Ledger derivation failed: ${message}`, e);
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    path: string
  ): Promise<T> {
    this.assertConnected();
    try {
      const cleanPath = stripDerivationPrefix(path);

      const messageBytes =
        transaction instanceof VersionedTransaction
          ? transaction.message.serialize()
          : transaction.serializeMessage();

      const { signature } = await this.app!.signTransaction(
        cleanPath,
        Buffer.from(messageBytes)
      );

      const pubkey = await this.deriveAccount(path);
      transaction.addSignature(pubkey, Buffer.from(signature));
      return transaction;
    } catch (e: unknown) {
      if (isLedgerUserRejection(e)) {
        throw new HardwareWalletSignError(
          'User rejected the transaction on Ledger device.',
          e
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Ledger transaction signing failed: ${message}`,
        e
      );
    }
  }

  public async signMessage(
    message: Uint8Array,
    path: string
  ): Promise<Uint8Array> {
    this.assertConnected();
    try {
      const cleanPath = stripDerivationPrefix(path);
      const { signature } = await this.app!.signOffchainMessage(
        cleanPath,
        Buffer.from(message)
      );
      return new Uint8Array(signature);
    } catch (e: unknown) {
      if (isLedgerUserRejection(e)) {
        throw new HardwareWalletSignError(
          'User rejected the message signing on Ledger device.',
          e
        );
      }
      const message_ = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Ledger message signing failed: ${message_}`,
        e
      );
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.app || !this.transport) {
      throw new HardwareWalletConnectionError(
        'Not connected to Ledger. Call connect() first.'
      );
    }
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Strip the "m/" prefix from a derivation path for Ledger API consumption. */
function stripDerivationPrefix(path: string): string {
  return path.startsWith('m/') ? path.slice(2) : path;
}

/** Check if a Ledger error is a user rejection (status code 0x6985). */
function isLedgerUserRejection(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    (e as { statusCode: number }).statusCode === 0x6985
  );
}
