import client from "./client";

const base = "/onboarding";

export const extractContract = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/extract`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

export const fetchDrafts = () =>
  client.get(`${base}/drafts`).then(r => r.data);

export const createDraft = (data) =>
  client.post(`${base}/drafts`, data).then(r => r.data);

export const getDraft = (id) =>
  client.get(`${base}/drafts/${id}`).then(r => r.data);

export const updateDraft = (id, data) =>
  client.put(`${base}/drafts/${id}`, data).then(r => r.data);

export const deleteDraft = (id) =>
  client.delete(`${base}/drafts/${id}`);

export const publishOnboarding = (data) =>
  client.post(`${base}/publish`, data).then(r => r.data);
