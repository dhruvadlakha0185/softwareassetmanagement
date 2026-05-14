import { create } from "zustand";

const useUIStore = create((set) => ({
  drawerOpen: false,
  drawerContent: null,
  modalOpen: false,

  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false, drawerContent: null }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));

export default useUIStore;
