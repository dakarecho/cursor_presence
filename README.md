# Pointage Hopital Senegal

Application desktop moderne de gestion de pointage hospitalier, construite avec Electron, React, Tailwind CSS et sql.js embarquee. Elle est adaptee a l'organisation sanitaire senegalaise: regions medicales, districts sanitaires, EPS, CHN/CHR, gardes, astreintes et rotations de service.

## Fonctionnalites

- Tableau de bord des presences, retards, gardes ouvertes et couverture par service.
- Pointage entree/sortie avec vacations Matin, Apres-midi, Nuit, Garde 24h et Astreinte.
- Base SQLite locale embarquee via sql.js, persistee dans le dossier utilisateur de l'application.
- Registre des agents avec matricule MSAS, fonction, grade, service, regime de travail et statut.
- Rapports mensuels exportables en CSV pour la direction RH ou les surveillants de service.
- Interface professionnelle Tailwind CSS avec navigation laterale et cartes de pilotage.

## Demarrage

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run dist
```

Le packaging inclut `sql-wasm.wasm` comme ressource Electron afin que la base sql.js fonctionne hors ligne.

## Scripts utiles

- `npm run dev` : lance Vite, compile le processus Electron et ouvre l'application.
- `npm run typecheck` : verifie TypeScript cote renderer et Electron.
- `npm run build` : compile l'application.
- `npm run package` : genere un repertoire d'application non installe.
- `npm run dist` : genere les artefacts de distribution.
