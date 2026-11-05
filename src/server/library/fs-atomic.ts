import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Server-only. Durable writes: a reader sees the old file or the new one, never a partial one.

/** Test seam: lets a test interrupt a write between the temporary file and the rename. */
export const writeHooks: { beforeRename: ((tmp: string, target: string) => Promise<void>) | null } = { beforeRename: null };

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

/** Writes `data` next to `target`, flushes it, then renames it over `target` (atomic on APFS/HFS+). */
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
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  await fsyncDir(path.dirname(target));
}

/** Creates `target` only if it does not exist yet (no silent overwrite). False when it exists. */
export async function linkNewFile(tmp: string, target: string): Promise<boolean> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.link(tmp, target);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
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
