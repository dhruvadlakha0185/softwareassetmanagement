import client from "./client";

export const fetchOwners = () => client.get("/owners").then(r => r.data);
export const createOwner = (data) => client.post("/owners", data).then(r => r.data);
export const updateOwner = (id, data) => client.put(`/owners/${id}`, data).then(r => r.data);
export const deactivateOwner = (id) => client.delete(`/owners/${id}`);

export const fetchDOA = () => client.get("/owners/doa").then(r => r.data);
export const createDOA = (data) => client.post("/owners/doa", data).then(r => r.data);
export const updateDOA = (id, data) => client.put(`/owners/doa/${id}`, data).then(r => r.data);
export const deleteDOA = (id) => client.delete(`/owners/doa/${id}`);
