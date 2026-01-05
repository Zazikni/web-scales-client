import React from "react";

export function Toast({ message, type = "info", onClose }) {
  if (!message) return null;

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-body">{message}</div>
      <button className="toast-close" onClick={onClose} type="button">
        ×
      </button>
    </div>
  );
}
