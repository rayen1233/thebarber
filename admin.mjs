import {
  getProducts,
  saveProducts,
  validateProductInput,
  upsertProduct,
  deleteProduct,
  resolveShopMediaUrl,
  newProductId,
  STORAGE_PRODUCTS,
  STORAGE_CART,
} from "./shop-core.mjs";
import {
  persistProductVideoRef,
  migrateCatalogVideosToIdb,
  productHasVideo,
  isIdbVideoRef,
} from "./shop-media-store.mjs";
import { initAdminDashboard } from "./admin-dashboard.mjs";
import { whenStoreReady } from "./shop-bootstrap.mjs";
import {
  isRemoteMode,
  getAdminKey,
  setAdminKey,
  maybeMigrateLocalCatalogToServer,
} from "./shop-remote.mjs";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const MAX_VIDEO_BYTES = 6_000_000;

/**
 * @param {ImageBitmap} bitmap
 * @param {number} maxSide
 */
function bitmapToJpegDataUrl(bitmap, maxSide, quality) {
  const w0 = bitmap.width;
  const h0 = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * @param {File} file
 * @returns {Promise<string>} JPEG data URL
 */
async function compressImageToJpegDataUrl(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new Error(
        "Impossible d’ouvrir ce fichier. Utilisez JPG, PNG ou WebP. (HEIC : exportez en JPG depuis le téléphone ou utilisez une URL.)",
      );
    }
  }
  try {
    let maxSide = 1280;
    let quality = 0.72;
    let best = bitmapToJpegDataUrl(bmp, maxSide, quality);
    /** ~140 Ko par image cible (localStorage partagé ~5 Mo selon navigateurs). */
    const TARGET_BYTES = 140_000;
    for (let i = 0; i < 22; i++) {
      const bytes = (best.length * 3) / 4;
      if (bytes <= TARGET_BYTES) break;
      quality = Math.max(0.24, quality - 0.055);
      maxSide = Math.max(400, Math.round(maxSide * 0.85));
      best = bitmapToJpegDataUrl(bmp, maxSide, quality);
    }
    return best;
  } finally {
    bmp.close?.();
  }
}

function approxBytesFromDataUrl(dataUrl) {
  return Math.round((dataUrl.length * 3) / 4);
}

function isQuotaError(err) {
  if (!err) return false;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "QuotaExceededError" || err.code === 22;
  }
  if (err instanceof Error) {
    if (err.name === "QuotaExceededError") return true;
    const m = err.message;
    return (
      m.includes("Stockage plein") ||
      m.includes("saturé") ||
      m.includes("quota navigateur")
    );
  }
  return false;
}

/**
 * Recompresse une data URL image déjà importée (seconde passe si quota).
 * @param {string} dataUrl
 * @param {number} maxBytes
 */
async function recompressDataUrlToTarget(dataUrl, maxBytes) {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(null);
    img.onerror = () => reject(new Error("Recompression impossible."));
    img.src = dataUrl;
  });
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  let maxSide = Math.min(1100, Math.max(iw, ih));
  let quality = 0.58;
  let best = dataUrl;
  for (let i = 0; i < 26; i++) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, maxSide / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible.");
    ctx.drawImage(img, 0, 0, w, h);
    best = canvas.toDataURL("image/jpeg", quality);
    if (approxBytesFromDataUrl(best) <= maxBytes) return best;
    quality = Math.max(0.18, quality - 0.05);
    maxSide = Math.max(340, Math.round(maxSide * 0.82));
  }
  return best;
}

/**
 * @param {HTMLElement} container
 * @param {number} maxBytesPerImage
 */
async function recompressAllPhotoRowsInForm(container, maxBytesPerImage) {
  const rows = container.querySelectorAll(".admin-photo-row");
  for (const row of rows) {
    const stored = (row.getAttribute("data-stored-url") || "").trim();
    if (!stored.startsWith("data:image")) continue;
    const next = await recompressDataUrlToTarget(stored, maxBytesPerImage);
    row.setAttribute("data-stored-url", next);
    const preview = row.querySelector(".admin-photo-preview");
    const prevImg = preview?.querySelector("img");
    if (prevImg) prevImg.src = next;
    const st = row.querySelector(".admin-photo-status");
    if (st) {
      const kb = (approxBytesFromDataUrl(next) / 1024).toFixed(0);
      st.textContent = `Recompressé (~${kb} Ko)`;
      st.classList.remove("is-error");
      st.classList.add("is-ok");
    }
  }
}

