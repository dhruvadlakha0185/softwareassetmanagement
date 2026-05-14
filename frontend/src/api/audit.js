import client from "./client";

const base = "/audit";

export const fetchAudit = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const exportAudit = (params = {}) =>
  client.get(`${base}/export`, { params, responseType: "blob" }).then(r => r.data);
