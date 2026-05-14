import { create } from "zustand";
import { login as apiLogin, getMe } from "../api/auth";

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem("access_token") || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiLogin(email, password);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      set({ user: data.user, token: data.access_token, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.detail || "Login failed", loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, token: null, error: null });
  },

  fetchMe: async () => {
    try {
      const user = await getMe();
      set({ user });
    } catch {
      get().logout();
    }
  },
}));

export default useAuthStore;
