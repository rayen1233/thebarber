# Déploiement Vercel — The Barber

## Prérequis

1. Compte [Vercel](https://vercel.com) + dépôt GitHub `rayen1233/thebarber`
2. Dans le projet Vercel : **Storage → Blob** (créer un store) — fournit `BLOB_READ_WRITE_TOKEN`
3. Variable d’environnement **`ADMIN_SECRET`** (mot de passe admin pour enregistrer le catalogue)

## Déployer

1. Importez le repo GitHub sur Vercel (framework : **Other**, racine du repo).
2. `vercel.json` sert le site statique (`intro.html`, `admin.html`, `public/`, etc.) et les routes `/api/*`.
3. Après le premier déploiement, ouvrez **`/admin.html`** :
   - Au premier chargement, saisissez la même valeur que `ADMIN_SECRET`.
   - Si votre catalogue était déjà dans le navigateur en local, il peut être migré automatiquement vers le Blob.

## Données

| Endpoint | Rôle |
|----------|------|
| `GET /api/store` | Charge produits, comptes, commandes (tous les visiteurs) |
| `PUT /api/store` | Enregistrement complet (admin, header `Authorization: Bearer ADMIN_SECRET`) |
| `POST /api/patch` | Sync comptes + commandes depuis la boutique (sans clé admin) |
| `POST /api/upload` | Images / vidéos produit → URL publique Blob (admin) |

En local (`localhost`), le stockage reste **localStorage** + fichier `.data/store.json` pour les API si vous lancez `npm run vercel:dev`.

## Migrer les données actuelles du navigateur

1. Ouvrez le site en local avec vos produits déjà créés.
2. Déployez sur Vercel, configurez Blob + `ADMIN_SECRET`.
3. Ouvrez `https://votre-app.vercel.app/admin.html`, entrez la clé admin — la migration propose d’envoyer le catalogue local vers le serveur si le serveur est vide.

Vous pouvez aussi utiliser **Exporter JSON** dans l’admin puis réimporter après déploiement.

## Git push

```bash
git init
git remote add origin https://github.com/rayen1233/thebarber.git
git add .
git commit -m "Deploy: Vercel static site + Blob store API"
git push -u origin main
```

Fichiers lourds (torrents, grosses vidéos hors `public/`) sont ignorés par `.gitignore` ; les vidéos showroom dans `public/` sont versionnées.
