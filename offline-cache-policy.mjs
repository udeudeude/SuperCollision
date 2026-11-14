// Experimental-only download policy; not wired into app network requests.
// iOS browsers cannot reliably disclose whether a connection is Wi-Fi.
export const CELLULAR_UNKNOWN_BUDGET_BYTES = 1_000_000;
export const SHELL_FILES = Object.freeze([
  './', './index.html', './instrument-layout.css', './instrument-layout.js',
  './app-icon.svg', './manifest.webmanifest'
]);

// Unknown resource lengths must be treated as unapproved, not zero bytes.
export function isLargeOrUnknown(bytes) {
  return !Number.isSafeInteger(bytes) || bytes < 0 ||
    bytes > CELLULAR_UNKNOWN_BUDGET_BYTES;
}

// The limit applies to the TOTAL unapproved download allowance, not each file.
// alreadyDownloadedBytes must include other same-session resource transfers.
// Explicit approval applies only to the requested resource.
export function canDownloadResource({
  bytes,
  alreadyDownloadedBytes = 0,
  explicitlyApproved = false,
  verifiedWifi = false
} = {}) {
  if (explicitlyApproved || verifiedWifi) return true;
  return Number.isSafeInteger(bytes) && bytes >= 0 &&
    Number.isSafeInteger(alreadyDownloadedBytes) && alreadyDownloadedBytes >= 0 &&
    alreadyDownloadedBytes <= CELLULAR_UNKNOWN_BUDGET_BYTES &&
    bytes <= CELLULAR_UNKNOWN_BUDGET_BYTES - alreadyDownloadedBytes;
}