function setAdminStatus(msg, kind = "") {
  const el = document.getElementById("admin-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("is-error");
  if (kind === "error") el.classList.add("is-error");
}

/**
 * @param {HTMLElement} row
 * @param {File} file
 */
async function loadFileIntoRow(row, file) {
  const status = row.querySelector(".admin-photo-status");
  const preview = row.querySelector(".admin-photo-preview");
  const urlInp = row.querySelector(".admin-photo-url");
  const setStatus = (text, err) => {
    if (!status) return;
    status.textContent = text;
    status.classList.remove("is-ok", "is-error");
    if (err) status.classList.add("is-error");
    else if (text) status.classList.add("is-ok");
  };

  row.removeAttribute("data-stored-url");
  setStatus("Traitement de l’image…", false);

  const isImage =
    (file.type && file.type.startsWith("image/")) ||
    /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);

  if (!isImage) {
    setStatus("Ce fichier n’est pas une image reconnue.", true);
    return;
  }

  try {
    const dataUrl = await compressImageToJpegDataUrl(file);
    row.setAttribute("data-stored-url", dataUrl);
    if (urlInp) urlInp.value = "";
    if (preview) {
      preview.textContent = "";
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "";
      preview.appendChild(img);
    }
    const kb = (approxBytesFromDataUrl(dataUrl) / 1024).toFixed(0);
    setStatus(`Image enregistrée (~${kb} Ko, optimisée pour le catalogue).`, false);
  } catch (e) {
    if (preview) {
      preview.textContent = "Échec";
    }
    setStatus(e instanceof Error ? e.message : "Erreur de lecture.", true);
  }
}

/**
 * @param {HTMLElement} container
 * @param {string} [initialUrl]
 */
