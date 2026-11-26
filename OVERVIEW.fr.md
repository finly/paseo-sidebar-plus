Sidebar+ est une vue de barre latérale où vous créez des groupes pour vos projets, ou regroupez les espaces de travail par statut ou par libellé. Les lignes des espaces de travail affichent le statut de l’agent et peuvent inclure la branche, la pull request, les vérifications et les services.

## Configuration

- Nécessite Paseo 0.16.0 ou une version ultérieure sur le daemon et l’application.
- Après l’installation, choisissez **Sidebar+** dans **Paramètres > Barre latérale**. Choisissez-y la barre latérale par défaut pour revenir en arrière.
- Sélectionnez le bouton à curseurs en haut de la vue pour ouvrir les **Préférences d’affichage**. Vous pouvez y modifier les champs des lignes, la taille du texte, la hauteur de ligne ou le retrait.
- Disponible en anglais, chinois (simplifié), japonais, coréen, espagnol, français, portugais (Brésil), russe et arabe.

## Organiser

- **Groupes et sous-groupes :** placez les projets dans des groupes, avec un niveau de sous-groupes, chacun avec une couleur et une icône ou un emoji.
- **Glisser pour organiser :** réorganisez les groupes, les sous-groupes, les projets et les espaces de travail épinglés, ou faites glisser un projet vers un autre groupe. Sur écran tactile, appuyez longuement d’abord.
- **Replier :** les groupes et projets repliés affichent un nombre, et un point de statut quand un travail demande votre attention ou est en cours.
- **Grouper par :** projet, statut ou libellé.
- **Trier :** par nom, dernière activité ou date de création, ou faites glisser les espaces de travail dans un ordre manuel.

## Lignes des espaces de travail

- **Statut :** en cours, saisie requise, attention, terminé ou échec.
- **Ligne 1 :** le titre, et la dernière activité quand cette option est activée.
- **Champs :** branche, projet, pull request, vérifications, stats de diff, services en cours et libellés. Placez chacun sur la ligne 2 ou la ligne 3, ou masquez-le. Les lignes épinglées gardent leur projet visible.
- **Pull requests :** numéro et état, quand l’hôte les fournit. Appuyez sur une pull request avec un lien pour l’ouvrir dans votre navigateur.
- **Services :** services en cours, avec les ports quand ils sont disponibles.
- **Lignes courtes :** les lignes vides se replient, pour que les espaces de travail simples n’occupent qu’une ligne.

## Trouver

- **Recherche :** porte sur le titre, la branche, le projet, le libellé et l’hôte.
- **Filtres :** par hôte, projet ou libellé.
- **Aller à l’actuel :** ramène l’espace de travail ouvert dans la vue et déplie son groupe si nécessaire.
- **En-têtes fixes :** gardent le groupe et le projet actuels visibles sur le web et sur ordinateur.

## Agir

- **Menu de l’espace de travail :** copier le chemin ou la branche, renommer, épingler, libellés, et archiver avec une étape de confirmation.
- **Menu du projet :** nouvel espace de travail, copier le chemin, couleur et icône, déplacer vers un groupe, et archiver des espaces de travail.
- **Archivage groupé :** archivez d’un coup plusieurs espaces de travail d’un projet, avec des sélections rapides pour les espaces terminés, fusionnés et inactifs. Les espaces en cours, en attente de saisie, épinglés ou actuellement ouverts, ainsi que ceux qui ont une pull request ouverte ou en brouillon, ne sont pas sélectionnés par défaut.

## Accès aux données

- Lit les espaces de travail, les projets et les hôtes de vos hôtes Paseo connectés, y compris les détails des pull requests, des vérifications et des services.
- Ne modifie un espace de travail (renommer, épingler, libellés, archiver) que lorsque vous choisissez cette action.
- Les groupes, l’ordre des projets, les couleurs et icônes des en-têtes, les préférences d’affichage et l’ordre manuel des espaces de travail et des épinglés sont enregistrés dans les paramètres du plugin sur l’hôte Paseo et partagés par ses appareils.
- Les filtres et l’état replié sont enregistrés sur chaque appareil.
- Ne contacte aucun service en dehors de Paseo. Les liens des pull requests s’ouvrent dans votre navigateur.
