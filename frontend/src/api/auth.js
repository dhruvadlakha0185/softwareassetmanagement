import client from "./client";

export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const getMe = () =>
  client.get("/auth/me").then((r) => r.data);

export const refresh = (refreshToken) =>
  client.post("/auth/refresh", { refresh_token: refreshToken }).then((r) => r.data);
