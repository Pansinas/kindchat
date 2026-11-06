/** Maps stable server error codes (RPC exception text / API codes) to user-facing copy. */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Please sign in again.",
  RATE_LIMITED: "You're doing that too often. Please wait a moment and try again.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a few minutes and try again.",
  INVALID_CREDENTIALS: "Incorrect username or password.",
  USERNAME_UNAVAILABLE: "That username isn't available.",
  USERNAME_INVALID: "Use 3–20 letters, numbers or underscores.",
  SELF_CONNECTION: "You can't connect with yourself.",
  NOT_AVAILABLE: "This person isn't available to connect.",
  ALREADY_PAIRED: "You're already connected with a partner.",
  PARTNER_UNAVAILABLE: "This person isn't available to connect.",
  REQUEST_ALREADY_SENT: "You've already sent a request to this person.",
  REQUEST_ALREADY_RECEIVED: "This person has already sent you a request. Accept it below.",
  TOO_MANY_PENDING_REQUESTS: "You have too many pending requests. Cancel one first.",
  REQUEST_NOT_FOUND: "This request is no longer available.",
  INVITATION_INVALID: "This invitation link is invalid or has expired.",
  CANNOT_ACCEPT_OWN_INVITATION: "This is your own invitation. Share it with your partner.",
  NOT_PAIRED: "You're not connected with a partner.",
  CONFIRMATION_MISMATCH: "The username you typed doesn't match.",
  NOT_A_MEMBER: "You no longer have access to this conversation.",
  MESSAGE_EMPTY: "Messages can't be empty.",
  MESSAGE_TOO_LONG: "Messages can be at most 5,000 characters.",
  INVALID_MESSAGE: "This message couldn't be sent.",
  INVALID_TARGET: "That action isn't possible.",
  INVALID_PASSWORD: "Your current password is incorrect.",
  WEAK_PASSWORD: "Please choose a stronger password.",
  TOKEN_INVALID: "This link is invalid or has expired.",
  EMAIL_NOT_CONFIGURED: "Email delivery isn't configured on this server yet.",
  VALIDATION_ERROR: "Please check the form and try again.",
  FORBIDDEN: "This request was blocked.",
  NETWORK: "You appear to be offline. Check your connection.",
};

export function errorCodeFrom(error: unknown): string {
  if (!error) return "UNKNOWN";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    if (typeof e.message === "string" && /^[A-Z_]+$/.test(e.message)) return e.message;
    if (typeof e.code === "string" && /^[A-Z_]+$/.test(e.code)) return e.code;
    if (typeof e.message === "string" && /fetch|network/i.test(e.message)) return "NETWORK";
  }
  return "UNKNOWN";
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = errorCodeFrom(error);
  // Validation messages from our own API are already user-facing.
  if ((code === "VALIDATION_ERROR" || code === "WEAK_PASSWORD") && typeof error === "object" && error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message && message !== code) return message;
  }
  return MESSAGES[code] ?? fallback;
}
