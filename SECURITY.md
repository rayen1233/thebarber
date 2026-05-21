# Secrets — ne jamais committer

Si `.env.local` ou `BLOB_READ_WRITE_TOKEN` / `ADMIN_SECRET` ont été poussés sur GitHub :

1. **Vercel** → Project → Settings → Environment Variables  
   - Régénérez **BLOB_READ_WRITE_TOKEN** (Storage → Blob → ou recréer le token)  
   - Changez **ADMIN_SECRET** si elle était dans le fichier commité  

2. **GitHub** → supprimez le secret de l’historique (ou acceptez qu’il est compromis et rotate uniquement sur Vercel).

3. Gardez les secrets uniquement dans `.env.local` (déjà dans `.gitignore`).

```powershell
# Retirer .env.local du suivi git si jamais ajouté :
git rm --cached .env.local
git commit -m "Remove committed secrets file"
git push
```
