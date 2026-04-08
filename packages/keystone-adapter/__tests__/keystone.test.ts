import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeystoneAdapter } from "../src";
import {
  TransportMethod,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  QRInteractionProvider,
} from "@solana-wallet-sdk/core";
import { PublicKey, Transaction } from "@solana/web3.js";

// ─── Mock QR Provider ───────────────────────────────────────────────────────

function createMockQRProvider(): QRInteractionProvider & {
  displayQR: ReturnType<typeof vi.fn>;
  scanQR: ReturnType<typeof vi.fn>;
} {
  return {
    displayQR: vi.fn().mockResolvedValue(undefined),
    scanQR: vi.fn().mockResolvedValue("mock-ur-response"),
  };
}

// ─── Mock Keystone SDK ──────────────────────────────────────────────────────

const MOCK_PUBKEY = new PublicKey(new Uint8Array(32).fill(2));
const MOCK_SIGNATURE = Buffer.alloc(64, 0xcd);

vi.mock("@keystonehq/keystone-sdk", () => {
  return {
    KeystoneSDK: vi.fn().mockImplementation(() => ({
      parseMultiAccounts: vi.fn().mockReturnValue({
        keys: [
          {
            chain: "SOL",
            path: "m/44'/501'/0'/0'",
            publicKey: MOCK_PUBKEY.toBuffer(),
          },
        ],
      }),
      sol: {
        generateSignRequest: vi.fn().mockReturnValue({
          type: "sol-sign-request",
          cbor: Buffer.from("mock-cbor"),
        }),
        parseSignature: vi.fn().mockReturnValue({
          signature: MOCK_SIGNATURE,
        }),
      },
    })),
    UR: vi.fn().mockImplementation((data: Buffer, type: string) => ({
      type,
      cbor: data,
    })),
  };
});

vi.mock("@ngraveio/bc-ur", () => {
  return {
    UREncoder: vi.fn().mockImplementation(() => ({
      nextPart: vi.fn().mockReturnValue("ur:sol-sign-request/mock-encoded"),
    })),
    URDecoder: vi.fn(),
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("KeystoneAdapter", () => {
  let adapter: KeystoneAdapter;
  let mockQR: ReturnType<typeof createMockQRProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQR = createMockQRProvider();
    adapter = new KeystoneAdapter(mockQR);
  });

  describe("metadata", () => {
    it("should have correct name", () => {
      expect(adapter.name).toBe("Keystone");
    });

    it("should only support QR", () => {
      expect(adapter.transportMethods).toEqual([TransportMethod.QR]);
    });
  });

  describe("connect()", () => {
    it("should reject non-QR transport methods", async () => {
      await expect(adapter.connect(TransportMethod.USB)).rejects.toThrow(
        HardwareWalletConnectionError,
      );
    });

    it("should scan for multi-accounts QR on connect", async () => {
      await adapter.connect(TransportMethod.QR);
      expect(mockQR.scanQR).toHaveBeenCalledWith(["crypto-multi-accounts"]);
    });

    it("should cache accounts discovered during sync", async () => {
      await adapter.connect(TransportMethod.QR);
      // deriveAccount should return the cached key without QR interaction
      const pk = await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(pk).toBeInstanceOf(PublicKey);
      // No additional QR interaction needed for cached path
      expect(mockQR.displayQR).not.toHaveBeenCalled();
    });
  });

  describe("disconnect()", () => {
    it("should clear cached accounts", async () => {
      await adapter.connect(TransportMethod.QR);
      await adapter.disconnect();
      // After disconnect, deriveAccount should require QR flow
      mockQR.scanQR.mockResolvedValue("mock-ur-response");
      // The adapter will try QR flow for uncached paths
    });
  });

  describe("signTransaction()", () => {
    it("should generate a sign request QR and scan the response", async () => {
      await adapter.connect(TransportMethod.QR);

      const tx = new Transaction();
      tx.recentBlockhash = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
      tx.feePayer = MOCK_PUBKEY;

      await adapter.signTransaction(tx, "m/44'/501'/0'/0'");

      // Should display the sign request QR
      expect(mockQR.displayQR).toHaveBeenCalledOnce();
      // Should scan for the signature response
      expect(mockQR.scanQR).toHaveBeenCalledWith(["sol-signature"]);
    });
  });

  describe("signMessage()", () => {
    it("should generate a message sign request and scan response", async () => {
      await adapter.connect(TransportMethod.QR);

      const msg = new TextEncoder().encode("Hello, SIWS!");
      const sig = await adapter.signMessage(msg, "m/44'/501'/0'/0'");

      expect(sig).toBeInstanceOf(Uint8Array);
      expect(mockQR.displayQR).toHaveBeenCalledOnce();
      expect(mockQR.scanQR).toHaveBeenCalledWith(["sol-signature"]);
    });
  });
});
