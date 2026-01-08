import axios from "axios";
import { getToken, clearToken } from "../utils/token";

/**
 * Единая точка конфигурации baseURL для всего frontend.
 * VITE_API_BASE_URL=http://127.0.0.1:8001 + fallback
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001";

/**
 * Общий HTTP-клиент обрабатывающий все запросы к backend.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15 секунд
});

/**
 * Request interceptor:
 * Автоматически добавляет заголовок Authorization для всех запросов,
 * если токен присутствует в хранилище.
 */
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor:
 * Централизованная обработка ситуаций, когда токен истек/невалиден.
 *
 * На 401:
 * - чистим токен,
 * - дальше ошибка прокидывается в UI.
 */
http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  }
);
