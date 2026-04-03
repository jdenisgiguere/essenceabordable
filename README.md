# Prix Essence Québec

Visualisation Vue 3 des prix de l'essence au Québec, construite avec Vite et MapLibre.

## Stack

- Vue 3
- Vue Router
- Vite
- MapLibre GL

## Démarrage

```bash
npm install
npm run dev
```

L'application démarre en local avec Vite. La vue principale est la carte et une seconde route est prévue pour une dataviz comparative.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Structure

```text
.
├── index.html
├── src/
│   ├── App.vue
│   ├── main.js
│   ├── router/
│   ├── utils/
│   ├── views/
│   └── style.css
├── vite.config.js
└── .github/workflows/deploy-pages.yml
```

## Déploiement GitHub Pages

Le dépôt utilise GitHub Actions pour :

1. installer les dépendances,
2. construire l'application Vite,
3. publier le dossier `dist/` sur GitHub Pages.

Le `base` Vite est configuré en chemin relatif pour éviter de dépendre du nom exact du dépôt.
