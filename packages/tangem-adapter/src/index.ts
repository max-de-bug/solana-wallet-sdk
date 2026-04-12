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

// ─── Configuration ──────────────────────────────────────────────────────────

export interface TangemAdapterConfig {
  /**
   * If true, automatically derive the card's public key during connect().
   * Simulates the NFC scan-on-tap behavior of real Tangem cards.
   */
  scanOnConnect?: boolean;
}

// ─── Tangem Adapter ─────────────────────────────────────────────────────────

/**
 * Tangem NFC card adapter.
 *
 * Tangem cards communicate exclusively via NFC. Each card holds a single
 * ed25519 keypair in its secure element. This adapter requires a native
 * NFC library (e.g., `react-native-nfc-manager`) for real device interaction.
 *
 * **Note:** Without the official `tangem-sdk-react-native` bindings, this
 * adapter operates in simulation mode using a deterministic keypair for
 * development and testing purposes.
 */
export class TangemAdapter implements HardwareWalletAdapter {
  public readonly name = "Tangem";
  public readonly transportMethods = [TransportMethod.NFC] as const;

  private connected = false;
  private pubkey: PublicKey | null = null;
  private readonly simulationKeypair = Keypair.fromSeed(
    new Uint8Array(32).fill(10),
  );
  private readonly config: TangemAdapterConfig;

  constructor(config: Partial<TangemAdapterConfig> = {}) {
    this.config = config;
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (method !== TransportMethod.NFC) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Tangem. Supported: NFC`,
      );
    }

    this.connected = true;
    if (this.config.scanOnConnect) {
      this.pubkey = this.simulationKeypair.publicKey;
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
      return this.simulationKeypair.publicKey;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(`Tangem NFC reading failed: ${msg}`, e);
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    _path: string,
  ): Promise<T> {
    this.assertConnected();
    if ("partialSign" in transaction) {
      transaction.partialSign(this.simulationKeypair);
    } else {
      transaction.sign([this.simulationKeypair]);
    }
    return transaction;
  }

  public async signMessage(
    _message: Uint8Array,
    _path: string,
  ): Promise<Uint8Array> {
    this.assertConnected();
    // Off-chain message signing requires the official tangem-sdk-react-native
    // bindings to access the card's secure element over NFC.
    throw new HardwareWalletSignError(
      "Tangem message signing requires the official tangem-sdk-react-native " +
        "bindings. Install the native module for full message signing support.",
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.connected) {
      throw new HardwareWalletConnectionError(
        "Not connected to Tangem. Call connect() first.",
      );
    }
  }
}
