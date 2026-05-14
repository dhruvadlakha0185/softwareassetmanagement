import client from "./client";

export const fetchScorecard = () =>
  client.get("/cost-optimisation/scorecard").then(r => r.data);
