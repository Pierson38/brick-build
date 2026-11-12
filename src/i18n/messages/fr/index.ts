import { common } from './common';
import { app } from './app';
import { atelier } from './atelier';
import { workshop } from './workshop';
import { library } from './library';
import { domain } from './domain';
import { server } from './server';

/**
 * French catalog: the reference. Its shape is the `Messages` type that every other language must
 * implement exactly (a missing or extra key is a type error). Parameterised messages are functions.
 */
export const fr = { common, app, atelier, workshop, library, domain, server };
export type Messages = typeof fr;
