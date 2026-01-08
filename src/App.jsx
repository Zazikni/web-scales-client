import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

import AuthPage from "./auth/AuthPage";
import DevicesPage from "./devices/DevicesPage";
import DeviceDetailPage from "./devices/DeviceDetailPage";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthed } from "./utils/token";

export default function App() {
  const qc = useQueryClient();

  useEffect(() => {
    // Если пользователь считается не авториз 
    if (!isAuthed()) {
      // Очистка всех кешированных серверных данных
      qc.clear();
    }
  }, [qc]);
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/devices" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <DevicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices/:id"
          element={
            <ProtectedRoute>
              <DeviceDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </Layout>
  );
}
