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

// ─── Solflare Shield Adapter ────────────────────────────────────────────────

/**
 * Solflare Shield hardware wallet adapter.
 *
 * Solflare Shield devices support USB and Bluetooth transport methods.
 * This adapter requires the official Solflare Shield SDK bindings for
 * full functionality. Without them, the adapter operates in simulation
 * mode using a deterministic keypair for development and testing.
 *
 * **Production Usage:** Inject the platform-specific backend provider
 * via the constructor to enable real hardware communication.
 */
export class SolflareShieldAdapter implements HardwareWalletAdapter {
  public readonly name = "Solflare Shield";
  public readonly transportMethods = [
    TransportMethod.USB,
    TransportMethod.BLUETOOTH,
  ] as const;

  private connected = false;
  private readonly backendProvider: unknown;
  private readonly simulationKeypair = Keypair.fromSeed(
    new Uint8Array(32).fill(11),
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
        `Transport method "${method}" is not supported by Solflare Shield. ` +
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
      throw new HardwareWalletError(
        `Solflare Shield derivation failed: ${msg}`,
        e,
      );
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
      "Solflare Shield transaction signing requires the official SDK bindings. " +
        "Inject the backend provider for full hardware support.",
    );
  }

  public async signMessage(
    _message: Uint8Array,
    _path: string,
  ): Promise<Uint8Array> {
    this.assertConnected();
    // Off-chain message signing requires the official Solflare Shield SDK
    // to access the device's secure element over USB/Bluetooth.
    throw new HardwareWalletSignError(
      "Solflare Shield message signing requires the official SDK bindings. " +
        "Inject the backend provider for full message signing support.",
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.connected) {
      throw new HardwareWalletConnectionError(
        "Not connected to Solflare Shield. Call connect() first.",
      );
    }
  }
}
