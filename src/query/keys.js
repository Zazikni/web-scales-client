/**
 * Единые query keys для React Query.
 */

export const qk = {
  // Список всех устройств пользователя
  devices: () => ["devices"],

  // Конкретное устройство
  device: (deviceId) => ["device", Number(deviceId)],

  // Кэш товаров конкретного устройства
  productsCached: (deviceId) => ["productsCached", Number(deviceId)],

  // Настройки автообновления сроков годности
  autoUpdate: (deviceId) => ["autoUpdate", Number(deviceId)],
};