import { describe, it, expect } from "vitest";
import {
  TransportMethod,
  DEFAULT_DERIVATION_PATH,
  HardwareWalletError,
  HardwareWalletConnectionError,
  HardwareWalletSignError,
  HardwareWalletTimeoutError,
} from "../src";

// ─── TransportMethod Enum ───────────────────────────────────────────────────

describe("TransportMethod", () => {
  it("should include USB, BLUETOOTH, NFC, and QR", () => {
    expect(TransportMethod.USB).toBe("USB");
    expect(TransportMethod.BLUETOOTH).toBe("BLUETOOTH");
    expect(TransportMethod.NFC).toBe("NFC");
    expect(TransportMethod.QR).toBe("QR");
  });

  it("should have exactly 4 members", () => {
    const values = Object.values(TransportMethod);
    expect(values).toHaveLength(4);
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe("DEFAULT_DERIVATION_PATH", () => {
  it("should be the standard Solana BIP-44 path", () => {
    expect(DEFAULT_DERIVATION_PATH).toBe("m/44'/501'/0'/0'");
  });
});

// ─── Error Hierarchy ────────────────────────────────────────────────────────

describe("Error Classes", () => {
  describe("HardwareWalletError", () => {
    it("should set name and message correctly", () => {
      const error = new HardwareWalletError("test error");
      expect(error.message).toBe("test error");
      expect(error.name).toBe("HardwareWalletError");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HardwareWalletError);
    });

    it("should support a cause parameter", () => {
      const cause = new Error("root cause");
      const error = new HardwareWalletError("wrapper", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("HardwareWalletConnectionError", () => {
    it("should extend HardwareWalletError", () => {
      const error = new HardwareWalletConnectionError("connection failed");
      expect(error.name).toBe("HardwareWalletConnectionError");
      expect(error).toBeInstanceOf(HardwareWalletError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("HardwareWalletSignError", () => {
    it("should extend HardwareWalletError", () => {
      const error = new HardwareWalletSignError("sign rejected");
      expect(error.name).toBe("HardwareWalletSignError");
      expect(error).toBeInstanceOf(HardwareWalletError);
    });
  });

  describe("HardwareWalletTimeoutError", () => {
    it("should extend HardwareWalletError", () => {
      const error = new HardwareWalletTimeoutError("timed out");
      expect(error.name).toBe("HardwareWalletTimeoutError");
      expect(error).toBeInstanceOf(HardwareWalletError);
    });
  });

  it("should support instanceof checks across the hierarchy", () => {
    const connError = new HardwareWalletConnectionError("fail");
    const signError = new HardwareWalletSignError("fail");
    const timeoutError = new HardwareWalletTimeoutError("fail");

    // All are HardwareWalletError
    expect(connError).toBeInstanceOf(HardwareWalletError);
    expect(signError).toBeInstanceOf(HardwareWalletError);
    expect(timeoutError).toBeInstanceOf(HardwareWalletError);

    // But not each other
    expect(connError).not.toBeInstanceOf(HardwareWalletSignError);
    expect(signError).not.toBeInstanceOf(HardwareWalletConnectionError);
  });
});
