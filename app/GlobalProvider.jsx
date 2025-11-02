"use client";

import { ToastContainer } from "react-toastify";

// import { AuthProvider } from "@/context/AuthContext";
// import { CartProvider } from "@/context/CartContext";
// import { OrderProvider } from "@/context/OrderContext";

import "react-toastify/dist/ReactToastify.css";

export function GlobalProvider({ children }) {
  return (
    <>
      {/* <AuthProvider>
    <CartProvider>
    <OrderProvider> */}
      <ToastContainer position="bottom-right" />
      {children}
      {/* </OrderProvider>
      </CartProvider>
    </AuthProvider> */}
    </>
  );
}
