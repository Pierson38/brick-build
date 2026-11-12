/** Namespace `atelier` — see src/i18n/README.md. Reference language: French. */
export const atelier = {
  /** Build modes: names (mode switch, dialogs), scene hints, why a mode is unavailable. */
  mode: {
    label: { guided: 'Guidé (étapes LDraw)', synced: 'Notice synchronisée', freeManual: 'Montage libre' },
    hint: {
      guided: 'Mode guidé : les emplacements de l’étape apparaissent en bleu.',
      freeManual: 'Montage libre : prends une pièce et pose-la où tu veux, la notice reste consultable. Clic sur une pièce posée : la reprendre.',
      synced: 'Notice synchronisée : la page de l’étape s’affiche, seules ses pièces sont proposées.',
    },
    syncUnavailable: 'aucune correspondance notice ↔ 3D validée.',
    guidedUnavailable: 'étapes LDraw inutilisables.',
    noSteps: 'Étapes non disponibles dans ce fichier : aucune séquence n’est inventée.',
  },
  /** State of the local LDraw part library. */
  ldraw: {
    notConfigured: 'Bibliothèque LDraw non configurée.',
    unreachable: 'Serveur local injoignable.',
  },
  busy: {
    analyzing: 'Analyse du modèle…',
    loadingGeometry: 'Chargement des géométries LDraw locales…',
    loadingModel: 'Chargement du modèle…',
  },
  /** Free mode: why a pose is refused. */
  freeFailure: {
    NOT_FREE_MODE: 'Pose libre possible seulement en montage libre.',
    NO_STOCK: 'Plus de pièce de ce type dans le stock du set.',
    UNKNOWN_PIECE: 'Cette pièce n’est plus dans la construction.',
    INVALID_POSE: 'Position impossible à enregistrer.',
  },
  /** Why the pieces magnet proposes nothing. */
  snapMiss: {
    NO_CONNECTOR: 'aimant : aucune connexion reconnue sur cette pièce (pose libre, Maj + clic pour l’assembler)',
    AXES: 'aimant : connexion compatible tout près, mais axes non alignés — tourne la pièce (X / Y / Z)',
    OCCUPIED: 'aimant : les connecteurs alignés tout près sont déjà occupés',
  },
  /** "4 tenon(s) emboîté(s)"… from the kind of the connections (null: several kinds). */
  connections: (pairs: number, kind: string | null) =>
    `${pairs} ${kind === 'stud' ? 'tenon(s) emboîté(s)' : kind === 'pin' ? 'goupille(s) emboîtée(s)' : kind === 'axle' ? 'axe(s) engagé(s)' : 'connexion(s) emboîtée(s)'}`,
  /** Free mode, stock used up. */
  freeEnd: (atModel: number, total: number) => (atModel >= total
    ? `Toutes les pièces sont posées à leur place dans le modèle : modèle reconstruit (${total}/${total}).`
    : `Toutes les pièces du set sont posées (${total}/${total}). Montage libre : ta construction n’est pas comparée au modèle officiel — ${atModel} pièce(s) à leur place dans le modèle.`),
  /** Results shown in the toast. */
  toast: {
    restored: (used: number, total: number, free: number) =>
      `Progression restaurée : ${used}/${total} pièces posées${free > 0 ? `, dont ${free} posée(s) librement` : ''}.`,
    restoredSyncFallback: 'Partie en mode notice synchronisée, mais aucune correspondance valide pour ce fichier : reprise en montage libre. Réimporte ton fichier de correspondances pour revenir au mode synchronisé.',
    restoredMappingChanged: 'Les correspondances ont changé depuis la sauvegarde : l’étape en cours est recalculée à partir des pièces posées.',
    storedMappingUnreadable: (errors: string) => `Correspondances enregistrées illisibles, ignorées : ${errors}`,
    fileTooLarge: (megabytes: number) => `Fichier trop volumineux (limite ${megabytes} Mo).`,
    badFormat: 'Formats acceptés : .ldr et .mpd (pas .io ni .lxf).',
    mappingNotSavedLibrary: 'Correspondances non enregistrées dans la bibliothèque (voir l’état en haut).',
    mappingNotSavedLocal: 'Sauvegarde locale des correspondances impossible (stockage plein ou indisponible).',
    syncFallback: 'Correspondances absentes ou invalides : la partie continue en montage libre (pièces posées conservées).',
    recognisedOnSwitch: (recognised: number, dropped: number) =>
      `${recognised} pièce(s) posée(s) librement reconnue(s) à leur place dans le modèle${dropped > 0 ? `, ${dropped} remise(s) dans le stock` : ''}.`,
    assemblyAdded: (count: number, selected: number) =>
      `Assemblage ajouté (${count} pièces) : ${selected} pièces sélectionnées en tout. Maj + double-clic sur un autre pour l’ajouter aussi.`,
    assemblyAddedAlone: (selected: number) => `Aucune autre pièce reliée à celle-ci : ajoutée seule, ${selected} pièces sélectionnées en tout.`,
    assemblySelected: (count: number) =>
      `Assemblage sélectionné : ${count} pièces reliées par des connexions reconnues (tenons, goupilles, axes), visibles ou cachées. Glisse-le ou « Déplacer la sélection ».`,
    assemblyNone: 'Aucune autre pièce reliée par une connexion reconnue : ajoute-les avec Maj + clic (clips, barres, charnières… ne sont pas reconnus).',
    removed: (n: number) => (n === 1 ? 'Pièce remise dans le stock.' : `${n} pièces remises dans le stock.`),
    rotateFailed: (reason: string) => `Rotation impossible : ${reason}`,
    /** `sign`: "+" or "−". */
    rotated: (n: number, axis: string, sign: string, degrees: number) =>
      `${n > 1 ? `${n} pièces tournées` : 'Pièce tournée'} sur place (${axis} ${sign}${degrees}°).`,
    groupLeft: 'Groupe laissé où il était.',
    pieceLeft: 'Pièce laissée où elle était.',
    moved: (atModel: boolean) => `Pièce déplacée${atModel ? ' à sa place dans le modèle' : ' librement'}.`,
    placedFree: (atModel: boolean, used: number, total: number) =>
      `Pièce posée${atModel ? ' à sa place dans le modèle' : ' librement'} (${used}/${total}).`,
    complete: 'Bravo, modèle terminé !',
    stepFallback: 'Étape',
    stepDone: (step: string, next: string, page: number) => `${step} terminée ! Suivante : ${next}, p. ${page}.`,
    placed: (n: number, total: number) => `Pièce posée (${n}/${total}).`,
    groupNotMoved: (reason: string) => `Groupe non déplacé : ${reason}`,
    groupMoved: (n: number) => `Groupe de ${n} pièces déplacé (« Annuler » le remet en place d’un coup).`,
    transformFailed: (what: string, reason: string) => `${what} impossible : ${reason}`,
    transformed: (n: number, what: string) => `${n > 1 ? `${n} pièces` : 'Pièce'} : ${what} (« Annuler » revient en une fois).`,
    invalidCoords: 'Coordonnées invalides.',
    rewound: (step: string) => `Reprise depuis ${step} : les pièces des étapes suivantes ont été retirées.`,
    thisStep: 'cette étape',
  },
  /** What a gizmo drag or typed coordinates did to the selection (inserted in the toasts). */
  transform: {
    typed: 'déplacée aux coordonnées saisies',
    rotated: 'tournée',
    moved: 'déplacée',
  },
  /** Mapping editor, from the 3D view and the mapping files. */
  mapping: {
    createStepFirst: 'Crée d’abord une étape de notice (+ Nouvelle étape).',
    partName: (part: string, colour: string) => `${part} (couleur ${colour})`,
    removedFrom: (name: string, step: string) => `${name} retirée de ${step}.`,
    stepWithPage: (step: string, page: number) => `${step} (p. ${page})`,
    otherStep: 'une autre étape',
    alreadyIn: (name: string, where: string) => `${name} est déjà dans ${where} : ⌥-clic pour la déplacer ici.`,
    added: (name: string, moved: boolean, step: string) => `${name} ${moved ? 'déplacée dans' : 'ajoutée à'} ${step}.`,
    importRefused: (detail: string) => `Import refusé : ${detail}`,
    imported: (steps: number, assigned: number, total: number, ok: boolean) =>
      `Correspondances importées : ${steps} étape(s), ${assigned}/${total} pièces affectées${ok ? ', valides.' : ' (brouillon, voir la validation).'}`,
    cleared: 'Correspondances effacées.',
    replaced: 'Correspondances précédentes remplacées.',
    restore: 'Les restaurer',
    restored: 'Correspondances précédentes restaurées.',
  },
  /** Synchronised instructions: availability. */
  sync: {
    noMapping: 'aucune correspondance notice ↔ 3D pour ce fichier.',
    invalid: 'correspondances invalides.',
    available: (steps: number) => `Notice synchronisée disponible : ${steps} étape(s) de notice, correspondances validées.`,
    unavailable: (reason: string) => `Notice synchronisée indisponible : ${reason}`,
    editMapping: 'Modifier les correspondances',
    createMapping: 'Créer les correspondances',
  },
  status: {
    renderUnavailable: (problem: string) => `Rendu indisponible : ${problem}`,
    geometry: (combinations: number, missing: number, ms: number) =>
      `Géométrie LDraw : ${combinations} combinaison(s) pièce/couleur chargée(s), ${missing} référence(s) manquante(s), ${ms} ms.`,
  },
  /** HUD at the top left of the 3D view: the piece in hand, the selection. */
  hud: {
    taken: 'Pièce reprise · ',
    group: (n: number) => `Groupe de ${n} pièces · `,
    levelAuto: 'Niveau auto (surface)',
    heightManual: 'Hauteur manuelle (A : auto)',
    levelManual: (level: number, levels: number) => `Niveau manuel ${level}/${levels} (A : auto)`,
    rotation: (degrees: number) => `rotation ${degrees}°`,
    orientationOff: 'orientation hors modèle (O : revenir à celles du modèle)',
    orientation: (index: number, count: number) => `orientation ${index}/${count}`,
    magnet: (connections: string, pieces: number) => ` · aimant : ${connections} sur ${pieces} pièce(s) (⌥ : ignorer)`,
    atModel: 'à sa place dans le modèle',
    targetFound: 'emplacement trouvé',
    freePose: 'pose libre',
    verified: (connections: string) => ` · ${connections} vérifié(s)`,
    clickToPlace: ', clic pour poser',
    height: (ldu: number) => `bas à ${ldu} LDU du sol`,
    orientationInfo: (top: string, front: string) => `Dessus : ${top} · Avant : ${front}`,
    selection: (n: number) => `${n} pièce(s) sélectionnée(s)`,
    coords: (x: number, y: number, z: number) => `X ${x} · Y ${y} (hauteur) · Z ${z} LDU`,
  },
  /** Legend at the bottom of the scene: instructions (results go to the toast). */
  hint: {
    pickFree: 'Pointe où tu veux : la pièce se pose sur la surface visée (grille d’un demi-tenon, G pour la retirer). Clic : poser · R : tourner · O : orientation · Monter / Descendre (PageUp / PageDown) : hauteur libre · Échap : lâcher.',
    pick: 'Survole le modèle : la pièce se pose sur la surface visée. Clic : poser · R : tourner · O : orientation · PageUp/PageDown : niveau manuel (A : auto) · Échap : lâcher.',
    taken: 'Pièce reprise : clic pour la reposer · R / O : la tourner · Monter / Descendre : hauteur · Suppr : la remettre dans le stock · Échap : la laisser où elle était.',
    group: (n: number) =>
      `Groupe de ${n} pièces en main : déplace la souris, clic (ou relâche) pour le poser · R, X / Y / Z : tourner · Monter / Descendre : hauteur · Échap : le laisser où il était.`,
    selection: (n: number) =>
      `${n} pièce(s) sélectionnée(s) · flèches X / Y / Z (W) ou anneaux (E) du manipulateur, ou glisse la pièce · Maj+clic : ajouter ou retirer · Suppr : remettre dans le stock · Échap : désélectionner.`,
    allKeys: 'toutes les touches',
  },
  /** Top bar: progress and save state. */
  progress: {
    placed: (n: number, total: number) => `${n}/${total} pièces posées`,
    step: (index: number, count: number) => `Étape ${index} / ${count}`,
    noticeStep: (step: string, page: number) => `Notice : ${step}, p. ${page}`,
    free: (free: number, atModel: number) => `${free} posée(s) librement · ${atModel} à leur place dans le modèle`,
  },
  save: {
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    savedWhere: ' dans la bibliothèque',
    notSaved: (reason: string) => `Non enregistré : ${reason}`,
    local: 'Sauvegardé localement',
    reload: 'Recharger',
  },
  skipLink: 'Aller au panneau latéral',
  /** Standalone atelier, nothing imported yet. */
  home: {
    title: 'Atelier sans collection',
    intro: 'Reconstruis virtuellement un modèle LDraw pièce par pièce, sans l’ajouter à ta collection : la progression reste dans ce navigateur. Tout reste sur ce Mac. Application non affiliée à LEGO.',
    importModel: 'Importer un modèle (.mpd / .ldr)',
    demo: 'Essayer la démo',
    dropHint: 'ou dépose le fichier ici.',
    legoUrl: 'https://www.lego.com/fr-fr/service/building-instructions',
    legoLink: 'Trouver une notice sur LEGO.com',
    legoLinkNote: '(ouvre le site, aucun téléchargement automatique)',
    recentTitle: 'Sessions récentes de ce navigateur',
    recentItem: (name: string, placed: number, total: number) => `${name} — ${placed}/${total} pièces · réimporte le fichier pour reprendre`,
  },
  /** Tools on the right edge of the scene. */
  rail: {
    label: 'Outils de la scène',
    center: 'Centrer',
    centerTip: 'Centrer la vue',
    showTargets: 'Montrer les emplacements',
    gridTip: 'Grille d’un demi-tenon et niveaux de plaque (G)',
    grid: 'Grille (G)',
    magnetPiecesTip: 'Aimant pièces : tenons, réceptacles, goupilles (⌥ pour l’ignorer)',
    magnetPieces: 'Aimant pièces',
    magnetModelTip: 'Aimant modèle : se cale sur sa place dans le modèle',
    magnetModel: 'Aimant modèle',
    xray: 'Voir les connexions',
    xrayTip: 'Voir les connexions : les autres pièces deviennent transparentes (affichage seulement)',
    showPanel: 'Afficher le panneau',
    hidePanel: 'Replier le panneau',
  },
  /** Settings of the transform gizmo (selection bar). */
  gizmo: {
    stepTitle: 'Pas des flèches : à l’horizontale ½ tenon (10 LDU) ou un tenon (20 LDU), à la verticale une plaque (8 LDU) ; ou 1 LDU partout. ⌥ pendant le glisser : sans pas.',
    step: 'Pas des flèches',
    halfStud: '½ tenon',
    stud: 'tenon',
    coords: 'Coordonnées',
    coordsUnit: '(LDU, Y = hauteur)',
    apply: 'Appliquer',
  },
  /** Side panel. */
  side: {
    tabs: 'Panneau latéral',
    model: 'Modèle',
    pdf: 'Notice PDF',
    mapping: 'Correspondances',
    viewOnly: 'Visualisation seulement tant que des pièces manquent.',
    libraryCause: 'Cause : la bibliothèque de pièces LDraw de ce Mac (voir la zone 3D), pas ton fichier.',
    importOther: 'Importer un autre modèle',
    noModel: 'Aucun modèle importé.',
    captionSynced: 'page pilotée par l’étape de notice en cours.',
    captionEditing: 'page de l’étape éditée.',
    captionFree: 'page PDF indépendante des étapes 3D.',
  },
  /** Parts tray actions and end of the build. */
  tray: {
    complete: (total: number) => `Modèle terminé : ${total}/${total} pièces.`,
    restart: 'Recommencer',
    undo: 'Annuler',
    undoTip: 'Annuler la dernière action (⌘Z)',
    nextOrientation: 'Orientation suivante (O)',
    assistTip: 'Aide / accessibilité : pose la pièce tenue à l’emplacement libre le plus proche',
    assist: 'Poser à la position cible (aide)',
    resetStep: 'Réinitialiser l’étape',
    abandon: 'Abandonner',
  },
  /** Confirmation dialogs. */
  confirm: {
    restartTitle: 'Abandonner cette partie ?',
    restartConfirm: 'Confirmer l’abandon',
    restartText: (placed: number, total: number, library: boolean) =>
      `La progression (${placed}/${total}) sera retirée de cette partie${library ? ' (copie gardée dans l’historique de la bibliothèque)' : ' et effacée de ce navigateur'}.`,
    switchTitle: (mode: string) => `Passer en ${mode} ?`,
    switchConfirm: 'Retirer et changer de mode',
    switchCancel: 'Rester en montage libre',
    switchText: (unmatched: number, mode: string, recognised: number) =>
      `${unmatched} pièce(s) posée(s) hors du modèle officiel : pour passer en ${mode}, elles seront remises dans le stock${recognised > 0 ? ` (${recognised} reconnue(s) à leur place, gardée(s))` : ''}.`,
  },
  /** Library build being opened (LibraryAtelier). */
  library: {
    loadVerify: 'Vérification des fichiers…',
    loadModel: 'Chargement du modèle…',
    loadProgress: 'Lecture de la progression…',
    loadBooklets: (index: number, count: number) => `Chargement des notices (${index}/${count})…`,
    modelUnavailable: 'Modèle 3D indisponible.',
    hashMismatch: 'Le modèle reçu n’a pas l’empreinte attendue : il n’est pas utilisé.',
    noteBookletNotLoaded: (reason: string) => `Notice non chargée : ${reason}`,
    noteMigrated: (placed: number, total: number, date: string) =>
      `Partie enregistrée dans ce navigateur reprise dans la bibliothèque (${placed}/${total} pièces, ${date}). Elle reste aussi dans le navigateur.`,
    noteBrowserTaken: (placed: number, total: number, withMapping: boolean) =>
      `Sauvegarde de ce navigateur reprise (${placed}/${total} pièces)${withMapping ? ', avec ses correspondances' : ''}. La version précédente de la bibliothèque est gardée dans son historique.`,
    noteLibraryTaken: 'Sauvegarde de la bibliothèque reprise. Celle de ce navigateur est conservée et reste récupérable depuis le détail du set.',
    noteKept: (placed: number, total: number) => `Une autre sauvegarde existe dans ce navigateur (${placed}/${total} pièces) : récupérable depuis le détail du set.`,
    noteMappingTaken: (steps: number) => `Correspondances de ce navigateur reprises dans la bibliothèque (${steps} étape(s)).`,
    noteMappingDiffers: 'Ce navigateur contient une autre version des correspondances pour ce modèle : celle de la bibliothèque est utilisée (l’autre reste dans le navigateur, récupérable depuis le détail du set).',
    errorTitle: 'Impossible d’ouvrir cette construction',
    nothingLoaded: 'Rien n’a été chargé à la place : aucun autre modèle ni aucune correspondance n’est utilisé.',
    repair: 'Réparer depuis le détail du set',
    ok: 'OK',
    choiceTitle: 'Deux sauvegardes différentes pour cette construction',
    choiceIntro: 'Choisis celle à reprendre. L’autre n’est ni effacée ni écrasée : la bibliothèque garde sa version précédente dans son historique, et ce navigateur garde la sienne.',
    choiceNewer: (library: boolean) => `Enregistrée en dernier : ${library ? 'la bibliothèque' : 'ce navigateur'} (indication seulement).`,
    choiceInvalid: (placed: number, total: number, date: string) =>
      `La sauvegarde de la bibliothèque ne correspond plus à ce modèle (elle est conservée telle quelle). Ce navigateur contient une partie valide : ${placed}/${total} pièces, ${date}.`,
    choiceWithMapping: 'Reprendre aussi les correspondances de ce navigateur (celles de la bibliothèque iront dans son historique)',
    choiceLibrary: 'Reprendre la bibliothèque',
    choiceBrowser: 'Reprendre ce navigateur',
  },
};
