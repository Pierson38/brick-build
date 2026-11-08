import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Server-only. Durable writes: a reader sees the old file or the new one, never a partial one.

/**
 * Test seams: `beforeRename` interrupts a write between the temporary file and the rename; `link`
 * replaces fs.link (to simulate a volume without hard links).
 */
export const writeHooks: {
  beforeRename: ((tmp: string, target: string) => Promise<void>) | null;
  link: ((existing: string, target: string) => Promise<void>) | null;
} = { beforeRename: null, link: null };

/**
 * Windows: an antivirus, the search indexer or OneDrive may hold a file for a moment, and a rename
 * then fails with EPERM / EACCES / EBUSY. Elsewhere these codes are real errors: no retry.
 */
const BUSY_CODES: ReadonlySet<string> = new Set(process.platform === 'win32' ? ['EPERM', 'EACCES', 'EBUSY'] : []);
const BUSY_DELAYS_MS = [20, 50, 100, 200, 400, 800];

/** Runs `op`, retried after a short wait while it fails with one of `codes` (about 1.6 s in all). */
export async function retryBusy<T>(op: () => Promise<T>, codes: ReadonlySet<string> = BUSY_CODES, delaysMs: readonly number[] = BUSY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= delaysMs.length || code === undefined || !codes.has(code)) throw e;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/** fs.rename, retried while Windows reports the file as busy. */
export const renameRetry = (from: string, to: string) => retryBusy(() => fs.rename(from, to));

async function fsyncDir(dir: string): Promise<void> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch {
    // some filesystems refuse fsync on a directory: the rename itself stays atomic
  } finally {
    await handle?.close();
  }
}

export const tmpName = (target: string) => path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);

/** Writes `data` next to `target`, flushes it, then renames it over `target` (atomic on APFS/HFS+ and NTFS). */
export async function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = tmpName(target);
  const handle = await fs.open(tmp, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (writeHooks.beforeRename) await writeHooks.beforeRename(tmp, target);
    await renameRetry(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  await fsyncDir(path.dirname(target));
}

/**
 * Creates `target` only if it does not exist yet (no silent overwrite). False when it exists. `tmp`
 * is left in place. A hard link is atomic and exclusive; on a volume without hard links (FAT/exFAT,
 * some network shares) the file is copied next to `target` then renamed: still never partial, and
 * exclusive within this process (library writes are serialised by its Mutex).
 */
export async function linkNewFile(tmp: string, target: string): Promise<boolean> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await (writeHooks.link ?? fs.link)(tmp, target);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return false;
    // ENOENT: `tmp` is missing, a real error. Other codes: hard links refused (the code varies by OS and volume)
    if (code === 'ENOENT') throw e;
    return copyNewFile(tmp, target);
  }
  await fsyncDir(path.dirname(target));
  return true;
}

async function copyNewFile(tmp: string, target: string): Promise<boolean> {
  if (await fs.stat(target).then(() => true, () => false)) return false;
  const copy = tmpName(target);
  try {
    await fs.copyFile(tmp, copy, fs.constants.COPYFILE_EXCL);
    const handle = await fs.open(copy, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameRetry(copy, target);
  } catch (e) {
    await fs.rm(copy, { force: true });
    throw e;
  }
  await fsyncDir(path.dirname(target));
  return true;
}

/** Reads a JSON file of at most `maxBytes`. `null` when it does not exist; throws when unreadable. */
export async function readJson(file: string, maxBytes: number): Promise<unknown> {
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(file, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  try {
    const stat = await handle.stat();
    if (stat.size > maxBytes) throw new Error(`${path.basename(file)} dépasse ${Math.round(maxBytes / 1024)} Ko`);
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

/** Serialises async operations (one writer per process). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
