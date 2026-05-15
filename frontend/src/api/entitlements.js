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

export const renewEntitlement = (entId, fields, contractFile) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v != null && v !== "") fd.append(k, v); });
  if (contractFile) fd.append("contract_file", contractFile);
  return client.post(`${base}/${entId}/renew`, fd).then(r => r.data);
};

export const uploadUsage = (file, params = {}) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
  }).then(r => r.data);
};
