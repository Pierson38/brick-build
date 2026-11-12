/** Shell of the application: page titles, top bar, theme and language switches. */
export const app = {
  metaDescription: 'Reconstruction virtuelle locale de modèles LDraw. Non affilié à LEGO.',
  title: {
    collection: 'Ma collection',
    addSet: 'Ajouter un set',
    standaloneAtelier: 'Atelier sans collection',
    atelier: 'Atelier',
    setDetail: 'Détail du set',
  },
  brandLabel: 'Brick Lab Local — Ma collection',
  breadcrumb: 'Fil d’Ariane',
  standaloneAtelierCrumb: 'Atelier sans collection',
  theme: {
    system: 'Système',
    light: 'Clair',
    dark: 'Sombre',
    toggle: (current: string, next: string) => `Thème : ${current} (passer à ${next})`,
  },
  language: {
    toggle: (current: string, next: string) => `Langue : ${current} (passer à ${next})`,
  },
};
