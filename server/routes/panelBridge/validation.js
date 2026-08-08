// Username validation for PanelBridge player endpoints.
// Allow normal in-game names (spaces/symbols) while blocking control chars and quote/backslash.
export const BRIDGE_USERNAME_REGEX = /^(?=.*\S)[^\x00-\x1F\x7F"\\]{1,64}$/;
