import { useState, useCallback, useRef } from "react";
import {
  HardwareWalletAdapter,
  TransportMethod,
  HardwareWalletConnectionError,
  QRInteractionProvider,
  DEFAULT_DERIVATION_PATH,
} from "@solana-wallet-sdk/core";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// ─── Re-exports for convenience ─────────────────────────────────────────────

export {
  TransportMethod,
  HardwareWalletConnectionError,
  DEFAULT_DERIVATION_PATH,
  type HardwareWalletAdapter,
  type QRInteractionProvider,
} from "@solana-wallet-sdk/core";

// ─── Adapter Capabilities ─────────────────────────────────────────────────

export interface AdapterCapabilities {
  name: string;
  transportMethods: readonly TransportMethod[];
  supportsUSB: boolean;
  supportsBluetooth: boolean;
  supportsNFC: boolean;
  supportsQR: boolean;
}

/**
 * Inspect the capabilities of a hardware wallet adapter at runtime.
 * Useful for conditionally rendering UI elements based on what the
 * connected wallet supports.
 */
export function getAdapterCapabilities(
  adapter: HardwareWalletAdapter,
): AdapterCapabilities {
  return {
    name: adapter.name,
    transportMethods: adapter.transportMethods,
    supportsUSB: adapter.transportMethods.includes(TransportMethod.USB),
    supportsBluetooth: adapter.transportMethods.includes(
      TransportMethod.BLUETOOTH,
    ),
    supportsNFC: adapter.transportMethods.includes(TransportMethod.NFC),
    supportsQR: adapter.transportMethods.includes(TransportMethod.QR),
  };
}

// ─── useHardwareWallet Hook ─────────────────────────────────────────────────

export interface UseHardwareWalletOptions {
  /** Array of adapter instances to make available. */
  adapters: HardwareWalletAdapter[];
  /** Default derivation path. Defaults to `m/44'/501'/0'/0'`. */
  defaultDerivationPath?: string;
}

export interface UseHardwareWalletReturn {
  /** All configured adapters. */
  adapters: HardwareWalletAdapter[];
  /** The currently connected adapter, or null. */
  activeAdapter: HardwareWalletAdapter | null;
  /** The derived public key, or null if not connected. */
  publicKey: PublicKey | null;
  /** True while a connect operation is in progress. */
  isConnecting: boolean;
  /** True while a signing operation is in progress. */
  isSigning: boolean;
  /** The last error that occurred, or null. */
  error: Error | null;
  /** Capabilities for each configured adapter. */
  capabilities: AdapterCapabilities[];
  /** Connect to a named adapter via a specific transport method. */
  connect: (adapterName: string, method: TransportMethod) => Promise<void>;
  /** Disconnect the active adapter. */
  disconnect: () => Promise<void>;
  /** Derive a different account by path. */
  deriveAccount: (path: string) => Promise<PublicKey>;
  /** Sign a transaction on the hardware device. */
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T,
    path?: string,
  ) => Promise<T>;
  /** Sign an arbitrary message on the hardware device. */
  signMessage: (message: Uint8Array, path?: string) => Promise<Uint8Array>;
  /** Clear the current error state. */
  clearError: () => void;
}

