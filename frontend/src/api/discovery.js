import client from "./client";

const base = "/discovery";

export const fetchDiscovery = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const ingestDiscovery = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/ingest`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};
