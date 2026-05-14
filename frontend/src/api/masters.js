import client from "./client";

const base = "/masters";

export const fetchAllMasters = () => client.get(`${base}/all`).then(r => r.data);

export const fetchCategories = () => client.get(`${base}/categories`).then(r => r.data);
export const createCategory = (data) => client.post(`${base}/categories`, data).then(r => r.data);
export const updateCategory = (id, data) => client.put(`${base}/categories/${id}`, data).then(r => r.data);
export const deleteCategory = (id) => client.delete(`${base}/categories/${id}`);
export const createSubCategory = (data) => client.post(`${base}/sub-categories`, data).then(r => r.data);
export const deleteSubCategory = (id) => client.delete(`${base}/sub-categories/${id}`);

export const fetchVendors = () => client.get(`${base}/vendors`).then(r => r.data);
export const createVendor = (data) => client.post(`${base}/vendors`, data).then(r => r.data);
export const updateVendor = (id, data) => client.put(`${base}/vendors/${id}`, data).then(r => r.data);
export const deleteVendor = (id) => client.delete(`${base}/vendors/${id}`);

export const fetchMetrics = () => client.get(`${base}/metrics`).then(r => r.data);
export const createMetric = (data) => client.post(`${base}/metrics`, data).then(r => r.data);
export const updateMetric = (id, data) => client.put(`${base}/metrics/${id}`, data).then(r => r.data);
export const deleteMetric = (id) => client.delete(`${base}/metrics/${id}`);

export const fetchSources = () => client.get(`${base}/discovery-sources`).then(r => r.data);
export const createSource = (data) => client.post(`${base}/discovery-sources`, data).then(r => r.data);
export const updateSource = (id, data) => client.put(`${base}/discovery-sources/${id}`, data).then(r => r.data);
export const deleteSource = (id) => client.delete(`${base}/discovery-sources/${id}`);

export const fetchMethods = () => client.get(`${base}/usage-methods`).then(r => r.data);
export const createMethod = (data) => client.post(`${base}/usage-methods`, data).then(r => r.data);
export const updateMethod = (id, data) => client.put(`${base}/usage-methods/${id}`, data).then(r => r.data);
export const deleteMethod = (id) => client.delete(`${base}/usage-methods/${id}`);

export const fetchRegions = () => client.get(`${base}/regions`).then(r => r.data);
export const createRegion = (data) => client.post(`${base}/regions`, data).then(r => r.data);
export const updateRegion = (id, data) => client.put(`${base}/regions/${id}`, data).then(r => r.data);
export const deleteRegion = (id) => client.delete(`${base}/regions/${id}`);
