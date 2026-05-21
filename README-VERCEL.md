# Déploiement Vercel — The Barber

## Prérequis

1. Compte [Vercel](https://vercel.com) + dépôt GitHub `rayen1233/thebarber`
2. **Storage → Blob** → créer le store → **Connect to Project** (thebarber)  
   Vercel ajoute `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, etc.  
   **Sans Blob connecté, tout revient à 0 après refresh.**

   Le catalogue est enregistré comme sur la doc Vercel :

   ```js
   import { put } from "@vercel/blob";
   await put("thebarber/store.json.gz", data, { access: "private" });
   ```

   Variable optionnelle `BLOB_STORE_ACCESS` = `private` (défaut) ou `public` selon le type du store.
3. Variable d’environnement **`ADMIN_SECRET`** (mot de passe admin pour enregistrer le catalogue)
4. Après avoir ajouté Blob ou modifié les variables : **Redeploy** obligatoire

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

## Migrer le catalogue créé sur localhost

**Important :** `localhost` et `votre-app.vercel.app` n’ont **pas** le même stockage navigateur. Les produits ajoutés en local ne partent pas automatiquement sur Vercel.

### Méthode recommandée (export / import)

1. Sur **localhost** : ouvrez `/admin.html` → **Exporter catalogue (JSON)** → enregistrez le fichier.
2. Sur **Vercel** : ouvrez `/admin.html` → saisissez la **clé admin** (`ADMIN_SECRET`) quand le site le demande.
3. **Importer catalogue (JSON)** → choisissez le fichier → le catalogue est publié sur le serveur automatiquement.
4. Ouvrez la page d’accueil du site en ligne : les produits viennent de `GET /api/store`.

Si l’import affiche « JSON invalide » ou échoue dans le navigateur (fichier ~5 Mo avec photos intégrées), utilisez le script :

```powershell
cd "c:\Users\rayen\Downloads\the barber"
$env:ADMIN_SECRET="votre-cle-vercel"
$env:VERCEL_URL="https://thebarber-three.vercel.app"
node scripts/push-catalog.mjs "C:\Users\rayen\Downloads\barber\thebarber-catalogue-....json"
```

Sinon, réduisez les images en base64 ou passez aux URLs / upload Blob.

### Vidéos `idb://`

Les vidéos sont dans **IndexedDB** du navigateur (référence `idb://…`), pas dans le JSON.

1. Ouvrez l’admin sur **localhost** (même navigateur qu’à la création des produits).
2. Cliquez **Publier les vidéos sur Vercel** → URL du site + clé `ADMIN_SECRET`.
3. Attendez la fin, puis rechargez le site en ligne.

Sinon, ré-uploadez chaque vidéo manuellement dans l’admin Vercel.

### Vidéos showroom (fond des 4 panneaux COMMANDER)

Les vidéos `backgroundtondeuse.mp4`, `backgroundscisso.mp4`, etc. doivent être sur **Blob** (comme les vidéos produit), pas seulement dans `public/`, pour une lecture fluide via `/api/media` (Range HTTP).

```powershell
cd "c:\Users\rayen\Downloads\the barber"
# .env.local avec BLOB_READ_WRITE_TOKEN (vercel env pull)
node scripts/upload-showroom-videos.mjs
```

Puis redéployez et hard-refresh `intro.html`. En local sans upload Blob, le site utilise encore les fichiers `public/*.mp4`.

### Bouton « Publier sur le serveur »

Sur Vercel uniquement : envoie le contenu actuel de l’admin (ce navigateur) vers le Blob, sans refaire un import.

## Git push

```bash
git init
git remote add origin https://github.com/rayen1233/thebarber.git
git add .
git commit -m "Deploy: Vercel static site + Blob store API"
git push -u origin main
```

Fichiers lourds (torrents, grosses vidéos hors `public/`) sont ignorés par `.gitignore` ; les vidéos showroom dans `public/` sont versionnées.
