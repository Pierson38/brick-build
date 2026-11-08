import { spawnSync } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSafeOnPlatform } from '@/infra/portable-name';
import { sanitizeSegments } from '@/infra/ldraw/library-path';
import { linkNewFile, retryBusy, writeHooks } from '@/server/library/fs-atomic';
import { defaultDataRoot, safeSegments } from '@/server/library/paths';

// Windows support without a Windows machine: platform rules are tested with an explicit platform,
// file-system fallbacks through the test seams of fs-atomic.

const repo = (rel: string) => path.join(__dirname, '..', '..', rel);
const errno = (code: string) => Object.assign(new Error(code), { code });

describe('file names on Windows', () => {
  it('refuses device names and names ending with a dot or a space', () => {
    for (const name of ['con', 'CON', 'nul.ldr', 'Aux.dat', 'com1.mpd', 'LPT9', 'model.', 'model ', 'notice.pdf.'])
      expect(isSafeOnPlatform(name, 'win32'), name).toBe(false);
  });

  it('accepts ordinary names, including ones that only start like a device name', () => {
    for (const name of ['3001.dat', 'console.mpd', 'nullable.ldr', 'com10.dat', 'lpt.pdf', '31040-1 Dune Buggy.mpd', '.hidden'])
      expect(isSafeOnPlatform(name, 'win32'), name).toBe(true);
  });

  it('changes nothing on macOS and Linux', () => {
    for (const platform of ['darwin', 'linux'] as const) expect(isSafeOnPlatform('nul.ldr', platform)).toBe(true);
  });

  it.runIf(process.platform !== 'win32')('leaves the path checks of this platform as they were', () => {
    expect(safeSegments('models/31040-1/con.mpd')).toEqual(['models', '31040-1', 'con.mpd']);
    expect(sanitizeSegments(['parts', 'nul.dat'])).toEqual(['parts', 'nul.dat']);
  });

  it.runIf(process.platform === 'win32')('refuses unsafe names in data paths and LDraw references', () => {
    expect(safeSegments('models/31040-1/con.mpd')).toBeNull();
    expect(safeSegments('models/31040-1./a.mpd')).toBeNull();
    expect(sanitizeSegments(['parts', 'nul.dat'])).toBeNull();
  });
});

describe('default data folder', () => {
  it('is ~/Documents/brick-lab-data on macOS and ~/brick-lab-data on Windows', () => {
    expect(defaultDataRoot('darwin')).toBe(path.join(homedir(), 'Documents', 'brick-lab-data'));
    expect(defaultDataRoot('win32')).toBe(path.join(homedir(), 'brick-lab-data'));
  });
});

describe('retryBusy', () => {
  const codes = new Set(['EBUSY']);
  const delays = [1, 1, 1];

  it('retries while the file is busy, then succeeds', async () => {
    let calls = 0;
    const result = await retryBusy(async () => {
      if (++calls < 3) throw errno('EBUSY');
      return 'ok';
    }, codes, delays);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the last delay with the original error', async () => {
    let calls = 0;
    await expect(retryBusy(async () => {
      calls++;
      throw errno('EBUSY');
    }, codes, delays)).rejects.toMatchObject({ code: 'EBUSY' });
    expect(calls).toBe(delays.length + 1);
  });

  it('does not retry another error', async () => {
    let calls = 0;
    await expect(retryBusy(async () => {
      calls++;
      throw errno('ENOSPC');
    }, codes, delays)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(calls).toBe(1);
  });
});

describe('linkNewFile on a volume without hard links', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-nolink-'));
    writeHooks.link = async () => {
      throw errno('ENOTSUP');
    };
  });
  afterEach(async () => {
    writeHooks.link = null;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('copies the file, keeps the temporary one and leaves no partial copy', async () => {
    const tmp = path.join(dir, 'upload.part');
    await fs.writeFile(tmp, 'blob');
    const target = path.join(dir, 'blobs', 'ab', 'abcd.mpd');
    expect(await linkNewFile(tmp, target)).toBe(true);
    expect(await fs.readFile(target, 'utf8')).toBe('blob');
    expect(existsSync(tmp)).toBe(true);
    expect((await fs.readdir(path.dirname(target))).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('never overwrites an existing file', async () => {
    const tmp = path.join(dir, 'upload.part');
    const target = path.join(dir, 'abcd.mpd');
    await fs.writeFile(tmp, 'new');
    await fs.writeFile(target, 'old');
    expect(await linkNewFile(tmp, target)).toBe(false);
    expect(await fs.readFile(target, 'utf8')).toBe('old');
  });

  it('still reports a missing temporary file', async () => {
    writeHooks.link = async () => {
      throw errno('ENOENT');
    };
    await expect(linkNewFile(path.join(dir, 'absent.part'), path.join(dir, 'x.mpd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('scripts/run-next.mjs', () => {
  it('starts the local Next.js with telemetry off and removes .next/dev on request', async () => {
    const cwd = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-run-next-'));
    try {
      mkdirSync(path.join(cwd, '.next', 'dev', 'cache'), { recursive: true });
      const run = spawnSync(process.execPath, [repo('scripts/run-next.mjs'), '--fresh-dev-cache', '--version'], { cwd, encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toMatch(/Next\.js v\d+/);
      expect(existsSync(path.join(cwd, '.next', 'dev'))).toBe(false);
      expect(existsSync(path.join(cwd, '.next'))).toBe(true);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
