import { create } from "zustand";
import { fetchAlertCounts } from "../api/alerts";

const useAlertStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  fetchUnreadCount: async () => {
    try {
      const data = await fetchAlertCounts();
      set({ unreadCount: data.total_unread });
    } catch {
      // silently fail — bell just shows 0
    }
  },
}));

export default useAlertStore;
