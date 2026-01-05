import axios from "axios";
import { getToken, clearToken } from "../utils/token";

export const API_BASE_URL = "http://127.0.0.1:8001";

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // Токен устарел/невалидный — вычищаем и даём UI отреагировать
      clearToken();
    }
    return Promise.reject(error);
  }
);
