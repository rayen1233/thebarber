# Vidéos produit (Cloudinary)

Les **vidéos produit** ne sont plus stockées dans GitHub, `localStorage`, `data:` ni IndexedDB.

## Configuration Vercel

1. Créez un compte [Cloudinary](https://cloudinary.com/).
2. Ajoutez sur Vercel (Production + Preview) :
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
3. Redeploy le projet.

## Admin

- Fichier vidéo : max **20 Mo** → upload via `/api/cloudinary-video`.
- Cloudinary transcode en **MP4 1080p max** (`q_auto`) et génère une **miniature JPG**.
- Le catalogue enregistre uniquement :
  - `videoUrl` (URL Cloudinary)
  - `videoPosterUrl` (miniature)

## Boutique (intro)

| Contexte | `preload` | Chargement |
|----------|-----------|------------|
| Carte liste | `metadata` | `src` chargé quand la carte est visible (lazy) |
| Fiche produit | `auto` | immédiat à l’ouverture |

## Showroom ORDER (4 panneaux)

Même compte Cloudinary, public_id fixes :

| Panneau | Fichier local | Cloudinary |
|---------|---------------|------------|
| Tondeuse | `public/backgroundtondeuse.mp4` | `thebarber/showroom/backgroundtondeuse` |
| Ciseaux | `public/backgroundscisso.mp4` | `thebarber/showroom/backgroundscisso` |
| Accessoires | `public/backgroundaccesoire.mp4` | `thebarber/showroom/backgroundaccesoire` |
| Marchandise | `public/backgroundmarchandise.mp4` | `thebarber/showroom/backgroundmarchandise` |

### Publier les vidéos showroom

```bash
node scripts/upload-showroom-videos.mjs
```

Cela envoie les 4 MP4 vers Cloudinary et écrit `public/showroom-cloudinary.json` (URLs + posters).

Le site charge ensuite :

1. `showroom-cloudinary.json` (CDN)
2. sinon `/api/showroom-videos` (généré depuis les mêmes public_id)
3. sinon repli `public/*.mp4` / Blob legacy

Commit **`showroom-cloudinary.json`** (petit fichier JSON, pas les MP4). Les `.mp4` locaux restent dans `.gitignore` à la racine.

## Migration anciennes vidéos

- `idb://` ou `data:` : bouton **Migrer vidéos IDB** dans l’admin, ou ré-importez le fichier avec la clé admin sur le site en ligne.
