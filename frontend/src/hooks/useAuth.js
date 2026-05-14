import { useEffect } from "react";
import useAuthStore from "../store/authStore";

export function useAuth() {
  const { user, token, login, logout, fetchMe, loading, error } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  return { user, token, login, logout, loading, error, isAuthenticated: !!token };
}
