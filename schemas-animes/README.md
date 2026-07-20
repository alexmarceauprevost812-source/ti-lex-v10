# TI-LEX v10 — moteur de chat qui anime des schémas en vidéo

Une appli web autonome (un seul fichier `index.html`, aucune dépendance, aucun
serveur requis) : tu jases avec LEX dans le clavardage, il construit un schéma
en temps réel, l'anime comme une petite vidéo explicative, et tu peux
l'exporter en fichier `.webm` téléchargeable.

## Démarrer

Ouvre `index.html` dans un navigateur récent (Chrome ou Edge à jour
recommandés — voir la section limites plus bas). Aucune installation,
aucune connexion internet requise après le chargement de la page.

## Comment ça marche

- **Le clavardage (chat)** — tu décris un processus en français, LEX
  l'interprète et met à jour le schéma à droite.
- **Le moteur de compréhension** est un parseur à règles (expressions
  régulières), pas une IA généraliste. C'est un choix assumé : ça reste
  100 % prévisible, ça fonctionne hors ligne et ça ne se trompe jamais de
  façon imprévisible. La limite, c'est qu'il faut rester proche des
  tournures supportées (voir la liste de commandes plus bas, ou écris
  « aide » dans le clavardage).
- **La mise en page** choisit automatiquement entre deux modes : une
  chronologie alternée gauche/droite pour un flux linéaire simple, ou un
  graphe en rangs dès qu'il y a une branche ou une fusion (via des
  connexions explicites).
- **Le rendu** se fait entièrement sur un `<canvas>` (aucun SVG/DOM) avec
  une seule fonction de dessin pilotée par une progression temporelle.
  Cette même fonction sert autant à l'aperçu en direct qu'à l'export vidéo
  — ce que tu vois à l'écran est exactement ce qui sort dans le fichier.
- **L'export vidéo** capture le canevas hors-écran avec
  `canvas.captureStream()` + `MediaRecorder`, image par image, en rejouant
  la même animation de construction, puis déclenche le téléchargement d'un
  `.webm`.

## Commandes supportées dans le clavardage

- Décrire un flux complet : `Idée -> Design -> Code -> Lancement`
- Ou une liste : `étapes: Analyse, Conception, Développement, Tests`
- Ajouter une étape : `ajoute une étape Révision` ou `ajoute Bêta après Tests`
- Relier deux étapes : `relie Design à Code`
- Renommer : `renomme Code en Développement`
- Supprimer : `supprime Tests`
- Changer une couleur : `couleur Design en violet` (bleu, vert, magenta,
  jaune, aqua, orange, violet, rouge)
- Titrer le schéma : `titre Mon super projet`
- Rejouer l'animation : `rejoue` / `anime` / `montre-moi`
- Exporter en vidéo : `exporte la vidéo`
- Changer de thème : `thème clair` / `thème sombre`
- Recommencer : `recommence`
- Aide : `aide`

Les boutons du haut (▶ Rejouer, ⬇ Exporter la vidéo, ☾ Thème, ⟳
Réinitialiser) font exactement la même chose que les commandes
équivalentes.

## Palette de couleurs

Les couleurs des étapes viennent de la palette catégorielle validée du
skill dataviz interne (huit teintes fixes, choisies pour rester
distinguables — y compris pour la vision des couleurs). Le thème sombre et
le thème clair utilisent chacun leur propre variante de contraste.

## Limites connues (pour être honnête sur ce qui fonctionne vraiment)

- **Le parseur est à règles, pas une vraie IA.** Il comprend bien les
  tournures listées ci-dessus ; une phrase totalement libre et ambiguë
  peut ne pas être reconnue (LEX va alors demander de reformuler plutôt
  que d'halluciner un résultat).
- **L'export vidéo dépend du navigateur.** `MediaRecorder` +
  `canvas.captureStream()` fonctionnent bien sur Chrome, Edge et Firefox
  récents (ordinateur ou Android). Le support est plus limité sur Safari
  / iOS — si l'export échoue, LEX l'explique clairement dans le
  clavardage plutôt que de rester silencieux.
- **Le format de sortie est `.webm`**, pas `.mp4` (c'est le format que les
  navigateurs savent enregistrer nativement sans dépendance externe). La
  plupart des lecteurs modernes et des éditeurs vidéo l'ouvrent sans
  problème ; un convertisseur en ligne ou `ffmpeg` peut transformer en
  `.mp4` au besoin.

## Pistes pour la suite (pas construites dans cette version)

- Brancher un vrai modèle de langage (ex. l'API Claude) à la place du
  parseur à règles, pour comprendre des descriptions plus libres.
- Export `.mp4` direct côté serveur.
- Le **volet cryptomonnaie canadienne** mentionné en parallèle de ce
  projet est volontairement **séparé** de TI-LEX v10, à construire comme
  un projet à part quand tu seras prêt.