export function useHardwareWallet(
  options: UseHardwareWalletOptions,
): UseHardwareWalletReturn {
  const [activeAdapter, setActiveAdapter] =
    useState<HardwareWalletAdapter | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const defaultPath = options.defaultDerivationPath || DEFAULT_DERIVATION_PATH;

  const capabilities = options.adapters.map(getAdapterCapabilities);

  const connect = useCallback(
    async (adapterName: string, method: TransportMethod) => {
      setIsConnecting(true);
      setError(null);
      try {
        const adapter = options.adapters.find((a) => a.name === adapterName);
        if (!adapter) {
          throw new HardwareWalletConnectionError(
            `Adapter "${adapterName}" not found. ` +
              `Available: ${options.adapters.map((a) => a.name).join(", ")}`,
          );
        }

        await adapter.connect(method);
        const pk = await adapter.deriveAccount(defaultPath);

        setActiveAdapter(adapter);
        setPublicKey(pk);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [options.adapters, defaultPath],
  );

  const disconnect = useCallback(async () => {
    if (!activeAdapter) return;
    try {
      await activeAdapter.disconnect();
    } finally {
      setActiveAdapter(null);
      setPublicKey(null);
      setError(null);
    }
  }, [activeAdapter]);

  const deriveAccount = useCallback(
    async (path: string) => {
      if (!activeAdapter) {
        throw new HardwareWalletConnectionError(
          "No adapter is active. Call connect() first.",
        );
      }
      try {
        const pk = await activeAdapter.deriveAccount(path);
        setPublicKey(pk);
        return pk;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      }
    },
    [activeAdapter],
  );

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(
      transaction: T,
      path: string = defaultPath,
    ): Promise<T> => {
      if (!activeAdapter) {
        throw new HardwareWalletConnectionError(
          "No adapter is active. Call connect() first.",
        );
      }
      setIsSigning(true);
      setError(null);
      try {
        return await activeAdapter.signTransaction(transaction, path);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsSigning(false);
      }
    },
    [activeAdapter, defaultPath],
  );

  const signMessage = useCallback(
    async (
      message: Uint8Array,
      path: string = defaultPath,
    ): Promise<Uint8Array> => {
      if (!activeAdapter) {
        throw new HardwareWalletConnectionError(
          "No adapter is active. Call connect() first.",
        );
      }
      setIsSigning(true);
      setError(null);
      try {
        return await activeAdapter.signMessage(message, path);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsSigning(false);
      }
    },
    [activeAdapter, defaultPath],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    adapters: options.adapters,
    activeAdapter,
    publicKey,
    isConnecting,
    isSigning,
    error,
    capabilities,
    connect,
    disconnect,
    deriveAccount,
    signTransaction,
    signMessage,
    clearError,
  };
}

// ─── useQRInteraction Hook ──────────────────────────────────────────────────

export interface QRInteractionState {
  /** The QR data currently being displayed, or null. */
  qrData: string | null;
  /** The type hint for the current QR code. */
  qrType: string | null;
  /** Whether the scanner is active and waiting for input. */
  isScanning: boolean;
  /** The expected UR types for the current scan. */
  expectedTypes: string[];
}

export interface UseQRInteractionReturn extends QRInteractionState {
  /**
   * The QRInteractionProvider to inject into QR-based adapters.
   * This bridges the adapter's QR requests to React state.
   */
  qrProvider: QRInteractionProvider;
  /**
   * Call this from your QR scanner component when a QR code is decoded.
   * This resolves the pending `scanQR()` promise inside the adapter.
   */
  onQRScanned: (data: string) => void;
  /**
   * Call this when the user acknowledges the displayed QR code
   * (e.g., taps a "Done" button after showing the QR to the device).
   */
  onQRDisplayDone: () => void;
}

/**
 * React hook that bridges QR-based hardware wallet adapters (Keystone, SafePal)
 * to the UI layer. Returns a `QRInteractionProvider` that you inject into the
 * adapter constructor, plus React state for rendering QR codes and scanners.
 *
 * @example
 * ```tsx
 * const { qrProvider, qrData, isScanning, onQRScanned, onQRDisplayDone } = useQRInteraction();
 * const keystone = useMemo(() => new KeystoneAdapter(qrProvider), [qrProvider]);
 *
 * return (
 *   <>
 *     {qrData && <QRCodeView data={qrData} onDone={onQRDisplayDone} />}
 *     {isScanning && <QRScanner onScan={onQRScanned} />}
 *   </>
 * );
 * ```
 */
export function useQRInteraction(): UseQRInteractionReturn {
  const [qrData, setQRData] = useState<string | null>(null);
  const [qrType, setQRType] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [expectedTypes, setExpectedTypes] = useState<string[]>([]);

  // Promise resolvers stored in refs to bridge async adapter calls → React events
  const displayResolveRef = useRef<(() => void) | null>(null);
  const scanResolveRef = useRef<((data: string) => void) | null>(null);

  const onQRDisplayDone = useCallback(() => {
    setQRData(null);
    setQRType(null);
    if (displayResolveRef.current) {
      displayResolveRef.current();
      displayResolveRef.current = null;
    }
  }, []);

  const onQRScanned = useCallback((data: string) => {
    setIsScanning(false);
    setExpectedTypes([]);
    if (scanResolveRef.current) {
      scanResolveRef.current(data);
      scanResolveRef.current = null;
    }
  }, []);

  const qrProvider: QRInteractionProvider = {
    displayQR: (data: string, type: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        displayResolveRef.current = resolve;
        setQRData(data);
        setQRType(type);
      });
    },

    scanQR: (types: string[]): Promise<string> => {
      return new Promise<string>((resolve) => {
        scanResolveRef.current = resolve;
        setIsScanning(true);
        setExpectedTypes(types);
      });
    },
  };

  return {
    qrData,
    qrType,
    isScanning,
    expectedTypes,
    qrProvider,
    onQRScanned,
    onQRDisplayDone,
  };
}
