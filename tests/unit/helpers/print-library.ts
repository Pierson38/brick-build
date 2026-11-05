// Run in a separate Node process by library-store.test.ts: proves the library survives a restart.
import { LibraryStore } from '../../../src/server/library/store';

const v = await new LibraryStore(process.argv[2]!).view();
console.log(JSON.stringify(v.sets.map((s) => [s.setNumber, s.builds.map((b) => [b.label, b.snapshot.occurrenceCount, b.modes.join('+')])])));
