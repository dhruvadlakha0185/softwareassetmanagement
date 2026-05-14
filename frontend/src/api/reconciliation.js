import client from "./client";

const base = "/reconciliation";

export const triggerRun = () =>
  client.post(`${base}/run`).then(r => r.data);

export const fetchRuns = () =>
  client.get(`${base}/results`).then(r => r.data);

export const fetchLatestRun = () =>
  client.get(`${base}/results/latest`).then(r => r.data);

export const fetchRun = (runId) =>
  client.get(`${base}/results/${runId}`).then(r => r.data);
