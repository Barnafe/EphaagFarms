import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ActingAsProvider } from "./context/ActingAsContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ActingAsProvider>
          <App />
        </ActingAsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
