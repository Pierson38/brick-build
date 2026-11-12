import type { Locale } from './locale';
import { fr, type Messages } from './messages/fr';
import { en } from './messages/en';

export const CATALOGS: Record<Locale, Messages> = { fr, en };
export type { Messages };
