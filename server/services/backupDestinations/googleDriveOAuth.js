// Raw REST OAuth2 helpers for Google Drive — no SDK. The panel is
// self-hosted with no fixed public domain, so the flow is: the admin
// registers an "OAuth client (Desktop app)" in Google Cloud Console (which
// permits the out-of-band redirect below), pastes the client id/secret in,
// opens the generated consent URL, and pastes the resulting code back.
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export function buildAuthUrl({ clientId, redirectUri }) {
  if (!clientId) throw new Error("A Google OAuth client id is required");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri || OOB_REDIRECT_URI,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postForm(params) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
    throw new Error(`Google token request failed: ${detail}`);
  }
  return body;
}

export async function exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri }) {
  if (!clientId || !clientSecret || !code) {
    throw new Error("clientId, clientSecret and code are all required");
  }
  const body = await postForm({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri || OOB_REDIRECT_URI,
  });
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("clientId, clientSecret and refreshToken are all required");
  }
  const body = await postForm({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
}
