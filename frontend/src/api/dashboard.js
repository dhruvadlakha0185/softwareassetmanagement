import client from "./client";

export const fetchDashboardSummary = () =>
  client.get("/dashboard/summary").then(r => r.data);
