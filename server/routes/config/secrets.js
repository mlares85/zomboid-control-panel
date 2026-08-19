// Pattern-based secret masking, backed by the same SENSITIVE_FIELD_RE used
// for /api/servers responses (utils/sanitize.js) rather than a hardcoded
// key allowlist, so a newly added secret-shaped setting (jwtSecret,
// discordBotToken, ...) is masked automatically instead of leaking in
// plaintext until someone remembers to list it here.
import {
  SENSITIVE_FIELD_RE,
  isMaskedSecret,
  maskSensitiveObject,
} from "../../utils/sanitize.js";

export { SENSITIVE_FIELD_RE, isMaskedSecret };
export const maskSensitiveSettings = maskSensitiveObject;
