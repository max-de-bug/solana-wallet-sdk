import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletError,
  QRInteractionProvider,
} from "@solana-wallet-sdk/core";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// ─── SafePal QR Protocol ────────────────────────────────────────────────────

/**
 * SafePal uses a proprietary QR-based protocol for air-gapped signing.
 * The protocol encodes requests as JSON payloads within QR codes:
 *
 *   Request:  { chain: "solana", action: "<action>", data: "<hex>" }
 *   Response: { status: "ok", result: "<hex>" }
 *
 * For Bluetooth connections, SafePal exposes a BLE service that tunnels
 * the same JSON protocol over BLE characteristics.
 */

interface SafePalQRRequest {
  chain: "solana";
  action: "get_address" | "sign_transaction" | "sign_message";
  data: string;
  path: string;
}

interface SafePalQRResponse {
  status: "ok" | "error";
  result: string;
  error?: string;
}

// ─── BLE Transport Interface ────────────────────────────────────────────────

/**
 * Optional BLE transport for SafePal Bluetooth connections.
 * Inject platform-specific BLE implementation at construction.
 */
export interface SafePalBleTransport {
  /** Connect to SafePal over Bluetooth. */
  connect(): Promise<void>;
  /** Disconnect Bluetooth. */
  disconnect(): Promise<void>;
  /** Send a request and receive a response over BLE. */
  exchange(request: string): Promise<string>;
}

// ─── SafePal Adapter Config ─────────────────────────────────────────────────

export interface SafePalAdapterConfig {
  /** QR interaction provider for air-gapped QR flow. */
  qrProvider?: QRInteractionProvider;
  /** BLE transport for Bluetooth connections. */
  bleTransport?: SafePalBleTransport;
}

// ─── SafePal Adapter ────────────────────────────────────────────────────────

export class SafePalAdapter implements HardwareWalletAdapter {
  public readonly name = "SafePal";
  public readonly transportMethods: readonly TransportMethod[];

  private readonly qrProvider?: QRInteractionProvider;
  private readonly bleTransport?: SafePalBleTransport;
  private activeMethod: TransportMethod | null = null;

  constructor(config: SafePalAdapterConfig) {
    this.qrProvider = config.qrProvider;
    this.bleTransport = config.bleTransport;

    // Advertise only the transport methods that have been provided
    const methods: TransportMethod[] = [];
    if (this.qrProvider) methods.push(TransportMethod.QR);
    if (this.bleTransport) methods.push(TransportMethod.BLUETOOTH);
    this.transportMethods = methods;

    if (methods.length === 0) {
      throw new Error(
        "SafePalAdapter requires at least one transport: qrProvider or bleTransport.",
      );
    }
  }

  public async connect(method: TransportMethod): Promise<void> {
    if (!this.transportMethods.includes(method)) {
      throw new HardwareWalletConnectionError(
        `Transport method "${method}" is not available. ` +
          `Configured: ${this.transportMethods.join(", ")}. ` +
          "Provide the corresponding transport in SafePalAdapterConfig.",
      );
    }

    if (method === TransportMethod.BLUETOOTH) {
      try {
        await this.bleTransport!.connect();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        throw new HardwareWalletConnectionError(
          `SafePal Bluetooth connection failed: ${message}`,
          e,
        );
      }
    }

    this.activeMethod = method;
  }

  public async disconnect(): Promise<void> {
    if (this.activeMethod === TransportMethod.BLUETOOTH && this.bleTransport) {
      await this.bleTransport.disconnect();
    }
    this.activeMethod = null;
  }

  public async deriveAccount(path: string): Promise<PublicKey> {
    this.assertConnected();
    try {
      const request: SafePalQRRequest = {
        chain: "solana",
        action: "get_address",
        data: "",
        path,
      };

      const response = await this.exchange(request);
      if (response.status === "error") {
        throw new Error(response.error || "Unknown SafePal error");
      }

      return new PublicKey(response.result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletError(
        `SafePal account derivation failed: ${message}`,
        e,
      );
    }
  }

  public async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    path: string,
  ): Promise<T> {
    this.assertConnected();
    try {
      const messageBytes =
        transaction instanceof VersionedTransaction
          ? transaction.message.serialize()
          : transaction.serializeMessage();

      const request: SafePalQRRequest = {
        chain: "solana",
        action: "sign_transaction",
        data: Buffer.from(messageBytes).toString("hex"),
        path,
      };

      const response = await this.exchange(request);
      if (response.status === "error") {
        throw new Error(response.error || "Signing rejected or failed");
      }

      const sigBytes = Buffer.from(response.result, "hex");
      const pubkey = await this.deriveAccount(path);
      transaction.addSignature(pubkey, sigBytes);
      return transaction;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `SafePal transaction signing failed: ${message}`,
        e,
      );
    }
  }

  public async signMessage(
    message: Uint8Array,
    path: string,
  ): Promise<Uint8Array> {
    this.assertConnected();
    try {
      const request: SafePalQRRequest = {
        chain: "solana",
        action: "sign_message",
        data: Buffer.from(message).toString("hex"),
        path,
      };

      const response = await this.exchange(request);
      if (response.status === "error") {
        throw new Error(response.error || "Message signing rejected");
      }

      return new Uint8Array(Buffer.from(response.result, "hex"));
    } catch (e: unknown) {
      const message_ = e instanceof Error ? e.message : String(e);
      throw new HardwareWalletSignError(
        `SafePal message signing failed: ${message_}`,
        e,
      );
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.activeMethod) {
      throw new HardwareWalletConnectionError(
        "SafePal is not connected. Call connect() first.",
      );
    }
  }

  /**
   * Route the request through either QR or BLE depending on active method.
   */
  private async exchange(
    request: SafePalQRRequest,
  ): Promise<SafePalQRResponse> {
    const payload = JSON.stringify(request);

    if (this.activeMethod === TransportMethod.BLUETOOTH) {
      const raw = await this.bleTransport!.exchange(payload);
      return JSON.parse(raw) as SafePalQRResponse;
    }

    // QR flow: display request QR, then scan response QR
    await this.qrProvider!.displayQR(payload, `safepal-${request.action}`);
    const responseString = await this.qrProvider!.scanQR([
      `safepal-${request.action}-response`,
    ]);
    return JSON.parse(responseString) as SafePalQRResponse;
  }
}
