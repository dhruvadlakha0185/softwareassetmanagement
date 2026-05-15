import client from "./client";

const base = "/catalog";

export const fetchCatalog = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const fetchCatalogRows = (params = {}) =>
  client.get(`${base}/rows`, { params }).then(r => r.data);

export const fetchCatalogDetail = (swId) =>
  client.get(`${base}/${swId}/detail`).then(r => r.data);

export const fetchCatalogBrief = () =>
  client.get(`${base}/brief`).then(r => r.data);

export const fetchCatalogEntry = (swId) =>
  client.get(`${base}/${swId}`).then(r => r.data);

export const createCatalogEntry = (data) =>
  client.post(base, data).then(r => r.data);

export const updateCatalogEntry = (swId, data) =>
  client.put(`${base}/${swId}`, data).then(r => r.data);

export const deleteCatalogEntry = (swId) =>
  client.delete(`${base}/${swId}`);

export const addAlias = (swId, data) =>
  client.post(`${base}/${swId}/aliases`, data).then(r => r.data);

export const deleteAlias = (aliasId) =>
  client.delete(`${base}/aliases/${aliasId}`);
