import { create } from "zustand";

const useAlertStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
}));

export default useAlertStore;
