"use client";

import { ToastContainer } from "react-toastify";

export function ToastProvider() {
  return (
    <ToastContainer
      position="bottom-right"
      theme="dark"
      autoClose={3500}
      style={{ zIndex: 999999 }}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable
      pauseOnHover
    />
  );
}
