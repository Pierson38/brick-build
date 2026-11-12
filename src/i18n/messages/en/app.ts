import type { Messages } from '../fr';

export const app: Messages['app'] = {
  metaDescription: 'Local virtual rebuilding of LDraw models. Not affiliated with LEGO.',
  title: {
    collection: 'My collection',
    addSet: 'Add a set',
    standaloneAtelier: 'Workshop without collection',
    atelier: 'Workshop',
    setDetail: 'Set details',
  },
  brandLabel: 'Brick Lab Local — My collection',
  breadcrumb: 'Breadcrumb',
  standaloneAtelierCrumb: 'Workshop without collection',
  theme: {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    toggle: (current: string, next: string) => `Theme: ${current} (switch to ${next})`,
  },
  language: {
    toggle: (current: string, next: string) => `Language: ${current} (switch to ${next})`,
  },
};
