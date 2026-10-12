import { create } from "zustand";
import { getWallet, type WalletSummary } from "../services/wallet";

type WalletState = {
  wallet: WalletSummary | null;
  loading: boolean;
  error: string | null;
  /** Reloads the balance; failures keep the last known wallet. */
  refresh: () => Promise<WalletSummary | null>;
  clear: () => void;
};

/** One shared wallet so Home, the recorder and the Wallet screen agree. */
export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true });
    try {
      const wallet = await getWallet();
      set({ wallet, loading: false, error: null });
      return wallet;
    } catch (cause) {
      set({ loading: false, error: cause instanceof Error ? cause.message : "Could not load your wallet" });
      return null;
    }
  },
  clear: () => set({ wallet: null, error: null }),
}));
