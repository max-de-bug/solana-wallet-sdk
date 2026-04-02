import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
} from '@solana-wallet-sdk/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import TrezorConnect, { type SolanaSignedTransaction } from '@trezor/connect';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface TrezorAdapterConfig {
  /** Application manifest email (required by Trezor Connect). */
  email: string;
  /** Application manifest URL (required by Trezor Connect). */
  appUrl: string;
}

const DEFAULT_CONFIG: TrezorAdapterConfig = {
  email: 'developer@example.com',
  appUrl: 'https://example.com',
};

// ─── Trezor Adapter ─────────────────────────────────────────────────────────

export class TrezorAdapter implements HardwareWalletAdapter {
  public readonly name = 'Trezor';
  public readonly transportMethods = [TransportMethod.USB] as const;

  private readonly config: TrezorAdapterConfig;
  private initialized = false;

  constructor(config: Partial<TrezorAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (method !== TransportMethod.USB) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Trezor. Only USB is supported.`
      );
    }

    try {
      await TrezorConnect.init({
        lazyLoad: true,
        manifest: {
          email: this.config.email,
          appUrl: this.config.appUrl,
        } as any,
      });
      this.initialized = true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletConnectionError(
        `Trezor initialization failed: ${message}. ` +
        'Ensure Trezor Bridge is running and the device is connected.',
        e
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (this.initialized) {
      TrezorConnect.dispose();
      this.initialized = false;
    }
  }

  public async deriveAccount(path: string): Promise<PublicKey> {
    this.assertInitialized();
    try {
      const result = await TrezorConnect.solanaGetAddress({ path });
      if (!result.success) {
        throw new Error(result.payload.error);
      }
      return new PublicKey(result.payload.address);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(
        `Trezor derivation failed: ${message}`,
        e
      );
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    path: string
  ): Promise<T> {
    this.assertInitialized();
    try {
      const messageBytes =
        transaction instanceof VersionedTransaction
          ? transaction.message.serialize()
          : transaction.serializeMessage();

      const result = await TrezorConnect.solanaSignTransaction({
        path,
        serializedTx: Buffer.from(messageBytes).toString('hex'),
      });

      if (!result.success) {
        throw new Error(result.payload.error);
      }

      const payload = result.payload as SolanaSignedTransaction;
      const pubkey = await this.deriveAccount(path);
      transaction.addSignature(
        pubkey,
        Buffer.from(payload.signature, 'hex')
      );

      return transaction;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Trezor transaction signing failed: ${message}`,
        e
      );
    }
  }

  public async signMessage(
    message: Uint8Array,
    path: string
  ): Promise<Uint8Array> {
    this.assertInitialized();
    try {
      const result = await (TrezorConnect as any).solanaSignMessage({
        path,
        message: Buffer.from(message).toString('hex'),
      });

      if (!result.success) {
        throw new Error(result.payload.error);
      }

      const payload = result.payload as { signature: string };
      return new Uint8Array(Buffer.from(payload.signature, 'hex'));
    } catch (e: unknown) {
      const message_ = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Trezor message signing failed: ${message_}`,
        e
      );
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new HardwareWalletConnectionError(
        'Trezor is not initialized. Call connect() first.'
      );
    }
  }
}
