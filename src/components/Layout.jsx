import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken, isAuthed } from "../utils/token";

export function Layout({ children }) {
  const nav = useNavigate();
  const location = useLocation();

  const authed = isAuthed();
  const isAuthPage = location.pathname.startsWith("/auth");

  function logout() {
    clearToken();
    nav("/auth");
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <Link to="/devices" className="brand">
            <span className="brand-dot" />
            Web Scales Manager
          </Link>

          <div className="header-actions">
            {authed ? (
              <button className="btn" onClick={logout} type="button">
                Выйти
              </button>
            ) : !isAuthPage ? (
              <Link to="/auth" className="btn">
                Вход
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
