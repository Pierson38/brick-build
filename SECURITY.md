# Security policy

## Supported versions

The project does not have a published release yet: only the `main` branch is maintained. Check that the problem still exists on the latest `main` commit before reporting it.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting: the repository's **Security** tab, then **Report a vulnerability** ([direct link](https://github.com/Pierson38/brick-lab-ldraw/security/advisories/new)).

If possible, include:

- the affected component (parser, import, personal library, local route, network access…);
- the steps to reproduce, with a file **written by you** if a file is involved (never an instruction booklet or a third-party set model);
- the concrete impact you observed;
- the commit you tested and your system.

The project is maintained in spare time: the goal is to acknowledge receipt within a week and keep you informed until the fix. You will be credited in the published advisory, unless you prefer to remain anonymous.

## Scope

Brick Lab Local is a **local** application: the server listens on `127.0.0.1` and reads files that the user imports themselves. Of particular interest are:

- **handling of untrusted files**: `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json`, library backups (exceeding size or depth limits, cycles, memory consumption, `../` paths, writing outside the data folder);
- **local routes** (`src/app/api/`): a web page from another origin, or a domain name that resolves to `127.0.0.1` (DNS rebinding), must not be able to read or modify the library (see `src/server/http/guard.ts`);
- **outgoing network access** (OMR, Rebrickable): bypassing the allowed-host list, the sizes or the timeouts (`src/server/net/safe-fetch.ts`), leaking the Rebrickable key, a request issued without a user action or despite `BRICK_LAB_ONLINE=0`.

Out of scope:

- a server deliberately exposed on the network (modified `-H` option, proxy, tunnel);
- a vulnerability in a dependency with no demonstrated impact on Brick Lab Local (report it to the relevant project instead);
- attacks that assume prior access to the user's account or files.
