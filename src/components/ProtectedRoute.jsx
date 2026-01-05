import React from "react";
import { Navigate } from "react-router-dom";
import { isAuthed } from "../utils/token";

export function ProtectedRoute({ children }) {
  if (!isAuthed()) return <Navigate to="/auth" replace />;
  return children;
}