function addPhotoRow(container, initialUrl = "") {
  const row = document.createElement("div");
  row.className = "admin-photo-row";
  if (initialUrl.startsWith("data:image")) {
    row.setAttribute("data-stored-url", initialUrl);
  }

  const preview = document.createElement("div");
  preview.className = "admin-photo-preview";
  if (
    initialUrl.startsWith("data:image") ||
    initialUrl.startsWith("http") ||
    initialUrl.startsWith("/") ||
    initialUrl.startsWith("public/")
  ) {
    const img = document.createElement("img");
    img.src = resolveShopMediaUrl(initialUrl) || initialUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      preview.textContent = "Aperçu";
    };
    preview.appendChild(img);
  } else {
    preview.textContent = "Aperçu";
  }

  const fields = document.createElement("div");
  fields.className = "admin-photo-fields";

  const urlInp = document.createElement("textarea");
  urlInp.className = "admin-inp admin-photo-url";
  urlInp.rows = 2;
  urlInp.placeholder =
    "URL (https://…) ou chemin relatif (ex. public/mon-produit.jpg). Laisser vide si vous utilisez le fichier ci-dessous.";
  if (initialUrl && !initialUrl.startsWith("data:image")) {
    urlInp.value = initialUrl;
  }

  urlInp.addEventListener("input", () => {
    row.removeAttribute("data-stored-url");
    const st = row.querySelector(".admin-photo-status");
    if (st) {
      st.textContent = "";
      st.classList.remove("is-ok", "is-error");
    }
  });

  const actions = document.createElement("div");
  actions.className = "admin-photo-actions";

  const fileInp = document.createElement("input");
  fileInp.type = "file";
  fileInp.className = "admin-photo-file";
  fileInp.accept = "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/*";
  fileInp.addEventListener("change", async () => {
    const f = fileInp.files && fileInp.files[0];
    fileInp.value = "";
    if (!f) return;
    await loadFileIntoRow(row, f);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "shop-btn-ghost";
  removeBtn.style.cssText = "min-height:36px;padding:0 0.75rem;font-size:0.65rem;";
  removeBtn.textContent = "Retirer la ligne";
  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  const status = document.createElement("div");
  status.className = "admin-photo-status";
  if (initialUrl.startsWith("data:image")) {
    status.textContent = "Image importée (données locales)";
    status.classList.add("is-ok");
  }

  actions.appendChild(fileInp);
  actions.appendChild(removeBtn);

  fields.appendChild(urlInp);
  fields.appendChild(actions);
  fields.appendChild(status);

  row.appendChild(preview);
  row.appendChild(fields);
  container.appendChild(row);
}

function collectPhotos(container) {
  const urls = [];
  container.querySelectorAll(".admin-photo-row").forEach((row) => {
    const stored = (row.getAttribute("data-stored-url") || "").trim();
    const inp = row.querySelector(".admin-photo-url");
    const typed = inp instanceof HTMLTextAreaElement ? inp.value.trim() : "";
    const v = stored || typed;
    if (v) urls.push(resolveShopMediaUrl(v) || v);
  });
  return urls;
}

function videoStatusLabel(p) {
  if (!productHasVideo(p)) return "—";
  if (isIdbVideoRef(p.videoUrl)) return "Locale (IDB)";
  if (String(p.videoUrl).startsWith("data:")) return "Locale (data)";
  return "Oui";
}

/**
 * @param {import("./shop-core.mjs").Product} p
 */
async function loadProductIntoForm(p) {
  const form = document.getElementById("admin-form");
  if (!(form instanceof HTMLFormElement)) return;
  const title = document.getElementById("admin-form-title");
  const idInp = document.getElementById("admin-product-id");
  if (idInp instanceof HTMLInputElement) idInp.value = p.id;
  if (title) title.textContent = "Modifier le produit";

  const setVal = (name, val) => {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = val;
    }
  };

  setVal("name", p.name);
  setVal("category", p.category);
  setVal("description", p.description);
  setVal("priceTnd", String(p.priceTnd));

  const ve = document.getElementById("admin-video-url");
  const vf = document.getElementById("admin-video-file");
  if (vf instanceof HTMLInputElement) vf.value = "";
  if (ve instanceof HTMLInputElement) {
    if (isIdbVideoRef(p.videoUrl)) {
      ve.value = p.videoUrl;
      setAdminStatus("Vidéo en stockage local (navigateur). Réimportez un fichier pour la remplacer.");
    } else {
      ve.value = p.videoUrl || "";
    }
  }

  const ph = document.getElementById("admin-photos");
  if (ph) {
    ph.innerHTML = "";
    const urls = Array.isArray(p.photos) && p.photos.length ? p.photos : ["", "", ""];
    urls.forEach((url) => addPhotoRow(ph, url));
    while (ph.querySelectorAll(".admin-photo-row").length < 3) addPhotoRow(ph);
  }

  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTable() {
  const tb = document.getElementById("admin-tbody");
  if (!tb) return;
  const list = getProducts().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (!list.length) {
    tb.innerHTML =
      '<tr><td colspan="6" style="padding:1.5rem;color:#8a8680;">Aucun produit.</td></tr>';
    return;
  }
  tb.innerHTML = list
    .map(
      (p) => `
    <tr>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);">${escapeHtml(p.name)}</td>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);">${escapeHtml(p.category)}</td>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);">${escapeHtml(String(p.priceTnd))} TND</td>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);font-size:0.72rem;color:var(--shop-muted);">${escapeHtml(videoStatusLabel(p))}</td>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);font-size:0.75rem;"><a href="./intro.html#shop/p/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Fiche</a></td>
      <td style="padding:0.65rem 0.85rem;border-bottom:1px solid rgba(201,162,39,0.12);white-space:nowrap;">
        <button type="button" class="admin-edit" data-id="${escapeHtml(p.id)}" style="background:transparent;border:1px solid rgba(201,162,39,0.45);color:#e8d5a3;cursor:pointer;padding:0.35rem 0.6rem;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;margin-right:0.35rem;">Modifier</button>
        <button type="button" class="admin-del" data-id="${escapeHtml(p.id)}" style="background:transparent;border:1px solid rgba(200,100,80,0.5);color:#e8a090;cursor:pointer;padding:0.35rem 0.6rem;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;">Supprimer</button>
      </td>
    </tr>`,
    )
    .join("");

  tb.querySelectorAll(".admin-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      const p = getProducts().find((x) => x.id === id);
      if (p) void loadProductIntoForm(p);
    });
  });

  tb.querySelectorAll(".admin-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id || !confirm("Supprimer ce produit ?")) return;
      deleteProduct(id);
      renderTable();
    });
  });
}

