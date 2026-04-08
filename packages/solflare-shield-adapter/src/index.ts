import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
} from '@solana-wallet-sdk/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export class SolflareShieldAdapter implements HardwareWalletAdapter {
  public readonly name = 'Solflare Shield';
  public readonly transportMethods = [TransportMethod.USB, TransportMethod.BLUETOOTH] as const;
  private connected = false;
  private backendProvider: unknown = null;

  constructor(backendProvider?: unknown) {
    this.backendProvider = backendProvider;
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (!this.transportMethods.includes(method as 'usb' | 'bluetooth')) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Solflare Shield. Supported: USB, BLUETOOTH`
      );
    }
    
    // Simulate Shield connection layer injection
    if (!this.backendProvider && method === TransportMethod.BLUETOOTH) {
        this.connected = true;
        return;
    }

    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public async deriveAccount(_path: string): Promise<PublicKey> {
    this.assertConnected();
    try {
      // Mocking Solflare Shield key extraction
      return new PublicKey('11111111111111111111111111111111');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(`Solflare Shield derivation failed: ${msg}`, e);
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    _transaction: T,
    _path: string
  ): Promise<T> {
    this.assertConnected();
    throw new HardwareWalletSignError(
      'Solflare Shield transaction signing not fully implemented without official library bindings.'
    );
  }

  public async signMessage(
    _message: Uint8Array,
    _path: string
  ): Promise<Uint8Array> {
    this.assertConnected();
    throw new HardwareWalletSignError(
      'Solflare Shield message signing not fully implemented without official library bindings.'
    );
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new HardwareWalletConnectionError(
        'Not connected to Solflare Shield. Call connect() first.'
      );
    }
  }
}
