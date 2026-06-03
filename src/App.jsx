import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { readAuthConfig, validateAccessTokenWithCognito } from "./cognito";

function readRuntimeConfig() {
  return window.__APP_CONFIG__ || {};
}

function readCurrentPath() {
  return window.location.pathname || "/";
}

function App() {
  const auth = useAuth();
  const runtimeConfig = readRuntimeConfig();
  const authConfig = readAuthConfig();
  const cognitoDomain =
    runtimeConfig.VITE_COGNITO_DOMAIN || import.meta.env.VITE_COGNITO_DOMAIN || "";
  const clientId =
    runtimeConfig.VITE_COGNITO_CLIENT_ID || import.meta.env.VITE_COGNITO_CLIENT_ID || "";
  const logoutUri =
    runtimeConfig.VITE_COGNITO_LOGOUT_URI ||
    import.meta.env.VITE_COGNITO_LOGOUT_URI ||
    `${window.location.origin}/`;
  const [currentPath, setCurrentPath] = useState(readCurrentPath);
  const [tokenInput, setTokenInput] = useState("");
  const [accessTokenStatus, setAccessTokenStatus] = useState({
    type: "idle",
    message: "Not validated",
  });
  const [isValidatingAccessToken, setIsValidatingAccessToken] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(readCurrentPath());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  const signOutRedirect = () => {
    auth.removeUser();

    const params = new URLSearchParams({
      client_id: clientId,
      logout_uri: logoutUri,
    });

    window.location.href = `https://${cognitoDomain}/logout?${params.toString()}`;
  };

  const handleValidateAccessToken = async () => {
    const trimmedToken = tokenInput.trim();

    if (!trimmedToken) {
      setAccessTokenStatus({
        type: "error",
        message: "Paste an access token first",
      });
      return;
    }

    setIsValidatingAccessToken(true);
    setAccessTokenStatus({
      type: "pending",
      message: "Validating...",
    });

    try {
      const result = await validateAccessTokenWithCognito({
        token: trimmedToken,
        region: authConfig.region,
        userPoolId: authConfig.userPoolId,
        clientId: authConfig.clientId,
      });

      setAccessTokenStatus({
        type: "success",
        message: `Valid until ${new Date(result.expiresAt).toLocaleString()}`,
      });
    } catch (error) {
      setAccessTokenStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Validation failed",
      });
    } finally {
      setIsValidatingAccessToken(false);
    }
  };

  if (auth.isLoading) {
    return (
      <main className="shell">
        <section className="hero">
          <p className="notice warning">Loading Cognito session...</p>
        </section>
      </main>
    );
  }

  if (auth.error) {
    return (
      <main className="shell">
        <section className="hero">
          <p className="notice error">Encountering error... {auth.error.message}</p>
          <button className="primary" onClick={() => auth.signinRedirect()}>
            Try sign in again
          </button>
        </section>
      </main>
    );
  }

  if (auth.isAuthenticated) {
    const idToken = auth.user?.id_token || "";
    const accessToken = auth.user?.access_token || "";
    const refreshToken = auth.user?.refresh_token || "";

    if (currentPath === "/validate-token") {
      return (
        <main className="shell">
          <section className="hero">
            <p className="eyebrow">Clinic Board</p>
            <h1>Validate access token.</h1>
            <p className="lede">
              Paste a Cognito access token below and check whether it is valid for this user pool and app client.
            </p>
            <div className="actions page-actions">
              <button className="primary secondary-action" type="button" onClick={() => navigateTo("/")}>
                Back to profile
              </button>
              <button className="primary" type="button" onClick={handleValidateAccessToken} disabled={isValidatingAccessToken}>
                {isValidatingAccessToken ? "Validating..." : "Validate"}
              </button>
            </div>
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>Access Token Validator</h2>
              <label className="field-label" htmlFor="access-token-input">
                Paste access token
              </label>
              <textarea
                id="access-token-input"
                className="token-input"
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  if (accessTokenStatus.type !== "idle") {
                    setAccessTokenStatus({
                      type: "idle",
                      message: "Not validated",
                    });
                  }
                }}
                placeholder="Paste Cognito access token here"
                spellCheck="false"
              />
              <div className="token-action-row">
                <span className={`status-chip status-${accessTokenStatus.type}`}>{accessTokenStatus.message}</span>
              </div>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Clinic Board</p>
          <h1>React demo app running on ECS Fargate with Cognito login.</h1>
          <p className="lede">You are signed in with Cognito Hosted UI.</p>
          <div className="actions">
            <button className="primary" onClick={signOutRedirect}>
              Sign out
            </button>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Profile</h2>
            <p>
              Hello: <strong>{auth.user?.profile?.email || auth.user?.profile?.preferred_username || "User"}</strong>
            </p>
            <p>
              ID Token: <strong>{idToken ? "Present" : "Missing"}</strong>
            </p>
            {idToken ? <pre className="token-block">{idToken}</pre> : null}
            <p>
              Access Token: <strong>{accessToken ? "Present" : "Missing"}</strong>
            </p>
            <button
              className="primary secondary-action"
              type="button"
              onClick={() => {
                setTokenInput("");
                setAccessTokenStatus({
                  type: "idle",
                  message: "Not validated",
                });
                navigateTo("/validate-token");
              }}
              disabled={!accessToken}
            >
              Validate access token
            </button>
            {accessToken ? <pre className="token-block">{accessToken}</pre> : null}
            <p>
              Refresh Token: <strong>{refreshToken ? "Present" : "Missing"}</strong>
            </p>
            {refreshToken ? <pre className="token-block">{refreshToken}</pre> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Clinic Board</p>
        <h1>React demo app running on ECS Fargate with Cognito login.</h1>
        <p className="lede">
          This frontend is built with React, deployed as a container, and ready to authenticate users through Amazon Cognito Hosted UI.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => auth.signinRedirect()}>
            Sign in with Cognito
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
