import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAdapterCapabilities, type UseHardwareWalletOptions } from "../src";
import {
  TransportMethod,
  HardwareWalletAdapter,
  HardwareWalletConnectionError,
} from "@solana-wallet-sdk/core";
import { PublicKey } from "@solana/web3.js";

// ─── Mock Adapter ───────────────────────────────────────────────────────────

const MOCK_PUBKEY = new PublicKey(new Uint8Array(32).fill(3));

function createMockAdapter(
  name: string,
  methods: TransportMethod[],
): HardwareWalletAdapter {
  return {
    name,
    transportMethods: methods,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    deriveAccount: vi.fn().mockResolvedValue(MOCK_PUBKEY),
    signTransaction: vi.fn().mockImplementation(async (tx) => tx),
    signMessage: vi.fn().mockResolvedValue(new Uint8Array(64)),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("getAdapterCapabilities()", () => {
  it("should correctly identify USB + Bluetooth capabilities", () => {
    const adapter = createMockAdapter("Ledger", [
      TransportMethod.USB,
      TransportMethod.BLUETOOTH,
    ]);
    const caps = getAdapterCapabilities(adapter);

    expect(caps.name).toBe("Ledger");
    expect(caps.supportsUSB).toBe(true);
    expect(caps.supportsBluetooth).toBe(true);
    expect(caps.supportsNFC).toBe(false);
    expect(caps.supportsQR).toBe(false);
  });

  it("should correctly identify QR-only capabilities", () => {
    const adapter = createMockAdapter("Keystone", [TransportMethod.QR]);
    const caps = getAdapterCapabilities(adapter);

    expect(caps.supportsUSB).toBe(false);
    expect(caps.supportsBluetooth).toBe(false);
    expect(caps.supportsQR).toBe(true);
  });

  it("should correctly identify NFC capabilities", () => {
    const adapter = createMockAdapter("FutureWallet", [TransportMethod.NFC]);
    const caps = getAdapterCapabilities(adapter);

    expect(caps.supportsNFC).toBe(true);
    expect(caps.supportsUSB).toBe(false);
  });
});

// Note: Hook tests with renderHook require @testing-library/react-hooks
// and a React environment. Below are structural tests that validate the
// hook's contract without a full React test renderer.

describe("useHardwareWallet contract", () => {
  it("should be importable", async () => {
    const mod = await import("../src");
    expect(mod.useHardwareWallet).toBeDefined();
    expect(typeof mod.useHardwareWallet).toBe("function");
  });
});

describe("useQRInteraction contract", () => {
  it("should be importable", async () => {
    const mod = await import("../src");
    expect(mod.useQRInteraction).toBeDefined();
    expect(typeof mod.useQRInteraction).toBe("function");
  });
});

describe("re-exports", () => {
  it("should re-export core types", async () => {
    const mod = await import("../src");
    expect(mod.TransportMethod).toBeDefined();
    expect(mod.DEFAULT_DERIVATION_PATH).toBeDefined();
    expect(mod.HardwareWalletConnectionError).toBeDefined();
  });
});
