import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser, loginUser } from "../api/auth";
import { setToken } from "../utils/token";
import { Toast } from "../components/Toast";

/**
 * Проверка email на базовую валидность.
 * - Не используем тяжёлые зависимости.
 * - Достаточно для UI-валидации перед отправкой на backend.
 */
function isValidEmail(v) {
  const s = String(v || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Вычисление длины строки в байтах UTF-8.
 * Зачем:
 * - bcrypt имеет ограничение: максимум 72 байта (не символа).
 * - Если пользователь введёт длинный пароль (особенно с Unicode),
 *   то passlib/bcrypt может упасть или пароль будет «усечён».
 * Реализация:
 * - В современных браузерах используем TextEncoder().
 * - В fallback используем encodeURIComponent/unescape.
 */
function utf8ByteLen(str) {
  try {
    return new TextEncoder().encode(String(str || "")).length;
  } catch {
    return unescape(encodeURIComponent(String(str || ""))).length;
  }
}

/**
 * Валидация пароля.
 * Параметр mode:
 * - login: требования мягче (достаточно не пустого, но мы оставляем общие проверки).
 * - register: требования строже, чтобы снизить риск слабых паролей.
 *
 * Возвращает:
 * - пустую строку "" если всё ок
 * - строку с ошибкой, если проверка не прошла
 */
function validatePassword(pw, { mode }) {
  const p = String(pw || "");

  // Минимальная длина по символам (UI-правило)
  if (p.length < 8) return "Пароль должен быть не короче 8 символов";

  // Ограничение bcrypt по байтам
  const bytes = utf8ByteLen(p);
  if (bytes > 72) {
    return "Пароль слишком длинный. Сделайте пароль короче.";
  }

  if (/\s/.test(p)) return "Пароль не должен содержать пробелы";

  // Для регистрации: требуем «буквы + цифры»
  const hasLetter = /[A-Za-zА-Яа-я]/.test(p);
  const hasDigit = /\d/.test(p);
  if (mode === "register" && !(hasLetter && hasDigit)) {
    return "Пароль должен содержать буквы и цифры";
  }

  return "";
}

/**
 * Иконка «глаз» (показать/скрыть пароль).
 * Реализована как inline-SVG без внешних библиотек.
 * open=true  -> «открытый глаз»
 * open=false -> «зачёркнутый глаз»
 */
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

/**
 * Универсальный компонент поля пароля.
 * Зачем:
 * - В логине и регистрации одинаковое поведение (инпут, глаз, текст ошибки).
 * - Не дублировать JSX.
 *
 * Важные моменты:
 * - input type переключается text/password, чтобы показать/скрыть пароль
 * - кнопка "глаз" — отдельная кнопка, чтобы не мешать вводу
 * - error/help показываются ниже поля
 */
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

      {/* Контейнер для инпута с иконкой справа (см. .input-with-icon в CSS) */}
      <div className="input-with-icon">
        <input
          className={`input ${error ? "error" : ""}`}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />

        {/* Ненавязчивая кнопка внутри поля (иконка глаза) */}
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

      {/* Приоритет: ошибка > help > ничего */}
      {error ? (
        <div className="field-error">{error}</div>
      ) : help ? (
        <div className="help">{help}</div>
      ) : null}
    </div>
  );
}

/**
 * Главная страница авторизации/регистрации.
 * - mode = login|register переключает табы и набор полей
 * - при логине получаем access_token, сохраняем и редиректим на /devices
 * - при регистрации создаём пользователя и переводим в режим login
 */
export default function AuthPage() {
  const nav = useNavigate();

  // определяет какая форма активна
  const [mode, setMode] = useState("login");

  // значения формы
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  // состояние отображения паролей (глаз)
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  // уведомления об успехе/ошибке
  const [toast, setToast] = useState({ message: "", type: "info" });

  // loading — блокирует кнопку submit во время запроса
  const [loading, setLoading] = useState(false);

  // хелпер для показа сообщений
  function show(message, type = "info") {
    setToast({ message, type });
  }

  /**
   * Валидация email:
   * - useMemo чтобы не пересчитывать на каждый ререндер без изменений email
   */
  const emailErr = useMemo(() => {
    if (!email.trim()) return "Введите email";
    if (!isValidEmail(email)) return "Некорректный email";
    return "";
  }, [email]);

  /**
   * Валидация пароля:
   * - если пароль пустой -> просим ввести
   * - дальше применяем validatePassword()
   */
  const pwErr = useMemo(() => {
    if (!password) return "Введите пароль";
    return validatePassword(password, { mode });
  }, [password, mode]);

  /**
   * Валидация повторного пароля (только для register)
   */
  const pw2Err = useMemo(() => {
    if (mode !== "register") return "";
    if (!password2) return "Повторите пароль";
    if (password2 !== password) return "Пароли не совпадают";
    return "";
  }, [mode, password, password2]);

  /**
   * canSubmit: можно ли отправлять форму
   * - если есть ошибки email/password -> нельзя
   * - в режиме register дополнительно учитываем pw2Err
   */
  const canSubmit = useMemo(() => {
    if (emailErr || pwErr) return false;
    if (mode === "register" && pw2Err) return false;
    return true;
  }, [emailErr, pwErr, pw2Err, mode]);

  /**
   * Сабмит формы:
   * предотвращаем перезагрузку страницы
   * если форма невалидна -> показываем toast
   * register:
   *    - отправляем registerUser
   *    - успех: показываем toast, переключаем на login, чистим пароли
   * login:
   *    - отправляем loginUser
   *    - сохраняем access_token
   *    - редирект на /devices
   * обработка ошибок:
   *    - поддержка axios-like структуры err.response.data.detail
   */
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

        // Переводим пользователя в режим входа после успешной регистрации
        setMode("login");
        setPassword("");
        setPassword2("");
      } else {
        const data = await loginUser({ email: cleanEmail, password });

        // Сохраняем токен 
        setToken(data.access_token);

        // Переходим к списку устройств
        nav("/devices");
      }
    } catch (err) {
      // Пытаемся вытащить читаемое сообщение от backend
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string" ? detail : (err?.message || "Ошибка запроса");

      show(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  /**
   * JSX-разметка:
   * - auth-wrap центрирует карточку
   * - auth-card--light делает форму светлой
   * - tabs переключают login/register
   * - форма выводит email + password + (password2 если register)
   */
  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card--light">
        <h2 className="auth-title">
          {mode === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}
        </h2>

        {/* Табы переключают режим формы */}
        <div className="tabs auth-tabs">
          <button
            type="button"
            className={`tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              // при переходе в login сбрасываем повтор пароля
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

        {/* Основная форма */}
        <form onSubmit={onSubmit} className="form">
          {/* Email */}
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

          {/* Пароль */}
          <PasswordField
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Минимум 8 символов" : ""}
            error={pwErr}
            help={
              mode === "register" && !pwErr
                ? "Буквы и цифры. Максимум 72 символа. Без пробелов."
                : ""
            }
            show={showPw}
            onToggle={() => setShowPw((v) => !v)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {/* Повтор пароля — только при регистрации */}
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

          {/* Submit */}
          <button
            className="btn primary lg"
            disabled={loading || !canSubmit}
            type="submit"
          >
            {loading ? "..." : mode === "login" ? "Далее" : "Создать аккаунт"}
          </button>
        </form>
      </div>

      {/* Toast показывает ошибки/успехи.
          onClose очищает сообщение, чтобы скрыть toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "" })}
      />
    </div>
  );
}
