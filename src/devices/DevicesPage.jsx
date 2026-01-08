import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Toast } from "../components/Toast";

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
    // Собраем короткое сообщение из ошибок валидации
    const parts = detail
      .map((x) => {
        const loc = Array.isArray(x?.loc) ? x.loc.join(".") : "";
        const msg = x?.msg ? String(x.msg) : "";
        if (loc && msg) return `${loc}: ${msg}`;
        return msg || JSON.stringify(x);
      })
      .filter(Boolean);

    if (parts.length) return { status, message: parts.join("; ") };
  }

  if (detail && typeof detail === "object") {
    try {
      return { status, message: JSON.stringify(detail) };
    } catch {
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
    setToast({ message, type });
  }

  const devicesQ = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });
  // СОСТОЯНИЕ МОДАЛКИ 
  const [modalOpen, setModalOpen] = useState(false);
  // СОСТОЯНИЕ  ФОРМЫ
  const [form, setForm] = useState({
    name: "",
    description: "",
    ip: "",
    port: 1111,
    protocol: "TCP",
    password: "",
  });
  // Ошибки валидации формы
  const [errors, setErrors] = useState({
    name: "",
    ip: "",
    port: "",
  });

  // Сброс формы к значениям по умолчанию.

  function resetForm() {
    setForm({
      name: "",
      description: "",
      ip: "",
      port: 1111,
      protocol: "TCP",
      password: "",
    });
    setErrors({ name: "", ip: "", port: "" });
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
    const e = { name: "", ip: "", port: "" };

    if (!String(form.name || "").trim()) e.name = "Укажите имя устройства";

    if (!String(form.ip || "").trim()) e.ip = "Укажите IP-адрес (IPv4)";
    else if (!isValidIp(form.ip)) e.ip = "Некорректный IPv4-адрес";

    const portNum = parsePort(form.port);
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
      e.port = "Порт должен быть в диапазоне 1..65535";
    }

    setErrors(e);
    return !e.name && !e.ip && !e.port;
  }
  // СОЗДАНИЕ УСТРОЙСТВА
  const createM = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("validation");
      // Приводим payload к виду, ожидаемому backend
      const payload = {
        name: String(form.name || "").trim(),
        description: String(form.description || "").trim() || null,
        ip: String(form.ip || "").trim(),
        port: parsePort(form.port),
        protocol: String(form.protocol || "TCP"),
        password: String(form.password || "").trim() || null,
      };

      // Защита
      if (!Number.isFinite(payload.port)) {
        throw new Error("validation");
      }

      return createDevice(payload);
    },
    onSuccess: async () => {
      // Инвалидируем список — UI всегда синхронизируется с backend
      await qc.invalidateQueries({ queryKey: ["devices"] });
      show("Устройство добавлено", "success");
      closeModal();
    },
    onError: (err) => {
      if (err?.message === "validation") return;

      const { status, message } = extractErrorMessage(err);

      // 401: токен недействителен/истёк — уходим на авторизацию
      if (status === 401) {
        show("Сессия истекла. Войдите снова.", "error");
        navigate("/auth", { replace: true });
        return;
      }

      // 422: ошибка валидации на backend — покажем detail
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
      await qc.invalidateQueries({ queryKey: ["devices"] });
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
            <button
              className="btn"
              type="button"
              onClick={closeModal}
              disabled={createM.isPending}
            >
              Отмена
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => createM.mutate()}
              disabled={createM.isPending}
            >
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
              className="input"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              type="password"
            />
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
