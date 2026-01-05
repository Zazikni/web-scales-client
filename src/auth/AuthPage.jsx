import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser, loginUser } from "../api/auth";
import { setToken } from "../utils/token";
import { Toast } from "../components/Toast";

function isValidEmail(v) {
  const s = String(v || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function utf8ByteLen(str) {
  try {
    return new TextEncoder().encode(String(str || "")).length;
  } catch {
    return unescape(encodeURIComponent(String(str || ""))).length;
  }
}

function validatePassword(pw, { mode }) {
  const p = String(pw || "");
  if (p.length < 8) return "Пароль должен быть не короче 8 символов";

  const bytes = utf8ByteLen(p);
  if (bytes > 72) {
    return "Пароль слишком длинный (bcrypt ограничен 72 байтами). Сделайте пароль короче.";
  }

  if (/\s/.test(p)) return "Пароль не должен содержать пробелы";

  const hasLetter = /[A-Za-zА-Яа-я]/.test(p);
  const hasDigit = /\d/.test(p);
  if (mode === "register" && !(hasLetter && hasDigit)) {
    return "Пароль должен содержать буквы и цифры";
  }
  return "";
}

function EyeIcon({ open }) {
  // простая SVG-иконка без зависимостей
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.7 4.1 11 7c-1.3 2.9-5.5 7-11 7S2.3 15.9 1 12c1.3-2.9 5.5-7 11-7Zm0 2C7.7 7 4.2 10 3.1 12C4.2 14 7.7 17 12 17s7.8-3 8.9-5C19.8 10 16.3 7 12 7Zm0 2.2A2.8 2.8 0 1 1 9.2 12A2.8 2.8 0 0 1 12 9.2Z"
      />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3-3C15.9 20 14 20.5 12 20.5 6.5 20.5 2.3 16.4 1 13.5c.6-1.4 1.8-3.1 3.5-4.6L2.1 3.5Zm4 7.4c-1.2 1.1-2 2.1-2.4 2.6C4.8 15.5 8 18.5 12 18.5c1.4 0 2.7-.3 3.9-.9l-1.8-1.8c-.6.4-1.3.6-2.1.6A3.4 3.4 0 0 1 8.6 13c0-.8.2-1.5.6-2.1l-3.1-3.1ZM12 6.5c5.5 0 9.7 4.1 11 7-.5 1.1-1.5 2.4-2.8 3.6l-1.5-1.5c.9-.9 1.5-1.7 1.8-2.1-1.1-2-4.6-5-8.5-5-1.1 0-2.1.2-3.1.5L7.3 7.4c1.5-.6 3.1-.9 4.7-.9Zm0 2.7A3.4 3.4 0 0 1 15.4 12c0 .3 0 .6-.1.9l-1.7-1.7V11A1.7 1.7 0 0 0 12 9.3c-.1 0-.2 0-.2 0L10 7.6c.6-.3 1.3-.4 2-.4Z"
      />
    </svg>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  error,
  help,
  show,
  onToggle,
  autoComplete,
}) {
  return (
    <div className="field">
      <div className="label">{label}</div>

      <div className="input-with-icon">
        <input
          className={`input ${error ? "error" : ""}`}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          title={show ? "Скрыть" : "Показать"}
        >
          <EyeIcon open={show} />
        </button>
      </div>

      {error ? <div className="field-error">{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}

export default function AuthPage() {
  const nav = useNavigate();

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [toast, setToast] = useState({ message: "", type: "info" });
  const [loading, setLoading] = useState(false);

  function show(message, type = "info") {
    setToast({ message, type });
  }

  const emailErr = useMemo(() => {
    if (!email.trim()) return "Введите email";
    if (!isValidEmail(email)) return "Некорректный email";
    return "";
  }, [email]);

  const pwErr = useMemo(() => {
    if (!password) return "Введите пароль";
    return validatePassword(password, { mode });
  }, [password, mode]);

  const pw2Err = useMemo(() => {
    if (mode !== "register") return "";
    if (!password2) return "Повторите пароль";
    if (password2 !== password) return "Пароли не совпадают";
    return "";
  }, [mode, password, password2]);

  const canSubmit = useMemo(() => {
    if (emailErr || pwErr) return false;
    if (mode === "register" && pw2Err) return false;
    return true;
  }, [emailErr, pwErr, pw2Err, mode]);

  async function onSubmit(e) {
    e.preventDefault();

    if (!canSubmit) {
      show("Проверьте поля формы", "error");
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();

      if (mode === "register") {
        await registerUser({ email: cleanEmail, password });
        show("Регистрация успешна. Теперь выполните вход.", "success");
        setMode("login");
        setPassword("");
        setPassword2("");
      } else {
        const data = await loginUser({ email: cleanEmail, password });
        setToken(data.access_token);
        nav("/devices");
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : (err?.message || "Ошибка запроса");
      show(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--light">
        <h2 className="auth-title">
          {mode === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}
        </h2>

        <div className="tabs auth-tabs">
          <button
            type="button"
            className={`tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setPassword2("");
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={`tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <div className="label">Email</div>
            <input
              className={`input ${emailErr ? "error" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              placeholder="example@mail.com"
            />
            {emailErr ? <div className="field-error">{emailErr}</div> : null}
          </div>

          <PasswordField
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Минимум 8 символов" : ""}
            error={pwErr}
            help={mode === "register" && !pwErr ? "Буквы + цифры. Максимум 72 байта. Без пробелов." : ""}
            show={showPw}
            onToggle={() => setShowPw((v) => !v)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {mode === "register" ? (
            <PasswordField
              label="Повтор пароля"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Повторите пароль"
              error={pw2Err}
              help=""
              show={showPw2}
              onToggle={() => setShowPw2((v) => !v)}
              autoComplete="new-password"
            />
          ) : null}

          <button className="btn primary lg" disabled={loading || !canSubmit} type="submit">
            {loading ? "..." : mode === "login" ? "Далее" : "Создать аккаунт"}
          </button>
        </form>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "" })} />
    </div>
  );
}
