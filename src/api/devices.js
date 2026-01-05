import { http } from "./http";

export async function listDevices() {
  const resp = await http.get("/devices");
  return resp.data;
}

export async function createDevice(payload) {
  const resp = await http.post("/devices", payload);
  return resp.data;
}

export async function getDevice(deviceId) {
  const resp = await http.get(`/devices/${deviceId}`);
  return resp.data;
}

export async function updateDevice(deviceId, payload) {
  const resp = await http.put(`/devices/${deviceId}`, payload);
  return resp.data;
}

export async function deleteDevice(deviceId) {
  await http.delete(`/devices/${deviceId}`);
  return true;
}

export async function fetchProducts(deviceId) {
  const resp = await http.get(`/devices/${deviceId}/products`);
  return resp.data;
}

export async function getCachedProducts(deviceId) {
  const resp = await http.get(`/devices/${deviceId}/products/cached`);
  return resp.data;
}

export async function patchProductByPlu(deviceId, plu, fields) {
  const resp = await http.patch(
    `/devices/${deviceId}/products/${encodeURIComponent(String(plu))}`,
    { fields }
  );
  return resp.data;
}

export async function uploadCache(deviceId) {
  const resp = await http.post(`/devices/${deviceId}/upload`);
  return resp.data;
}

export async function getAutoUpdate(deviceId) {
  const resp = await http.get(`/devices/${deviceId}/auto-update`);
  return resp.data;
}

export async function setAutoUpdate(deviceId, payload) {
  const resp = await http.put(`/devices/${deviceId}/auto-update`, payload);
  return resp.data;
}
