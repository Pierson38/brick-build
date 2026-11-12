import { cookies, headers } from 'next/headers';
import { CATALOGS, type Messages } from './catalogs';
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './locale';

/** Language of the page being rendered (server components, metadata): cookie, else Accept-Language. */
export async function getServerLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get('accept-language'));
}

export async function getServerMessages(): Promise<Messages> {
  return CATALOGS[await getServerLocale()];
}
