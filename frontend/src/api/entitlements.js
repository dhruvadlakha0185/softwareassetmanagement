import client from "./client";

const base = "/entitlements";

export const fetchEntitlements = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const fetchEntitlement = (entId) =>
  client.get(`${base}/${entId}`).then(r => r.data);

export const updateEntitlement = (entId, data) =>
  client.put(`${base}/${entId}`, data).then(r => r.data);

export const downloadTemplate = () =>
  client.get(`${base}/template`, { responseType: "blob" }).then(r => r.data);

export const renewEntitlement = (entId, data) =>
  client.post(`${base}/${entId}/renew`, data).then(r => r.data);

export const uploadUsage = (file, params = {}) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
  }).then(r => r.data);
};
