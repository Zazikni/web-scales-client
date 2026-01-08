import { qk } from "./keys";

/**
 * Унифицированные наборы для гибкой инвалидации взаимозависимых частей кеша.
 */

/**
 * Инвалидация списка устройств после create / delete.
 */
export async function invalidateDevicesList(qc) {
  await qc.invalidateQueries({ queryKey: qk.devices() });
}

/**
 * Инвалидация данных конкретного устройства и списка устройств.
 */
export async function invalidateDeviceAll(qc, deviceId) {
  const id = Number(deviceId);

  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.device(id) }),
    qc.invalidateQueries({ queryKey: qk.devices() }),
  ]);
}

/**
 * Инвалидация товаров устройства:
 * - кэш товаров
 * - само устройство (cached_dirty)
 * - список устройств
 */
export async function invalidateDeviceProducts(qc, deviceId) {
  const id = Number(deviceId);

  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.productsCached(id) }),
    qc.invalidateQueries({ queryKey: qk.device(id) }),
    qc.invalidateQueries({ queryKey: qk.devices() }),
  ]);
}

/**
 * Инвалидация автообновления сроков годности.
 */
export async function invalidateDeviceAutoUpdate(qc, deviceId) {
  const id = Number(deviceId);

  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.autoUpdate(id) }),
    qc.invalidateQueries({ queryKey: qk.device(id) }),
    qc.invalidateQueries({ queryKey: qk.devices() }),
  ]);
}
