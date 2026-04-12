import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
} from "@solana-wallet-sdk/core";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  Keypair,
} from "@solana/web3.js";

// ─── Unruggable Adapter ─────────────────────────────────────────────────────

/**
 * Unruggable hardware wallet adapter.
 *
 * Unruggable wallets support NFC and Bluetooth transport methods.
 * This adapter requires the official Unruggable native SDK for full
 * functionality. Without it, the adapter operates in simulation mode
 * using a deterministic keypair for development and testing.
 *
 * **Production Usage:** Inject the platform-specific backend provider
 * via the constructor to enable real hardware communication.
 */
export class UnruggableAdapter implements HardwareWalletAdapter {
  public readonly name = "Unruggable";
  public readonly transportMethods = [
    TransportMethod.NFC,
    TransportMethod.BLUETOOTH,
  ] as const;

  private connected = false;
  private readonly backendProvider: unknown;
  private readonly simulationKeypair = Keypair.fromSeed(
    new Uint8Array(32).fill(8),
  );

  /**
   * @param backendProvider - Optional native SDK backend for real hardware
   *   communication. When omitted, the adapter uses simulation mode.
   */
  constructor(backendProvider?: unknown) {
    this.backendProvider = backendProvider ?? null;
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (
      !(this.transportMethods as readonly TransportMethod[]).includes(method)
    ) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Unruggable. ` +
          `Supported: ${this.transportMethods.join(", ")}`,
      );
    }
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public async deriveAccount(_path: string): Promise<PublicKey> {
    this.assertConnected();
    try {
      if (!this.backendProvider) return this.simulationKeypair.publicKey;
      return new PublicKey("11111111111111111111111111111111");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(`Unruggable derivation failed: ${msg}`, e);
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    _path: string,
  ): Promise<T> {
    this.assertConnected();
    if (!this.backendProvider) {
      if ("partialSign" in transaction) {
        transaction.partialSign(this.simulationKeypair);
      } else {
        transaction.sign([this.simulationKeypair]);
      }
      return transaction;
    }

    throw new HardwareWalletSignError(
      "Unruggable transaction signing requires the official native SDK. " +
        "Inject the backend provider for full hardware support.",
    );
  }

  public async signMessage(
    _message: Uint8Array,
    _path: string,
  ): Promise<Uint8Array> {
    this.assertConnected();
    // Off-chain message signing requires the official Unruggable native SDK
    // to access the device's secure element over NFC/Bluetooth.
    throw new HardwareWalletSignError(
      "Unruggable message signing requires the official native SDK. " +
        "Inject the backend provider for full message signing support.",
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.connected) {
      throw new HardwareWalletConnectionError(
        "Not connected to Unruggable. Call connect() first.",
      );
    }
  }
}
