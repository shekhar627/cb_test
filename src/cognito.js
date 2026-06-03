export async function buildPkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function createCodeVerifier(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, (value) => charset[value % charset.length]).join("");
}

export function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function parseJwt(token) {
  if (!token) {
    return null;
  }

  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
  return JSON.parse(json);
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
}

function textEncoder() {
  return new TextEncoder();
}

function parseJwtSegments(token) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Malformed JWT.");
  }

  return {
    header: JSON.parse(decodeBase64Url(encodedHeader)),
    payload: JSON.parse(decodeBase64Url(encodedPayload)),
    signature: encodedSignature,
    signingInput: `${encodedHeader}.${encodedPayload}`,
  };
}

function base64UrlToUint8Array(value) {
  const binary = decodeBase64Url(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importJwkForVerify(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );
}

async function verifyJwtSignature(token, jwk) {
  const { signingInput, signature } = parseJwtSegments(token);
  const key = await importJwkForVerify(jwk);

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToUint8Array(signature),
    textEncoder().encode(signingInput),
  );
}

function readRuntimeConfig() {
  return window.__APP_CONFIG__ || {};
}

export function readAuthConfig() {
  const runtimeConfig = readRuntimeConfig();

  return {
    region: runtimeConfig.VITE_AWS_REGION || import.meta.env.VITE_AWS_REGION,
    userPoolId: runtimeConfig.VITE_COGNITO_USER_POOL_ID || import.meta.env.VITE_COGNITO_USER_POOL_ID,
    domain: runtimeConfig.VITE_COGNITO_DOMAIN || import.meta.env.VITE_COGNITO_DOMAIN,
    clientId: runtimeConfig.VITE_COGNITO_CLIENT_ID || import.meta.env.VITE_COGNITO_CLIENT_ID,
    redirectUri:
      runtimeConfig.VITE_COGNITO_REDIRECT_URI ||
      import.meta.env.VITE_COGNITO_REDIRECT_URI ||
      `${window.location.origin}/`,
    logoutUri:
      runtimeConfig.VITE_COGNITO_LOGOUT_URI ||
      import.meta.env.VITE_COGNITO_LOGOUT_URI ||
      `${window.location.origin}/`,
  };
}

export function isAuthConfigured(config) {
  return Boolean(config.region && config.userPoolId && config.domain && config.clientId && config.redirectUri && config.logoutUri);
}

export async function startLogin(config) {
  const verifier = createCodeVerifier();
  const challenge = await buildPkceChallenge(verifier);
  const state = crypto.randomUUID();

  sessionStorage.setItem("cb_pkce_verifier", verifier);
  sessionStorage.setItem("cb_auth_state", state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: config.redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.assign(`https://${config.domain}/login?${params.toString()}`);
}

export async function exchangeCodeForToken(config, code) {
  const verifier = sessionStorage.getItem("cb_pkce_verifier");
  if (!verifier) {
    throw new Error("Missing PKCE verifier in session storage.");
  }

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Token exchange failed.");
  }

  sessionStorage.removeItem("cb_pkce_verifier");
  sessionStorage.removeItem("cb_auth_state");
  return payload;
}

export function logout(config) {
  localStorage.removeItem("cb_auth_tokens");
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  window.location.assign(`https://${config.domain}/logout?${params.toString()}`);
}

export async function validateAccessTokenWithCognito({ token, region, userPoolId, clientId }) {
  if (!token) {
    throw new Error("Missing access token.");
  }

  if (!region || !userPoolId || !clientId) {
    throw new Error("Missing Cognito configuration for validation.");
  }

  const { header, payload } = parseJwtSegments(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);

  if (!response.ok) {
    throw new Error("Unable to load Cognito JWKS.");
  }

  const { keys } = await response.json();
  const jwk = keys?.find((item) => item.kid === header.kid);

  if (!jwk) {
    throw new Error("Signing key not found in Cognito JWKS.");
  }

  const isSignatureValid = await verifyJwtSignature(token, jwk);
  if (!isSignatureValid) {
    throw new Error("JWT signature validation failed.");
  }

  if (payload.iss !== issuer) {
    throw new Error("Token issuer does not match Cognito user pool.");
  }

  if (payload.token_use !== "access") {
    throw new Error("Token is not an access token.");
  }

  if (payload.client_id !== clientId) {
    throw new Error("Token client_id does not match the configured app client.");
  }

  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    throw new Error("Token is expired.");
  }

  return {
    valid: true,
    subject: payload.sub,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
