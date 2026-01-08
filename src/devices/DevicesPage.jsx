import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Toast } from "../components/Toast";
import { qk } from "../query/keys";
import { invalidateDevicesList } from "../query/invalidate";

// API-слой (axios через src/api/http.js)
import { listDevices, createDevice, deleteDevice } from "../api/devices";

/**
 * Валидируем IPv4.
 */
function isValidIp(ip) {
  const s = String(ip || "").trim();
  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  return ipv4.test(s);
}

/**
 * Привести port к целому числу.
 */
function parsePort(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

/**
 * Извлечь человекочитаемую ошибку из ответа axios/FastAPI.
 */
function extractErrorMessage(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return { status, message: detail.trim() };
  }

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
      // ignore
    }
  }

  if (detail && typeof detail === "object") {
    try {
      return { status, message: JSON.stringify(detail) };
    } catch {
      // ignore
    }
  }

  if (err?.message) return { status, message: String(err.message) };

  return { status, message: "Неизвестная ошибка" };
}

export default function DevicesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const devicesQ = useQuery({
    queryKey: qk.devices(),
    queryFn: listDevices,
  });

  // СОСТОЯНИЕ МОДАЛКИ
  const [modalOpen, setModalOpen] = useState(false);

  // СОСТОЯНИЕ ФОРМЫ
  // Пароль обязателен, по умолчанию "1234"
  const [form, setForm] = useState({
    name: "",
    description: "",
    ip: "",
    port: 1111,
    protocol: "TCP",
    password: "1234",
  });

  // Ошибки валидации формы
  const [errors, setErrors] = useState({
    name: "",
    ip: "",
    port: "",
    password: "",
  });

  function resetForm() {
    setForm({
      name: "",
      description: "",
      ip: "",
      port: 1111,
      protocol: "TCP",
      password: "1234",
    });
    setErrors({ name: "", ip: "", port: "", password: "" });
  }

  function openModal() {
    resetForm();
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  // ВАЛИДАЦИЯ ФОРМЫ
  function validate() {
    const e = { name: "", ip: "", port: "", password: "" };

    if (!String(form.name || "").trim()) e.name = "Укажите имя устройства";

    if (!String(form.ip || "").trim()) e.ip = "Укажите IP-адрес (IPv4)";
    else if (!isValidIp(form.ip)) e.ip = "Некорректный IPv4-адрес";

    const portNum = parsePort(form.port);
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
      e.port = "Порт должен быть в диапазоне 1..65535";
    }

    const pwd = String(form.password || "").trim();
    if (!pwd) e.password = "Пароль обязателен (по умолчанию 1234)";

    setErrors(e);
    return !e.name && !e.ip && !e.port && !e.password;
  }

  // СОЗДАНИЕ УСТРОЙСТВА
  const createM = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("validation");

      const name = String(form.name || "").trim();
      const ip = String(form.ip || "").trim();
      const port = parsePort(form.port);
      const protocol = String(form.protocol || "TCP");
      const password = String(form.password || "").trim();


      // backend ожидает строку для description. Если поле пустое — НЕ отправляем его вообще.
      const descriptionTrimmed = String(form.description || "").trim();

      const payload = {
        name,
        ip,
        port,
        protocol,
        password,
        description: descriptionTrimmed ? descriptionTrimmed : undefined,
      };

      if (!Number.isFinite(payload.port)) throw new Error("validation");
      if (!payload.password) throw new Error("validation");

      return createDevice(payload);
    },
    onSuccess: async () => {
      await invalidateDevicesList(qc);
      show("Устройство добавлено", "success");
      closeModal();
    },
    onError: (err) => {
      if (err?.message === "validation") return;

      const { status, message } = extractErrorMessage(err);

      if (status === 401) {
        show("Сессия истекла. Войдите снова.", "error");
        navigate("/auth", { replace: true });
        return;
      }

      if (status === 422) {
        show(message || "Ошибка валидации данных", "error");
        return;
      }

      show(message || "Ошибка добавления устройства", "error");
    },
  });

  // УДАЛЕНИЕ УСТРОЙСТВА
  const deleteM = useMutation({
    mutationFn: (deviceId) => deleteDevice(deviceId),
    onSuccess: async () => {
      await invalidateDevicesList(qc);
      show("Устройство удалено", "success");
    },
    onError: (err) => {
      const { status, message } = extractErrorMessage(err);

      if (status === 401) {
        show("Сессия истекла. Войдите снова.", "error");
        navigate("/auth", { replace: true });
        return;
      }

      show(message || "Ошибка удаления", "error");
    },
  });

  // НОРМАЛИЗАЦИЯ ДАННЫХ
  const devices = useMemo(() => {
    if (Array.isArray(devicesQ.data)) return devicesQ.data;
    if (Array.isArray(devicesQ.data?.devices)) return devicesQ.data.devices;
    return [];
  }, [devicesQ.data]);

  return (
    <div className="stack">
      <div className="card solid">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="h2">Мои устройства</div>
            <div className="sub">Устройства доступны только владельцу аккаунта</div>
          </div>

          <button className="btn primary" type="button" onClick={openModal}>
            Добавить устройство
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Список устройств</div>

        {devicesQ.isLoading ? (
          <div className="sub">Загрузка...</div>
        ) : devicesQ.isError ? (
          <div style={{ color: "#b42318" }}>
            {devicesQ.error?.message || "Ошибка загрузки устройств"}
          </div>
        ) : devices.length === 0 ? (
          <div className="sub">Устройств пока нет. Нажмите “Добавить устройство”.</div>
        ) : (
          <div className="devices-grid">
            {devices.map((d) => (
              <div
                key={String(d.id)}
                className="device-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/devices/${d.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/devices/${d.id}`);
                }}
              >
                <div className="device-card-top">
                  <div className="device-title">{d.name || `Device #${d.id}`}</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {d.cached_dirty ? (
                      <span className="badge" title="В кэше есть изменения">
                        <span className="badge-dot" />
                        <span className="badge-text">Есть изменения</span>
                      </span>
                    ) : null}

                    <button
                      className="btn-danger"
                      type="button"
                      title="Удалить устройство"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const ok = window.confirm(
                          `Удалить устройство "${d.name || d.id}"?`
                        );
                        if (!ok) return;

                        deleteM.mutate(Number(d.id));
                      }}
                      disabled={deleteM.isPending}
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <div className="sub">
                  {d.ip}:{d.port} · {d.protocol || "TCP"}
                </div>

                {d.description ? (
                  <div className="sub" style={{ marginTop: 8 }}>
                    {d.description}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title="Добавить устройство"
        subtitle=""
        onClose={closeModal}
        footer={
          <>
            <button className="btn" type="button" onClick={closeModal} disabled={createM.isPending}>
              Отмена
            </button>
            <button className="btn primary" type="button" onClick={() => createM.mutate()} disabled={createM.isPending}>
              {createM.isPending ? "..." : "Добавить"}
            </button>
          </>
        }
      >
        <div className="modal-form">
          <div className="field">
            <div className="label">Имя</div>
            <input
              className={`input ${errors.name ? "error" : ""}`}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />
            {errors.name ? <div className="field-error">{errors.name}</div> : null}
          </div>

          <div className="field">
            <div className="label">Описание</div>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <div className="help">Можно оставить пустым — поле не будет отправлено на backend.</div>
          </div>

          <div className="modal-grid-3">
            <div className="field">
              <div className="label">IP</div>
              <input
                className={`input ${errors.ip ? "error" : ""}`}
                value={form.ip}
                onChange={(e) => setForm((p) => ({ ...p, ip: e.target.value }))}
                placeholder="10.35.150.14"
              />
              {errors.ip ? <div className="field-error">{errors.ip}</div> : null}
            </div>

            <div className="field">
              <div className="label">Port</div>
              <input
                className={`input ${errors.port ? "error" : ""}`}
                type="number"
                value={form.port}
                onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
                placeholder="1111"
              />
              {errors.port ? <div className="field-error">{errors.port}</div> : null}
            </div>

            <div className="field">
              <div className="label">Protocol</div>
              <select
                className="select"
                value={form.protocol}
                onChange={(e) => setForm((p) => ({ ...p, protocol: e.target.value }))}
              >
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
              </select>
            </div>
          </div>

          <div className="field">
            <div className="label">Пароль</div>
            <input
              className={`input ${errors.password ? "error" : ""}`}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              type="password"
              placeholder="1234"
              autoComplete="new-password"
            />
            {errors.password ? (
              <div className="field-error">{errors.password}</div>
            ) : (
              <div className="help">Пароль обязателен. По умолчанию: 1234</div>
            )}
          </div>

          <div className="sub" style={{ marginTop: 6 }}>
            Устройство будет доступно только вашему аккаунту.
          </div>
        </div>
      </Modal>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "" })} />
    </div>
  );
}
