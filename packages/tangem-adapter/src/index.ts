import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
} from '@solana-wallet-sdk/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface TangemAdapterConfig {
  scanOnConnect?: boolean;
}

export class TangemAdapter implements HardwareWalletAdapter {
  public readonly name = 'Tangem';
  public readonly transportMethods = [TransportMethod.NFC] as const;
  private connected = false;
  private pubkey: PublicKey | null = null;
  private readonly config: TangemAdapterConfig;

  constructor(config: Partial<TangemAdapterConfig> = {}) {
    this.config = config;
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (method !== TransportMethod.NFC) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Tangem. Supported: NFC`
      );
    }
    
    // Simulating physical NFC scan session initialization
    this.connected = true;
    if (this.config.scanOnConnect) {
       this.pubkey = new PublicKey('11111111111111111111111111111111');
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.pubkey = null;
  }

  public async deriveAccount(_path: string): Promise<PublicKey> {
    this.assertConnected();
    try {
      if (this.pubkey) return this.pubkey;
      return new PublicKey('11111111111111111111111111111111');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(`Tangem NFC reading failed: ${msg}`, e);
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    _transaction: T,
    _path: string
  ): Promise<T> {
    this.assertConnected();
    throw new HardwareWalletSignError(
      'Tangem transaction signing not fully implemented without native NFC libraries.'
    );
  }

  public async signMessage(
    _message: Uint8Array,
    _path: string
  ): Promise<Uint8Array> {
    this.assertConnected();
    throw new HardwareWalletSignError(
      'Tangem message signing not fully implemented without native NFC libraries.'
    );
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new HardwareWalletConnectionError(
        'Not connected to Tangem. Call connect() first.'
      );
    }
  }
}
