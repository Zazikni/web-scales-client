import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDevice,
  fetchProducts,
  getCachedProducts,
  patchProductByPlu,
  uploadCache,
  getAutoUpdate,
  setAutoUpdate,
} from "../api/devices";
import { Toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { utcToLocal } from "../utils/datetime";
import { qk } from "../query/keys";
import {
  invalidateDeviceProducts,
  invalidateDeviceAutoUpdate,
} from "../query/invalidate";

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function fmtDate(v) {
  if (!v) return "—";
  return String(v);
}

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Приведение интервала автообновления к int >= 1.
 * FastAPI обычно ожидает именно int, иначе получим 422.
 */
function normalizeIntervalMinutes(v, fallback = 60) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const intN = Math.trunc(n);
  if (intN <= 0) return fallback;
  return intN;
}

/**
 * Извлечь человекочитаемую строку ошибки из axios/FastAPI.
 * Важно: возвращаем СТРОКУ, чтобы React не пытался отрендерить объект.
 */
function extractErrorMessage(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return { status, message: detail.trim() };
  }

  // FastAPI 422: detail = [{loc, msg, type, ...}, ...]
  if (Array.isArray(detail) && detail.length) {
    const parts = detail
      .map((x) => {
        const loc = Array.isArray(x?.loc) ? x.loc.join(".") : "";
        const msg = x?.msg ? String(x.msg) : "";
        if (loc && msg) return `${loc}: ${msg}`;
        return msg || "";
      })
      .filter(Boolean);

    if (parts.length) return { status, message: parts.join("; ") };

    try {
      return { status, message: JSON.stringify(detail) };
    } catch {
      return { status, message: "Ошибка валидации данных" };
    }
  }

  if (detail && typeof detail === "object") {
    try {
      return { status, message: JSON.stringify(detail) };
    } catch {
      // ignore
    }
  }

  if (typeof data === "string" && data.trim()) {
    return { status, message: data.trim() };
  }

  if (err?.message) return { status, message: String(err.message) };

  return { status, message: "Неизвестная ошибка" };
}

/**
 * Ожидаемый формат: DD-MM-YY (например 01-01-26)
 * Маска: берём только цифры, вставляем дефисы после 2 и 4.
 */
function maskDDMMYY(raw) {
  const digits = String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yy = digits.slice(4, 6);

  if (digits.length <= 2) return dd;
  if (digits.length <= 4) return `${dd}-${mm}`;
  return `${dd}-${mm}-${yy}`;
}

function parseDDMMYY(s) {
  if (!s) return null;
  const str = String(s).trim();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]) + 2000;

  const d = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0));
  if (Number.isNaN(d.getTime())) return null;

  // защита от "переползания" даты (31-02-26 и т.п.)
  if (
    d.getUTCFullYear() !== yy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return null;
  }
  return d;
}

function isDDMMYY(s) {
  if (!s) return true; // пустое допускаем
  return parseDDMMYY(s) !== null;
}

function dateErrorText(s) {
  if (!s) return "";
  return isDDMMYY(s) ? "" : "Формат даты: DD-MM-YY, например 01-01-26";
}

function daysUntil(dateUtc) {
  if (!dateUtc) return null;
  const now = new Date();
  const nowUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0
    )
  );
  const diffMs = dateUtc.getTime() - nowUtc.getTime();
  return Math.floor(diffMs / (24 * 3600 * 1000));
}

