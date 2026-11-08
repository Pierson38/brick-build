// Server-only. File names Windows refuses or silently changes: device names (`con`, `nul.ldr`, `com1.dat`
// open a device, not a file) and names ending with a dot or a space (stripped, so two different names
// would reach the same file). Checked on Windows only: these names are ordinary files elsewhere, and
// refusing them there could make an existing library unreadable.

const DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/** False when `name` (one path segment) is not safe to use as a file name on `platform`. */
export function isSafeOnPlatform(name: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'win32') return true;
  return !DEVICE_NAME.test(name) && !/[. ]$/.test(name);
}
