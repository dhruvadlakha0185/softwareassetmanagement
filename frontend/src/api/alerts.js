import client from "./client";

const base = "/alerts";

export const fetchAlerts = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const markAlertRead = (alertId) =>
  client.post(`${base}/${alertId}/read`);

export const fetchAlertCounts = () =>
  client.get(`${base}/counts`).then(r => r.data);
