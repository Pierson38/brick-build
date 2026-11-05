import { dataRoot } from './paths';
import { libraryStore } from './store';

/** The library of this server process (data folder from BRICK_LAB_DATA_DIR, read at each call). */
export const store = () => libraryStore(dataRoot());
