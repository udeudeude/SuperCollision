// Conservative offline resource policy. Not connected to the production app yet.
// Browsers on iOS do not reliably disclose whether a connection uses Wi-Fi.
export const CELLULAR_UNKNOWN_BUDGET_BYTES = 1_000_000;
export const SHELL_FILES = Object.freeze([
  './', './index.html', './instrument-layout.css', './instrument-layout.js',
  './app-icon.svg', './manifest.webmanifest'
]);
export function canDownloadResource({bytes, explicitlyApproved = false, verifiedWifi = false} = {}) {
  if (explicitlyApproved || verifiedWifi) return true;
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= CELLULAR_UNKNOWN_BUDGET_BYTES;
}
export function isLargeOrUnknown(bytes) {
  return !Number.isFinite(bytes) || bytes < 0 || bytes > CELLULAR_UNKNOWN_BUDGET_BYTES;
}
