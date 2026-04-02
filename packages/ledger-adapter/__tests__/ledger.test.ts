import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LedgerAdapter } from '../src';
import type { TransportCreator } from '../src';
import { TransportMethod, HardwareWalletConnectionError, HardwareWalletSignError } from '@solana-wallet-sdk/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockApp, MOCK_PUBKEY_BYTES } = vi.hoisted(() => {
  const MOCK_BYTES = new Uint8Array(32).fill(1);
  const MOCK_SIG = Buffer.alloc(64, 0xab);
  return {
    MOCK_PUBKEY_BYTES: MOCK_BYTES,
    mockApp: {
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_BYTES }),
      signTransaction: vi.fn().mockResolvedValue({ signature: MOCK_SIG }),
      signOffchainMessage: vi.fn().mockResolvedValue({ signature: MOCK_SIG }),
    }
  };
});
const MOCK_PUBKEY = new PublicKey(MOCK_PUBKEY_BYTES);

function createMockTransport() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// We mock the Solana constructor at module level
vi.mock('@ledgerhq/hw-app-solana', () => {
  return {
    default: vi.fn().mockImplementation(() => mockApp),
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LedgerAdapter', () => {
  let adapter: LedgerAdapter;
  let mockTransportCreator: TransportCreator;
  let mockTransport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport = createMockTransport();
    mockTransportCreator = {
      create: vi.fn().mockResolvedValue(mockTransport),
    };
    adapter = new LedgerAdapter(mockTransportCreator);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('Ledger');
    });

    it('should support USB and Bluetooth', () => {
      expect(adapter.transportMethods).toContain(TransportMethod.USB);
      expect(adapter.transportMethods).toContain(TransportMethod.BLUETOOTH);
    });
  });

  describe('connect()', () => {
    it('should create transport and initialize Solana app', async () => {
      await adapter.connect(TransportMethod.USB);
      expect(mockTransportCreator.create).toHaveBeenCalledOnce();
    });

    it('should reject unsupported transport methods', async () => {
      await expect(adapter.connect(TransportMethod.QR)).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });

    it('should throw HardwareWalletConnectionError on transport failure', async () => {
      (mockTransportCreator.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('USB device not found')
      );
      await expect(adapter.connect(TransportMethod.USB)).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });
  });

  describe('disconnect()', () => {
    it('should close the transport', async () => {
      await adapter.connect(TransportMethod.USB);
      await adapter.disconnect();
      expect(mockTransport.close).toHaveBeenCalledOnce();
    });

    it('should be safe to call when not connected', async () => {
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('deriveAccount()', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.deriveAccount("m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });

    it('should return a PublicKey from the device', async () => {
      await adapter.connect(TransportMethod.USB);
      const pk = await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(pk).toBeInstanceOf(PublicKey);
    });

    it('should strip m/ prefix before calling Ledger API', async () => {
      await adapter.connect(TransportMethod.USB);
      await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(mockApp.getAddress).toHaveBeenCalledWith("44'/501'/0'/0'");
    });
  });

  describe('signTransaction()', () => {
    it('should throw when not connected', async () => {
      const tx = new Transaction();
      await expect(adapter.signTransaction(tx, "m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });

    it('should call signTransaction on the Ledger app', async () => {
      await adapter.connect(TransportMethod.USB);

      const tx = new Transaction();
      tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
      tx.feePayer = MOCK_PUBKEY;

      await adapter.signTransaction(tx, "m/44'/501'/0'/0'");
      expect(mockApp.signTransaction).toHaveBeenCalledOnce();
    });

    it('should detect user rejection (0x6985)', async () => {
      await adapter.connect(TransportMethod.USB);

      const rejectionError = Object.assign(new Error('Rejected'), {
        statusCode: 0x6985,
      });
      mockApp.signTransaction.mockRejectedValue(rejectionError);

      const tx = new Transaction();
      tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
      tx.feePayer = MOCK_PUBKEY;

      await expect(adapter.signTransaction(tx, "m/44'/501'/0'/0'")).rejects.toThrow(
        'User rejected'
      );
    });
  });

  describe('signMessage()', () => {
    it('should throw when not connected', async () => {
      await expect(
        adapter.signMessage(new Uint8Array([1, 2, 3]), "m/44'/501'/0'/0'")
      ).rejects.toThrow(HardwareWalletConnectionError);
    });

    it('should return a signature from signOffchainMessage', async () => {
      await adapter.connect(TransportMethod.USB);
      const sig = await adapter.signMessage(
        new Uint8Array([1, 2, 3]),
        "m/44'/501'/0'/0'"
      );
      expect(sig).toBeInstanceOf(Uint8Array);
      expect(sig.length).toBe(64);
    });
  });
});