function YesNoToggle({ value, onChange, disabled = false }) {
  const isOn = !!value;

  return (
    <div
      className={`yn-toggle ${isOn ? "on" : "off"} ${
        disabled ? "is-disabled" : ""
      }`}
      role="group"
      aria-label="Переключатель Да/Нет"
    >
      <button
        type="button"
        className={`yn-opt ${!isOn ? "active" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
        aria-pressed={!isOn ? "true" : "false"}
      >
        Нет
      </button>

      <button
        type="button"
        className={`yn-opt ${isOn ? "active" : ""}`}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
        aria-pressed={isOn ? "true" : "false"}
      >
        Да
      </button>
    </div>
  );
}

function computeStatus(p) {
  const sellBy = parseDDMMYY(p?.sellByDate);
  const d = daysUntil(sellBy);
  if (d === null) return { cls: "status-ok", label: "OK" };
  if (d < 0) return { cls: "status-bad", label: "Просрочен" };
  if (d <= 2) return { cls: "status-warn", label: `Скоро (${d}д)` };
  return { cls: "status-ok", label: "OK" };
}

/**
 * В вашем JSON: PLU = pluNumber
 * На всякий случай оставляем fallback'и для совместимости
 */
function getPlu(product) {
  const candidates = [
    product?.pluNumber, // <-- ГЛАВНОЕ
    product?.plu,
    product?.product_key,
    product?.productKey,
    product?.code,
    product?.id,
  ];
  const found = candidates.find(
    (x) => x !== undefined && x !== null && String(x).trim() !== ""
  );
  return found ?? null;
}

/**
 * У вас срок годности: shelfLife (а не shelfLifeInDays)
 * Оставим функцию для нормализации.
 */
function getShelfLifeDays(p) {
  const candidates = [
    p?.shelfLife, // <-- ГЛАВНОЕ
    p?.shelfLifeInDays,
  ];
  const found = candidates.find((x) => x !== undefined && x !== null && x !== "");
  return toNum(found, 0);
}

export default function DeviceDetailPage() {
  const { id } = useParams();
  const deviceId = Number(id);
  const qc = useQueryClient();

  const isValidDeviceId = Number.isFinite(deviceId) && deviceId > 0;

  const [toast, setToast] = useState({ message: "", type: "info" });
  function show(message, type = "info") {
    const safeMsg =
      typeof message === "string"
        ? message
        : (() => {
            try {
              return JSON.stringify(message);
            } catch {
              return "Неизвестная ошибка";
            }
          })();
    setToast({ message: safeMsg, type });
  }

  // Показываем "Синхронизировано" на короткое время после успешной загрузки в весы.
  const [syncedFlash, setSyncedFlash] = useState(false);
  const syncedTimerRef = useRef(null);

  function flashSynced() {
    if (syncedTimerRef.current) clearTimeout(syncedTimerRef.current);
    setSyncedFlash(true);
    syncedTimerRef.current = setTimeout(() => {
      setSyncedFlash(false);
      syncedTimerRef.current = null;
    }, 2500);
  }

  // Важно: очищаем таймер при размонтировании компонента
  useEffect(() => {
    return () => {
      if (syncedTimerRef.current) {
        clearTimeout(syncedTimerRef.current);
        syncedTimerRef.current = null;
      }
    };
  }, []);

  const deviceQ = useQuery({
    queryKey: qk.device(deviceId),
    queryFn: () => getDevice(deviceId),
    enabled: isValidDeviceId,
  });

  const cachedQ = useQuery({
    queryKey: qk.productsCached(deviceId),
    queryFn: () => getCachedProducts(deviceId),
    enabled: isValidDeviceId,
  });

  const autoQ = useQuery({
    queryKey: qk.autoUpdate(deviceId),
    queryFn: () => getAutoUpdate(deviceId),
    enabled: isValidDeviceId,
  });

  const fetchM = useMutation({
    mutationFn: () => fetchProducts(deviceId),
    onSuccess: async () => {
      await invalidateDeviceProducts(qc, deviceId);
      show("Товары выгружены", "success");
    },
    onError: (err) => {
      const { message } = extractErrorMessage(err);
      show(message || "Ошибка выгрузки", "error");
    },
  });

  const uploadM = useMutation({
    mutationFn: () => uploadCache(deviceId),
    onSuccess: async () => {
      await invalidateDeviceProducts(qc, deviceId);
      show("Товары загружены в весы", "success");
      flashSynced();
    },
    onError: (err) => {
      const { message } = extractErrorMessage(err);
      show(message || "Ошибка загрузки", "error");
    },
  });

  const patchM = useMutation({
    mutationFn: ({ plu, fields }) => patchProductByPlu(deviceId, plu, fields),
    onSuccess: async () => {
      await invalidateDeviceProducts(qc, deviceId);
      show("Товар обновлён (кэш)", "success");
    },
    onError: (err) => {
      const { message } = extractErrorMessage(err);
      show(message || "Ошибка обновления товара", "error");
    },
  });

  const autoM = useMutation({
    mutationFn: (payload) => setAutoUpdate(deviceId, payload),
    onSuccess: async () => {
      await invalidateDeviceAutoUpdate(qc, deviceId);
      show("Настройки автообновления сохранены", "success");
    },
    onError: (err) => {
      const { message } = extractErrorMessage(err);
      show(message || "Ошибка настройки автообновления", "error");
    },
  });

  const products = useMemo(() => {
    const raw = cachedQ.data?.products || {};
    return safeArray(raw.products);
  }, [cachedQ.data]);

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;

    return products.filter((p) => {
      const plu = getPlu(p);
      const pluStr = plu != null ? String(plu).toLowerCase() : "";
      const name = p?.name ? String(p.name).toLowerCase() : "";
      return pluStr.includes(q) || name.includes(q);
    });
  }, [products, query]);

  // ===== modal state =====
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({
    plu: "",
    name: "",
    price: "",
    shelfLife: "",
    manufactureDate: "",
    sellByDate: "",
  });

  const [editErrors, setEditErrors] = useState({
    manufactureDate: "",
    sellByDate: "",
  });

  function openEdit(p) {
    const plu = getPlu(p);
    const mfg = maskDDMMYY(p?.manufactureDate || "");
    const sell = maskDDMMYY(p?.sellByDate || "");

    setEdit({
      plu: plu ?? "",
      name: p?.name ?? "",
      price: p?.price ?? "",
      shelfLife: String(getShelfLifeDays(p) ?? ""),
      manufactureDate: mfg,
      sellByDate: sell,
    });

    setEditErrors({
      manufactureDate: dateErrorText(mfg),
      sellByDate: dateErrorText(sell),
    });

    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
  }

  function validateDatesOrStop() {
    const mfgErr = dateErrorText(edit.manufactureDate);
    const sellErr = dateErrorText(edit.sellByDate);

    if (mfgErr || sellErr) {
      setEditErrors({
        manufactureDate: mfgErr,
        sellByDate: sellErr,
      });
      show("Исправьте даты перед сохранением", "error");
      return false;
    }

    setEditErrors({ manufactureDate: "", sellByDate: "" });
    return true;
  }

  function saveEdit() {
    const pluNum = Number(edit.plu);
    if (!Number.isFinite(pluNum) || pluNum <= 0) {
      show("Некорректный PLU", "error");
      return;
    }

    if (!validateDatesOrStop()) return;

    patchM.mutate({
      plu: pluNum,
      fields: {
        name: String(edit.name),
        price: toNum(edit.price, 0),
        shelfLife: toNum(edit.shelfLife, 0),
        manufactureDate: String(edit.manufactureDate || ""),
        sellByDate: String(edit.sellByDate || ""),
      },
    });

    setEditOpen(false);
  }

  if (deviceQ.isLoading) return <div className="sub">Загрузка...</div>;
  if (deviceQ.isError)
    return (
      <div style={{ color: "#b42318" }}>
        {deviceQ.error?.response?.data?.detail || "Device error"}
      </div>
    );

  const device = deviceQ.data;

  return (
    <div className="stack">
      <div className="card solid">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            className="sub"
            style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
          >
            <span>
              {device.ip}:{device.port} · {device.protocol}
            </span>

            {syncedFlash ? (
              <span className="badge badge-success" title="Изменения применены на устройство">
                <span className="badge-dot badge-dot-success" />
                <span className="badge-text">Синхронизировано</span>
              </span>
            ) : device.cached_dirty ? (
              <span className="badge" title="В кэше есть изменения, которые ещё не применены на устройстве">
                <span className="badge-dot" />
                <span className="badge-text">Есть незагруженные изменения</span>
              </span>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => fetchM.mutate()}
              disabled={fetchM.isPending}
            >
              {fetchM.isPending ? "..." : "Выгрузить"}
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => uploadM.mutate()}
              disabled={uploadM.isPending}
            >
              {uploadM.isPending ? "..." : "Загрузить в весы"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Автообновление сроков годности</div>
        {autoQ.isLoading ? (
          <div className="sub">Загрузка...</div>
        ) : autoQ.isError ? (
          <div style={{ color: "#b42318" }}>
            {autoQ.error?.response?.data?.detail || "Ошибка автообновления"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            }}
          >
            <div className="field">
              <div className="label">Включено</div>

              <YesNoToggle
                value={!!autoQ.data.enabled}
                disabled={autoM.isPending}
                onChange={(enabled) => {
                  autoM.mutate({
                    enabled,
                    interval_minutes: normalizeIntervalMinutes(
                      autoQ.data.interval_minutes,
                      60
                    ),
                  });
                }}
              />
            </div>

            <div className="field">
              <div className="label">Интервал (мин)</div>
              <input
                className="input"
                type="number"
                value={autoQ.data.interval_minutes}
                onChange={(e) =>
                  autoM.mutate({
                    enabled: !!autoQ.data.enabled,
                    interval_minutes: normalizeIntervalMinutes(e.target.value, 60),
                  })
                }
              />
            </div>

            <div className="field">
              <div className="label">Последний запуск</div>
              <input
                className="input"
                value={utcToLocal(autoQ.data.last_run_utc)}
                readOnly
              />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="card-title" style={{ margin: 0 }}>
            Товары
          </div>

          <div style={{ minWidth: 280, flex: "1 1 320px" }}>
            <div className="label">Поиск (PLU /  Название)</div>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {cachedQ.isLoading ? (
            <div className="sub">Загрузка кэша...</div>
          ) : cachedQ.isError ? (
            <div style={{ color: "#b42318" }}>
              {cachedQ.error?.response?.data?.detail || "Ошибка кэша"}
            </div>
          ) : (
            <div className="products-grid">
              {filtered.length === 0 ? (
                <div className="sub">Нет товаров</div>
              ) : (
                filtered.map((p) => {
                  const plu = getPlu(p);
                  const status = computeStatus(p);

                  return (
                    <div
                      className="product-card"
                      key={String(plu ?? p?.id ?? p?.code ?? p?.name ?? Math.random())}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEdit(p);
                        }
                      }}
                    >
                      <div className="product-top">
                        <div>
                          <div className="product-title">
                            {p?.name || "(без названия)"}
                          </div>
                          <div className="product-subtitle">
                            <span className="pill pill-strong">
                              PLU: {plu ?? "—"}
                            </span>{" "}
                            <span className={`status-pill ${status.cls}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="kpi-row">
                        <div className="kpi">
                          <div className="kpi-label">Цена</div>
                          <div className="kpi-value">{toNum(p?.price, 0)}</div>
                        </div>
                        <div className="kpi">
                          <div className="kpi-label">Срок годности (дн)</div>
                          <div className="kpi-value">{getShelfLifeDays(p)}</div>
                        </div>
                      </div>

                      <div className="meta-row">
                        <div className="meta-item">
                          <div className="meta-key">Дата изготовления</div>
                          <div className="meta-val">
                            {fmtDate(maskDDMMYY(p?.manufactureDate || ""))}
                          </div>
                        </div>
                        <div className="meta-item">
                          <div className="meta-key">Годен до</div>
                          <div className="meta-val">
                            {fmtDate(maskDDMMYY(p?.sellByDate || ""))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={editOpen}
        title="Редактирование товара"
        subtitle={edit.plu ? `PLU: ${edit.plu}` : ""}
        onClose={closeEdit}
        footer={
          <>
            <button
              className="btn"
              type="button"
              onClick={closeEdit}
              disabled={patchM.isPending}
            >
              Отмена
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={saveEdit}
              disabled={patchM.isPending}
            >
              {patchM.isPending ? "..." : "Сохранить"}
            </button>
          </>
        }
      >
        <div className="form">
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <div className="field">
              <div className="label">Название</div>
              <input
                className="input"
                value={edit.name}
                onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="field">
              <div className="label">Цена</div>
              <input
                className="input"
                value={edit.price}
                onChange={(e) =>
                  setEdit((p) => ({ ...p, price: e.target.value }))
                }
                inputMode="numeric"
              />
            </div>

            <div className="field">
              <div className="label">Срок годности (дн)</div>
              <input
                className="input"
                value={edit.shelfLife}
                onChange={(e) =>
                  setEdit((p) => ({ ...p, shelfLife: e.target.value }))
                }
                inputMode="numeric"
              />
              {/* Пустая подсказка для визуального выравнивания с полем даты */}
              <div className="help" style={{ visibility: "hidden" }}>
                Введите 6 цифр — дефисы подставятся автоматически
              </div>
            </div>

            <div className="field">
              <div className="label">Дата изготовления (DD-MM-YY)</div>
              <input
                className={`input ${editErrors.manufactureDate ? "error" : ""}`}
                value={edit.manufactureDate}
                onChange={(e) => {
                  const v = maskDDMMYY(e.target.value);
                  setEdit((p) => ({ ...p, manufactureDate: v }));
                  setEditErrors((prev) => ({
                    ...prev,
                    manufactureDate: dateErrorText(v),
                  }));
                }}
                onBlur={() => {
                  const v = maskDDMMYY(edit.manufactureDate);
                  setEdit((p) => ({ ...p, manufactureDate: v }));
                  setEditErrors((prev) => ({
                    ...prev,
                    manufactureDate: dateErrorText(v),
                  }));
                }}
                placeholder="01-01-26"
                inputMode="numeric"
                pattern="\d{2}-\d{2}-\d{2}"
                maxLength={8}
              />
              {editErrors.manufactureDate ? (
                <div className="field-error">{editErrors.manufactureDate}</div>
              ) : (
                <div className="help">
                  Введите 6 цифр — дефисы подставятся автоматически
                </div>
              )}
            </div>

            <div className="field" style={{ gridColumn: "span 2" }}>
              <div className="label">Годен до (DD-MM-YY)</div>
              <input
                className={`input ${editErrors.sellByDate ? "error" : ""}`}
                value={edit.sellByDate}
                onChange={(e) => {
                  const v = maskDDMMYY(e.target.value);
                  setEdit((p) => ({ ...p, sellByDate: v }));
                  setEditErrors((prev) => ({
                    ...prev,
                    sellByDate: dateErrorText(v),
                  }));
                }}
                onBlur={() => {
                  const v = maskDDMMYY(edit.sellByDate);
                  setEdit((p) => ({ ...p, sellByDate: v }));
                  setEditErrors((prev) => ({
                    ...prev,
                    sellByDate: dateErrorText(v),
                  }));
                }}
                placeholder="08-01-26"
                inputMode="numeric"
                pattern="\d{2}-\d{2}-\d{2}"
                maxLength={8}
              />
              {editErrors.sellByDate ? (
                <div className="field-error">{editErrors.sellByDate}</div>
              ) : (
                <div className="help">
                  Введите 6 цифр — дефисы подставятся автоматически
                </div>
              )}
            </div>
          </div>

          <div className="sub">
            Изменения сохраняются в кэш. Чтобы применить их на устройство,
            нажмите “Загрузить в весы”.
          </div>
        </div>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "" })}
      />
    </div>
  );
}
