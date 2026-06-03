import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import App from "./App";
import "./styles.css";

function readRuntimeConfig() {
  return window.__APP_CONFIG__ || {};
}

const runtimeConfig = readRuntimeConfig();
const region = runtimeConfig.VITE_AWS_REGION || import.meta.env.VITE_AWS_REGION;
const userPoolId = runtimeConfig.VITE_COGNITO_USER_POOL_ID || import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = runtimeConfig.VITE_COGNITO_CLIENT_ID || import.meta.env.VITE_COGNITO_CLIENT_ID;
const redirectUri =
  runtimeConfig.VITE_COGNITO_REDIRECT_URI || import.meta.env.VITE_COGNITO_REDIRECT_URI || `${window.location.origin}/`;

const cognitoAuthConfig = {
  authority: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri:
    runtimeConfig.VITE_COGNITO_LOGOUT_URI || import.meta.env.VITE_COGNITO_LOGOUT_URI || `${window.location.origin}/`,
  response_type: "code",
  scope: "email openid profile",
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, redirectUri);
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
