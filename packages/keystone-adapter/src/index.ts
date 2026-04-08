import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
  QRInteractionProvider,
} from "@solana-wallet-sdk/core";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { KeystoneSDK, UR } from "@keystonehq/keystone-sdk";
import { UREncoder, URDecoder } from "@ngraveio/bc-ur";

// ─── Keystone Adapter ───────────────────────────────────────────────────────

/**
 * Air-gapped hardware wallet adapter using QR codes and the Uniform Resource
 * (UR) protocol for bidirectional communication.
 *
 * **Flow:**
 * 1. SDK generates a UR-encoded request → displays as animated QR code
 * 2. User scans the QR with their Keystone device
 * 3. Keystone processes and displays a response QR on its screen
 * 4. User scans the response QR with their phone camera
 * 5. SDK decodes the UR response and extracts the result
 */
export class KeystoneAdapter implements HardwareWalletAdapter {
  public readonly name = "Keystone";
  public readonly transportMethods = [TransportMethod.QR] as const;

  private readonly sdk: KeystoneSDK;
  private cachedAccounts = new Map<string, PublicKey>();

  /**
   * @param qrProvider - UI-layer callback for displaying/scanning QR codes.
   */
  constructor(private readonly qrProvider: QRInteractionProvider) {
    this.sdk = new KeystoneSDK({
      origin: "solana-wallet-sdk",
    });
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (method !== TransportMethod.QR) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not supported by Keystone. Only QR is supported.`,
      );
    }
    // Air-gapped: no persistent connection. We verify communication by
    // scanning the device's sync QR to import accounts.
    try {
      const urString = await this.qrProvider.scanQR(["crypto-multi-accounts"]);
      const accounts = this.sdk.parseMultiAccounts(
        new UR(Buffer.from(urString, "hex"), "crypto-multi-accounts"),
      );

      // Cache all discovered Solana accounts
      for (const account of accounts.keys) {
        const key = account.chain === "SOL" ? account.path : undefined;
        if (key) {
          this.cachedAccounts.set(key, new PublicKey(account.publicKey));
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletConnectionError(
        `Keystone sync failed: ${message}. ` +
          "Ensure your Keystone device is displaying the Solana sync QR code.",
        e,
      );
    }
  }

  public async disconnect(): Promise<void> {
    this.cachedAccounts.clear();
  }

  public async deriveAccount(path: string): Promise<PublicKey> {
    // Check cache first (populated during connect/sync)
    const cached = this.cachedAccounts.get(path);
    if (cached) return cached;

    // If not in cache, request via QR flow
    try {
      const request = this.sdk.sol.generateSignRequest({
        requestId: crypto.randomUUID(),
        signData: Buffer.alloc(0),
        dataType: 1, // Message type (used for account query)
        path,
        xfp: "",
        address: "",
        origin: "solana-wallet-sdk",
      } as any);

      const urString = encodeUR(request);
      await this.qrProvider.displayQR(urString, "sol-account-request");

      const responseUR = await this.qrProvider.scanQR([
        "crypto-multi-accounts",
      ]);
      const accounts = this.sdk.parseMultiAccounts(
        new UR(Buffer.from(responseUR, "hex"), "crypto-multi-accounts"),
      );

      const account = accounts.keys.find((k) => k.path === path);
      if (!account) {
        throw new Error(`No account found at path ${path}`);
      }

      const pubkey = new PublicKey(account.publicKey);
      this.cachedAccounts.set(path, pubkey);
      return pubkey;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(
        `Keystone account derivation failed: ${message}`,
        e,
      );
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    path: string,
  ): Promise<T> {
    try {
      const messageBytes =
        transaction instanceof VersionedTransaction
          ? Buffer.from(transaction.message.serialize())
          : Buffer.from(transaction.serializeMessage());

      const request = this.sdk.sol.generateSignRequest({
        requestId: crypto.randomUUID(),
        signData: messageBytes,
        dataType: transaction instanceof VersionedTransaction ? 2 : 1,
        path,
        xfp: "",
        address: "",
        origin: "solana-wallet-sdk",
      } as any);

      const urString = encodeUR(request);
      await this.qrProvider.displayQR(urString, "sol-sign-request");

      const responseUR = await this.qrProvider.scanQR(["sol-signature"]);
      const signature = this.sdk.sol.parseSignature(
        new UR(Buffer.from(responseUR, "hex"), "sol-signature"),
      );

      const pubkey = await this.deriveAccount(path);
      const sigData: string | Buffer = signature.signature as any;
      const sigBuffer =
        typeof sigData === "string"
          ? Buffer.from(sigData, "hex")
          : Buffer.from(sigData);
      transaction.addSignature(pubkey, sigBuffer);
      return transaction;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Keystone transaction signing failed: ${message}`,
        e,
      );
    }
  }

  public async signMessage(
    message: Uint8Array,
    path: string,
  ): Promise<Uint8Array> {
    try {
      const request = this.sdk.sol.generateSignRequest({
        requestId: crypto.randomUUID(),
        signData: Buffer.from(message),
        dataType: 1, // Off-chain message
        path,
        xfp: "",
        address: "",
        origin: "solana-wallet-sdk",
      } as any);

      const urString = encodeUR(request);
      await this.qrProvider.displayQR(urString, "sol-sign-message");

      const responseUR = await this.qrProvider.scanQR(["sol-signature"]);
      const signature = this.sdk.sol.parseSignature(
        new UR(Buffer.from(responseUR, "hex"), "sol-signature"),
      );
      const sigData: string | Buffer = signature.signature as any;
      const sigBuffer =
        typeof sigData === "string"
          ? Buffer.from(sigData, "hex")
          : Buffer.from(sigData);
      return new Uint8Array(sigBuffer);
    } catch (e: unknown) {
      const message_ = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `Keystone message signing failed: ${message_}`,
        e,
      );
    }
  }
}

// ─── UR Encoding Helper ─────────────────────────────────────────────────────

function encodeUR(ur: UR): string {
  const encoder = new UREncoder(ur, 200);
  // For single-part URs, return the single part
  return encoder.nextPart();
}
