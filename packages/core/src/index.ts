import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard Solana BIP-44 derivation path. */
export const DEFAULT_DERIVATION_PATH = "m/44'/501'/0'/0'";

// ─── Transport Methods ──────────────────────────────────────────────────────

/**
 * Transport methods supported by various hardware wallets.
 */
export enum TransportMethod {
  USB = 'USB',
  BLUETOOTH = 'BLUETOOTH',
  NFC = 'NFC',
  QR = 'QR',
}

// ─── QR Interaction Provider ────────────────────────────────────────────────

/**
 * Callback contract for QR-based (air-gapped) hardware wallets.
 *
 * Adapters like Keystone and SafePal don't have a direct transport channel —
 * they communicate through animated QR codes. This interface decouples the
 * adapter logic from any specific UI framework (React Native, web, CLI).
 *
 * @example
 * ```ts
 * const qrProvider: QRInteractionProvider = {
 *   displayQR: async (data, type) => {
 *     // render an animated QR code on screen
 *   },
 *   scanQR: async (expectedTypes) => {
 *     // open camera, scan QR, return decoded string
 *   },
 * };
 * const keystone = new KeystoneAdapter(qrProvider);
 * ```
 */
export interface QRInteractionProvider {
  /**
   * Display a UR-encoded (or proprietary-encoded) QR code to the user.
   * The implementation should render the QR and wait until the user is ready
   * to scan the response (e.g., via a "Done" button).
   *
   * @param data - The encoded payload string to render as a QR code.
   * @param type - A human-readable type hint (e.g., "sol-sign-request").
   */
  displayQR(data: string, type: string): Promise<void>;

  /**
   * Scan a QR code from the hardware wallet's screen.
   * The implementation should activate the camera, detect QR frames,
   * and return the decoded payload string.
   *
   * @param expectedTypes - Hint of acceptable UR types for validation.
   * @returns The decoded QR payload string.
   */
  scanQR(expectedTypes: string[]): Promise<string>;
}

// ─── Hardware Wallet Adapter ────────────────────────────────────────────────

/**
 * Unified interface for all hardware wallet adapters.
 *
 * Every adapter (Ledger, Trezor, Keystone, SafePal) implements this contract,
 * allowing consumer code to treat them interchangeably through the adapter
 * pattern.
 */
export interface HardwareWalletAdapter {
  /** The human-readable name of the hardware wallet (e.g., "Ledger"). */
  readonly name: string;

  /** Transport methods officially supported by this adapter. */
  readonly transportMethods: ReadonlyArray<TransportMethod>;

  /**
   * Initialize a connection with the hardware wallet.
   * For USB/BLE wallets this opens the transport channel.
   * For QR wallets this may be a no-op or an initial sync scan.
   *
   * @param method - The requested transport method.
   * @throws {HardwareWalletConnectionError} If the connection fails.
   */
  connect(method: TransportMethod): Promise<void>;

  /**
   * Close the connection to the hardware wallet.
   * Releases transport resources. Safe to call multiple times.
   */
  disconnect(): Promise<void>;

  /**
   * Derive a Solana PublicKey from a BIP-44 derivation path.
   *
   * @param path - Standard BIP-44 derivation path, e.g. "m/44'/501'/0'/0'".
   * @returns The derived Solana PublicKey.
   * @throws {HardwareWalletError} If derivation fails.
   */
  deriveAccount(path: string): Promise<PublicKey>;

  /**
   * Sign a Solana transaction natively on the hardware device.
   * The user will be prompted to confirm on the device screen.
   *
   * @param transaction - A legacy Transaction or VersionedTransaction.
   * @param path - The derivation path corresponding to the signing key.
   * @returns The same transaction object with the signature attached.
   * @throws {HardwareWalletSignError} If signing fails or user rejects.
   */
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    path: string
  ): Promise<T>;

  /**
   * Sign an arbitrary message (byte array) natively on the hardware device.
   * Used for Sign-In With Solana (SIWS) and other off-chain authentication.
   *
   * @param message - The raw bytes of the message to sign.
   * @param path - The derivation path corresponding to the signing key.
   * @returns The ed25519 signature as a Uint8Array.
   * @throws {HardwareWalletSignError} If signing fails or user rejects.
   */
  signMessage(message: Uint8Array, path: string): Promise<Uint8Array>;
}

// ─── Error Classes ──────────────────────────────────────────────────────────

/**
 * Base error class for all SDK errors.
 * Extends native Error with proper prototype chain for `instanceof` checks.
 */
export class HardwareWalletError extends Error {
  public override name: string = 'HardwareWalletError';

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'HardwareWalletError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a connection or transport-level operation fails.
 */
export class HardwareWalletConnectionError extends HardwareWalletError {
  public override readonly name = 'HardwareWalletConnectionError';
}

/**
 * Thrown when a signing operation fails or is rejected by the user.
 */
export class HardwareWalletSignError extends HardwareWalletError {
  public override readonly name = 'HardwareWalletSignError';
}

/**
 * Thrown when a hardware wallet operation exceeds the expected time limit.
 */
export class HardwareWalletTimeoutError extends HardwareWalletError {
  public override readonly name = 'HardwareWalletTimeoutError';
}