function resetForm() {
  const form = document.getElementById("admin-form");
  if (!(form instanceof HTMLFormElement)) return;
  form.reset();
  const title = document.getElementById("admin-form-title");
  if (title) title.textContent = "Nouveau produit";
  const idInp = document.getElementById("admin-product-id");
  if (idInp instanceof HTMLInputElement) idInp.value = "";
  const ph = document.getElementById("admin-photos");
  if (ph) {
    ph.innerHTML = "";
    addPhotoRow(ph);
    addPhotoRow(ph);
    addPhotoRow(ph);
  }
  const ve = document.getElementById("admin-video-url");
  if (ve) ve.value = "";
  const vf = document.getElementById("admin-video-file");
  if (vf) vf.value = "";
  setAdminStatus("");
}

function main() {
  const form = document.getElementById("admin-form");
  const phContainer = document.getElementById("admin-photos");
  const addPhBtn = document.getElementById("admin-add-photo");
  const bulkBtn = document.getElementById("admin-photos-bulk-btn");
  const bulkInput = document.getElementById("admin-photos-bulk");
  const videoFile = document.getElementById("admin-video-file");

  if (phContainer) {
    phContainer.innerHTML = "";
    addPhotoRow(phContainer);
    addPhotoRow(phContainer);
    addPhotoRow(phContainer);
  }

  addPhBtn?.addEventListener("click", () => {
    if (phContainer) addPhotoRow(phContainer);
  });

  bulkBtn?.addEventListener("click", () => {
    bulkInput?.click();
  });

  bulkInput?.addEventListener("change", async () => {
    const files = Array.from(bulkInput.files || []);
    bulkInput.value = "";
    if (!files.length || !phContainer) return;
    setAdminStatus(`Import de ${files.length} fichier(s)…`);
    let ok = 0;
    for (const f of files) {
      const isImage =
        (f.type && f.type.startsWith("image/")) ||
        /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(f.name);
      if (!isImage) continue;
      addPhotoRow(phContainer);
      const row = phContainer.lastElementChild;
      if (row) {
        await loadFileIntoRow(row, f);
        ok += 1;
      }
    }
    setAdminStatus(ok ? `${ok} image(s) importée(s). Vérifiez les aperçus puis enregistrez.` : "Aucune image valide sélectionnée.");
  });

  videoFile?.addEventListener("change", async () => {
    const f = videoFile.files && videoFile.files[0];
    const urlInp = document.getElementById("admin-video-url");
    if (!f || !(urlInp instanceof HTMLInputElement)) return;
    if (f.size > MAX_VIDEO_BYTES && !isRemoteMode()) {
      alert(
        "Vidéo trop volumineuse (max ~6 Mo pour le stockage local). Compressez la vidéo ou indiquez une URL hébergée.",
      );
      videoFile.value = "";
      return;
    }
    setAdminStatus("Lecture de la vidéo…");
    try {
      if (isRemoteMode() && getAdminKey()) {
        const { uploadMediaFile } = await import("./shop-remote.mjs");
        const url = await uploadMediaFile(f, f.name || "video.mp4");
        urlInp.value = url;
        setAdminStatus("Vidéo hébergée sur Vercel Blob.");
      } else {
        urlInp.value = await readFileAsDataUrl(f);
        setAdminStatus("Vidéo intégrée (données locales). Si l’enregistrement échoue, utilisez une URL.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lecture vidéo impossible.");
      setAdminStatus("");
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(form instanceof HTMLFormElement)) return;
    setAdminStatus("");
    const fd = new FormData(form);
    const phContainer = document.getElementById("admin-photos");
    let photos = collectPhotos(phContainer || document.body);
    const productId = String(fd.get("id") || "").trim() || newProductId();
    let videoUrl = String(fd.get("videoUrl") || "").trim();
    try {
      videoUrl = await persistProductVideoRef(productId, videoUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Impossible d’enregistrer la vidéo.";
      setAdminStatus(msg, "error");
      alert(msg);
      return;
    }

    let partial = {
      id: productId,
      name: fd.get("name"),
      category: fd.get("category"),
      description: fd.get("description"),
      priceTnd: Number(fd.get("priceTnd")),
      videoUrl,
      photos,
    };
    let v = validateProductInput(partial);
    if (!v.ok) {
      setAdminStatus(v.error, "error");
      alert(v.error);
      return;
    }

    const tryUpsert = () => {
      upsertProduct(v.product);
    };

    try {
      tryUpsert();
    } catch (err) {
      if (!isQuotaError(err) || !phContainer) {
        const msg =
          err instanceof Error ? err.message : "Impossible d’enregistrer le catalogue.";
        setAdminStatus(msg, "error");
        alert(msg);
        return;
      }
      setAdminStatus("Quota navigateur presque atteint — recompression des photos importées…");
      try {
        await recompressAllPhotoRowsInForm(phContainer, 75_000);
        photos = collectPhotos(phContainer);
        partial = { ...partial, photos };
        v = validateProductInput(partial);
        if (!v.ok) {
          throw err;
        }
        tryUpsert();
      } catch (err2) {
        if (isQuotaError(err2) && partial.videoUrl) {
          try {
            const rawVideo = String(fd.get("videoUrl") || "").trim();
            const ref = await persistProductVideoRef(productId, rawVideo);
            partial = { ...partial, videoUrl: ref };
            const vVid = validateProductInput(partial);
            if (vVid.ok) {
              upsertProduct(vVid.product);
              renderTable();
              resetForm();
              setAdminStatus(
                ref
                  ? "Produit enregistré. La vidéo est stockée dans le navigateur (IndexedDB), pas dans le quota catalogue."
                  : "Produit enregistré sans vidéo.",
              );
              return;
            }
          } catch {
            /* fall through */
          }
        }
        const msg =
          err2 instanceof Error ? err2.message : "Impossible d’enregistrer le catalogue.";
        setAdminStatus(msg, "error");
        alert(
          `${msg}\n\nSi une vidéo est intégrée en fichier, retirez-la ou utilisez une URL. Réduisez aussi le nombre de produits en base.`,
        );
        return;
      }
    }
    renderTable();
    resetForm();
    setAdminStatus("Produit enregistré avec succès.");
  });

  document.getElementById("admin-export")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(getProducts(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thebarber-products-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("admin-import")?.addEventListener("click", () => {
    document.getElementById("admin-import-file")?.click();
  });

  document.getElementById("admin-import-file")?.addEventListener("change", async (e) => {
    const inp = /** @type {HTMLInputElement} */ (e.target);
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("JSON invalide");
      const cleaned = [];
      for (const row of data) {
        const v = validateProductInput(row);
        if (v.ok) cleaned.push(v.product);
      }
      if (!cleaned.length) throw new Error("Aucun produit valide");
      if (!confirm(`Remplacer le catalogue par ${cleaned.length} produit(s) importé(s) ?`)) return;
      try {
        saveProducts(cleaned);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Impossible d’enregistrer.");
        inp.value = "";
        return;
      }
      renderTable();
      setAdminStatus("Import terminé.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import impossible");
    }
    inp.value = "";
  });

  document.getElementById("admin-clear-all")?.addEventListener("click", () => {
    if (!confirm("Effacer tous les produits ET le panier ?")) return;
    localStorage.removeItem(STORAGE_PRODUCTS);
    localStorage.removeItem(STORAGE_CART);
    renderTable();
    setAdminStatus("Catalogue effacé.");
  });

  renderTable();
  void migrateCatalogVideosToIdb().then(() => renderTable());
}

async function ensureAdminRemoteKey() {
  if (!isRemoteMode()) return;
  if (getAdminKey()) return;
  const key = window.prompt(
    "Clé administration (ADMIN_SECRET Vercel) — requise pour enregistrer le catalogue sur le serveur :",
  );
  if (key) setAdminKey(key.trim());
}

async function bootAdmin() {
  await whenStoreReady();
  await ensureAdminRemoteKey();
  main();
  initAdminDashboard();
  if (isRemoteMode() && getAdminKey()) {
    const migrated = await maybeMigrateLocalCatalogToServer();
    if (migrated) {
      setAdminStatus("Catalogue local migré vers le serveur Vercel.");
      renderTable();
    }
  }
}

bootAdmin();
