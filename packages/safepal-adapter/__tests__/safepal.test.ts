import { describe, it, expect, vi, beforeEach } from "vitest";
import { SafePalAdapter, type SafePalBleTransport } from "../src";
import {
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  QRInteractionProvider,
} from "@solana-wallet-sdk/core";
import { PublicKey, Transaction } from "@solana/web3.js";

// ─── Mock Helpers ───────────────────────────────────────────────────────────

const MOCK_ADDRESS = "11111111111111111111111111111112";
const MOCK_SIGNATURE_HEX = "cd".repeat(64);

function createMockQRProvider(): QRInteractionProvider & {
  displayQR: ReturnType<typeof vi.fn>;
  scanQR: ReturnType<typeof vi.fn>;
} {
  return {
    displayQR: vi.fn().mockResolvedValue(undefined),
    scanQR: vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ status: "ok", result: MOCK_ADDRESS }),
      ),
  };
}

function createMockBleTransport(): SafePalBleTransport & {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  exchange: ReturnType<typeof vi.fn>;
} {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    exchange: vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ status: "ok", result: MOCK_ADDRESS }),
      ),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SafePalAdapter", () => {
  describe("with QR provider", () => {
    let adapter: SafePalAdapter;
    let mockQR: ReturnType<typeof createMockQRProvider>;

    beforeEach(() => {
      mockQR = createMockQRProvider();
      adapter = new SafePalAdapter({ qrProvider: mockQR });
    });

    it("should have correct name", () => {
      expect(adapter.name).toBe("SafePal");
    });

    it("should support QR when QR provider is given", () => {
      expect(adapter.transportMethods).toContain(TransportMethod.QR);
    });

    it("should connect via QR", async () => {
      await expect(
        adapter.connect(TransportMethod.QR),
      ).resolves.toBeUndefined();
    });

    it("should reject unsupported methods", async () => {
      await expect(adapter.connect(TransportMethod.USB)).rejects.toThrow(
        HardwareWalletConnectionError,
      );
    });

    it("should derive account via QR flow", async () => {
      await adapter.connect(TransportMethod.QR);
      const pk = await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(pk).toBeInstanceOf(PublicKey);
      expect(mockQR.displayQR).toHaveBeenCalledOnce();
      expect(mockQR.scanQR).toHaveBeenCalledOnce();
    });

    it("should sign transaction via QR flow", async () => {
      // Mock the scan response to return a signature
      mockQR.scanQR.mockResolvedValue(
        JSON.stringify({ status: "ok", result: MOCK_SIGNATURE_HEX }),
      );
      // Mock deriveAccount response
      const deriveResponse = JSON.stringify({
        status: "ok",
        result: MOCK_ADDRESS,
      });
      mockQR.scanQR
        .mockResolvedValueOnce(
          JSON.stringify({ status: "ok", result: MOCK_SIGNATURE_HEX }),
        )
        .mockResolvedValueOnce(deriveResponse);

      await adapter.connect(TransportMethod.QR);

      const tx = new Transaction();
      tx.recentBlockhash = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
      tx.feePayer = new PublicKey(MOCK_ADDRESS);

      await adapter.signTransaction(tx, "m/44'/501'/0'/0'");
      expect(mockQR.displayQR).toHaveBeenCalled();
    });

    it("should sign message via QR flow", async () => {
      mockQR.scanQR.mockResolvedValue(
        JSON.stringify({ status: "ok", result: MOCK_SIGNATURE_HEX }),
      );

      await adapter.connect(TransportMethod.QR);
      const sig = await adapter.signMessage(
        new TextEncoder().encode("Hello, SIWS!"),
        "m/44'/501'/0'/0'",
      );

      expect(sig).toBeInstanceOf(Uint8Array);
    });

    it("should handle error responses", async () => {
      mockQR.scanQR.mockResolvedValue(
        JSON.stringify({ status: "error", error: "User rejected" }),
      );

      await adapter.connect(TransportMethod.QR);
      await expect(adapter.deriveAccount("m/44'/501'/0'/0'")).rejects.toThrow();
    });
  });

  describe("with BLE transport", () => {
    let adapter: SafePalAdapter;
    let mockBle: ReturnType<typeof createMockBleTransport>;

    beforeEach(() => {
      mockBle = createMockBleTransport();
      adapter = new SafePalAdapter({ bleTransport: mockBle });
    });

    it("should support Bluetooth when BLE transport is given", () => {
      expect(adapter.transportMethods).toContain(TransportMethod.BLUETOOTH);
    });

    it("should connect via Bluetooth", async () => {
      await adapter.connect(TransportMethod.BLUETOOTH);
      expect(mockBle.connect).toHaveBeenCalledOnce();
    });

    it("should disconnect Bluetooth", async () => {
      await adapter.connect(TransportMethod.BLUETOOTH);
      await adapter.disconnect();
      expect(mockBle.disconnect).toHaveBeenCalledOnce();
    });

    it("should derive account via BLE exchange", async () => {
      await adapter.connect(TransportMethod.BLUETOOTH);
      const pk = await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(pk).toBeInstanceOf(PublicKey);
      expect(mockBle.exchange).toHaveBeenCalledOnce();
    });
  });

  describe("configuration validation", () => {
    it("should throw if no transport is provided", () => {
      expect(() => new SafePalAdapter({})).toThrow(
        "requires at least one transport",
      );
    });

    it("should throw if methods are called before connect", async () => {
      const mockQR = createMockQRProvider();
      const adapter = new SafePalAdapter({ qrProvider: mockQR });
      await expect(adapter.deriveAccount("m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletConnectionError,
      );
    });
  });
});
