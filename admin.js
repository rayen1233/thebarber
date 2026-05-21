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
} from "./shop-core.js";
import {
  persistProductVideoRef,
  migrateCatalogVideosToIdb,
  productHasVideo,
  isIdbVideoRef,
  idbVideoProductId,
  getProductVideoObjectUrl,
} from "./shop-media-store.js";
import { saveUsers, saveOrders } from "./shop-account-store.js";
import { initAdminDashboard, refreshAdminDashboard } from "./admin-dashboard.js";
import {
  hydrateRemoteStore,
  parseCatalogImportJson,
  migrateIdbVideosToRemote,
  restoreCatalogMediaFromSource,
} from "./shop-remote.js?v=20260522-uploadfast";
import {
  getAdminCatalogProducts,
  refreshAdminCatalog,
  adminDeleteProduct,
  adminSaveProduct,
  adminReplaceCatalog,
  initAdminCatalogConnection,
  onAdminCatalogUpdated,
  usesAdminDatabase,
  getRemoteApiBase,
  setRemoteApiBase,
  DEFAULT_REMOTE_API_BASE,
  getAdminKey,
  setAdminKey,
  isRemoteMode,
} from "./shop-admin-catalog.js";
import { MAX_VIDEO_BYTES } from "./lib/media-limits.js";

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

/** @type {Map<string, string>} */
const photoRowDataCache = new Map();
let photoRowSeq = 0;

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
    const rowId = row.dataset.photoRowId || "";
    const stored = (rowId && photoRowDataCache.get(rowId)) || "";
    if (!stored.startsWith("data:image")) continue;
    const next = await recompressDataUrlToTarget(stored, maxBytesPerImage);
    if (rowId) photoRowDataCache.set(rowId, next);
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

  const rowId = row.dataset.photoRowId || `ph-${++photoRowSeq}`;
  row.dataset.photoRowId = rowId;
  photoRowDataCache.delete(rowId);
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
    photoRowDataCache.set(rowId, dataUrl);
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
  const rowId = `ph-${++photoRowSeq}`;
  row.dataset.photoRowId = rowId;

  const url = String(initialUrl || "").trim();
  if (url.startsWith("data:image")) {
    photoRowDataCache.set(rowId, url);
  }

  const preview = document.createElement("div");
  preview.className = "admin-photo-preview";
  if (
    url.startsWith("data:image") ||
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("public/")
  ) {
    const img = document.createElement("img");
    img.src = resolveShopMediaUrl(url) || url;
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
  if (url && !url.startsWith("data:image")) {
    urlInp.value = url;
  }

  urlInp.addEventListener("input", () => {
    photoRowDataCache.delete(rowId);
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
    photoRowDataCache.delete(rowId);
    row.remove();
  });

  const status = document.createElement("div");
  status.className = "admin-photo-status";
  if (url.startsWith("data:image")) {
    status.textContent = "Image en mémoire — « Retirer » ou choisir un fichier pour remplacer";
    status.classList.add("is-ok");
  } else if (url.startsWith("http")) {
    status.textContent = "Image en ligne (URL Blob)";
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
    const rowId = row.dataset.photoRowId || "";
    const cached = rowId ? photoRowDataCache.get(rowId) || "" : "";
    const inp = row.querySelector(".admin-photo-url");
    const typed = inp instanceof HTMLTextAreaElement ? inp.value.trim() : "";
    const v = cached || typed;
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

/** @param {string} rawUrl */
async function refreshAdminVideoPreview(rawUrl) {
  const wrap = document.getElementById("admin-video-preview-wrap");
  const video = document.getElementById("admin-video-preview");
  const label = document.getElementById("admin-video-preview-label");
  if (!(wrap instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) return;

  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    wrap.hidden = true;
    video.removeAttribute("src");
    video.load();
    if (label) label.textContent = "";
    return;
  }

  let src = trimmed;
  if (isIdbVideoRef(trimmed)) {
    const id = idbVideoProductId(trimmed);
    src = (await getProductVideoObjectUrl(id)) || "";
    if (!src) {
      wrap.hidden = true;
      if (label) label.textContent = "Vidéo locale — choisissez un fichier pour publier en ligne.";
      return;
    }
    if (label) label.textContent = "Aperçu (stockage local)";
  } else {
    src = resolveShopMediaUrl(trimmed) || trimmed;
    if (label) label.textContent = "Aperçu vidéo";
  }

  wrap.hidden = false;
  video.src = src;
  video.load();
}

/**
 * @param {import("./shop-core.js").Product} p
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
      ve.value = "";
      setAdminStatus(
        "Vidéo non publiée en ligne (stockage local). Choisissez un fichier vidéo ci-dessous puis enregistrez.",
        "error",
      );
    } else {
      ve.value = p.videoUrl || "";
    }
    void refreshAdminVideoPreview(ve.value);
  }

  const ph = document.getElementById("admin-photos");
  if (ph) {
    ph.innerHTML = "";
    photoRowDataCache.clear();
    const urls = Array.isArray(p.photos) && p.photos.length ? p.photos : [""];
    urls.forEach((url) => addPhotoRow(ph, url));
    if (ph.querySelectorAll(".admin-photo-row").length < 1) addPhotoRow(ph);
  }

  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTable() {
  const tb = document.getElementById("admin-tbody");
  if (!tb) return;
  const list = getAdminCatalogProducts().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
      const p = getAdminCatalogProducts().find((x) => x.id === id);
      if (p) void loadProductIntoForm(p);
    });
  });

  tb.querySelectorAll(".admin-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!id || !confirm("Supprimer ce produit ?")) return;
      await ensureAdminRemoteKey();
      if (!getAdminKey() && usesAdminDatabase()) {
        setAdminStatus("Clé admin requise.", "error");
        return;
      }
      btn.disabled = true;
      setAdminStatus("Suppression sur la base…");
      try {
        const out = await adminDeleteProduct(id);
        renderTable();
        setAdminStatus(
          `Produit supprimé — ${out.productCount} produit(s) en base.`,
        );
        void initRemoteSyncBanner();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Suppression impossible.";
        setAdminStatus(msg, "error");
        alert(msg);
        await refreshAdminCatalog().catch(() => {});
        renderTable();
      } finally {
        btn.disabled = false;
      }
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
    photoRowDataCache.clear();
    addPhotoRow(ph);
    addPhotoRow(ph);
    addPhotoRow(ph);
  }
  const ve = document.getElementById("admin-video-url");
  if (ve) ve.value = "";
  void refreshAdminVideoPreview("");
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

  document.getElementById("admin-video-url")?.addEventListener("input", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement) void refreshAdminVideoPreview(el.value);
  });

  videoFile?.addEventListener("change", async () => {
    const f = videoFile.files && videoFile.files[0];
    const urlInp = document.getElementById("admin-video-url");
    if (!f || !(urlInp instanceof HTMLInputElement)) return;
    if (f.size > MAX_VIDEO_BYTES) {
      alert(
        "Vidéo trop volumineuse (maximum 6 Mo). Compressez la vidéo, utilisez une URL externe, ou réduisez la durée.",
      );
      videoFile.value = "";
      return;
    }
    setAdminStatus("Lecture de la vidéo…");
    try {
      if ((isRemoteMode() || getAdminKey()) && usesAdminDatabase()) {
        const { uploadMediaBlob } = await import("./shop-remote.js?v=20260522-uploadfast");
        setAdminStatus("Envoi direct vers Vercel Blob (max 6 Mo)…");
        const { normalizeVideoUrlForCatalog } = await import("./lib/blob-media-url.mjs");
        const url = await uploadMediaBlob(f, f.name || "video.mp4", {
          onProgress: (p) => {
            if (p?.percentage != null) {
              setAdminStatus(`Vidéo : ${Math.round(p.percentage)} %…`);
            }
          },
        });
        urlInp.value = normalizeVideoUrlForCatalog(url);
        await refreshAdminVideoPreview(urlInp.value);
        setAdminStatus(
          "Vidéo envoyée sur Vercel — cliquez « Enregistrer le produit » pour qu’elle apparaisse sur la boutique en ligne.",
          "error",
        );
        const idInp = document.getElementById("admin-product-id");
        const isEdit =
          idInp instanceof HTMLInputElement && Boolean(idInp.value.trim());
        const formEl = document.getElementById("admin-form");
        if (
          isEdit &&
          getAdminKey() &&
          usesAdminDatabase() &&
          formEl instanceof HTMLFormElement
        ) {
          setAdminStatus("Vidéo en ligne — enregistrement du produit sur la base…");
          formEl.requestSubmit();
        }
      } else {
        urlInp.value = await readFileAsDataUrl(f);
        await refreshAdminVideoPreview(urlInp.value);
        setAdminStatus(
          "Vidéo stockée sur cet ordinateur seulement (pas visible sur thebarber-three.vercel.app). Connectez la clé admin et ré-uploadez depuis l’admin en ligne.",
          "error",
        );
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

    const finishSave = async (product) => {
      await ensureAdminRemoteKey();
      setAdminStatus("Enregistrement sur la base…");
      const out = await adminSaveProduct(product, {
        onProgress: (msg) => setAdminStatus(msg),
      });
      renderTable();
      resetForm();
      setAdminStatus(
        `Produit enregistré — ${out.productCount} produit(s) en base.`,
      );
      void initRemoteSyncBanner();
    };

    try {
      if (usesAdminDatabase() && getAdminKey()) {
        await finishSave(v.product);
        return;
      }
      if (isRemoteMode() && !getAdminKey()) {
        setAdminStatus("Clé admin requise pour enregistrer sur la base.", "error");
        alert("Saisissez la clé admin (ADMIN_SECRET).");
        return;
      }
      upsertProduct(v.product, { skipRemoteSync: false });
      renderTable();
      resetForm();
      setAdminStatus("Produit enregistré avec succès.");
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
        upsertProduct(v.product, { skipRemoteSync: isRemoteMode() });
        if (isRemoteMode() && getAdminKey()) {
          await pushProductToRemote(v.product, { onProgress: (msg) => setAdminStatus(msg) });
        }
        renderTable();
        resetForm();
        setAdminStatus("Produit enregistré (photos recompressées).");
        return;
      } catch (err2) {
        if (isQuotaError(err2) && partial.videoUrl) {
          try {
            const rawVideo = String(fd.get("videoUrl") || "").trim();
            const ref = await persistProductVideoRef(productId, rawVideo);
            partial = { ...partial, videoUrl: ref };
            const vVid = validateProductInput(partial);
            if (vVid.ok) {
              upsertProduct(vVid.product, { skipRemoteSync: isRemoteMode() });
              if (isRemoteMode() && getAdminKey()) {
                await pushProductToRemote(vVid.product);
              }
              renderTable();
              resetForm();
              setAdminStatus(
                isIdbVideoRef(ref)
                  ? "Produit enregistré localement. Uploadez la vidéo sur Vercel via le champ fichier."
                  : "Produit enregistré.",
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
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      products: getAdminCatalogProducts(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thebarber-catalogue-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setAdminStatus("Export catalogue téléchargé (produits, comptes, commandes).");
  });

  document.getElementById("admin-import")?.addEventListener("click", async () => {
    await ensureAdminRemoteKey();
    if (!getAdminKey()) {
      const go = confirm(
        "Sans clé admin, l’import reste uniquement dans ce navigateur.\n\nContinuer en local ?",
      );
      if (!go) return;
    }
    document.getElementById("admin-import-file")?.click();
  });

  document.getElementById("admin-import-file")?.addEventListener("change", async (e) => {
    const inp = /** @type {HTMLInputElement} */ (e.target);
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        const hint =
          parseErr instanceof Error ? parseErr.message : "syntaxe incorrecte";
        throw new Error(`Fichier JSON illisible (${hint}). Réexportez depuis l’admin localhost.`);
      }
      const parsed = parseCatalogImportJson(data);
      if (!parsed) {
        throw new Error(
          "Format non reconnu. Attendu : tableau de produits, ou objet { products, users?, orders? } (export « catalogue JSON »).",
        );
      }
      const rows = parsed.products;
      const cleaned = [];
      const rejectReasons = [];
      for (const row of rows) {
        const v = validateProductInput(row);
        if (v.ok) cleaned.push(v.product);
        else if (rejectReasons.length < 4) {
          rejectReasons.push(`${String(row?.name || "Produit").slice(0, 40)} : ${v.error}`);
        }
      }
      if (!cleaned.length) {
        const detail = rejectReasons.length
          ? `\n\n${rejectReasons.join("\n")}`
          : "";
        throw new Error(`Aucun produit valide sur ${rows.length} entrée(s).${detail}`);
      }
      const extra =
        parsed.users.length || parsed.orders.length ? " + comptes/commandes" : "";
      const idbNote = cleaned.some((p) => isIdbVideoRef(p.videoUrl))
        ? "\n\nCertaines vidéos sont en stockage local (idb://) : ré-uploadez-les sur Vercel après import."
        : "";
      if (
        !confirm(
          `Remplacer le catalogue par ${cleaned.length} produit(s) importé(s)${extra} ?${idbNote}`,
        )
      )
        return;
      await ensureAdminRemoteKey();
      if (usesAdminDatabase() && getAdminKey()) {
        try {
          const skipped = rows.length - cleaned.length;
          setAdminStatus("Import vers la base…");
          const out = await adminReplaceCatalog(
            cleaned,
            {
              users: parsed.users,
              orders: parsed.orders,
            },
            { onProgress: (msg) => setAdminStatus(msg) },
          );
          if (parsed.users.length) saveUsers(parsed.users);
          if (parsed.orders.length) saveOrders(parsed.orders);
          renderTable();
          const skipNote =
            skipped > 0 ? ` (${skipped} ignorée(s))` : "";
          const warn = out.warning ? `\n\n${out.warning}` : "";
          setAdminStatus(
            `Import terminé : ${out.productCount} produit(s) en base${skipNote}.`,
            "",
          );
          setRemoteBannerStatus("Catalogue en ligne à jour.");
          if (out.warning) alert(`Import terminé avec avertissements.${warn}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Import impossible.";
          setAdminStatus(msg, "error");
          setRemoteBannerStatus(msg, true);
          alert(msg);
        }
        inp.value = "";
        return;
      }
      try {
        saveProducts(cleaned);
        if (parsed.users.length) saveUsers(parsed.users);
        if (parsed.orders.length) saveOrders(parsed.orders);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Impossible d’enregistrer.");
        inp.value = "";
        return;
      }
      renderTable();
      setAdminStatus("Import terminé (local). Sur Vercel : exportez ce fichier puis importez-le là-bas.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import impossible");
    }
    inp.value = "";
  });

  document.getElementById("admin-restore-media")?.addEventListener("click", async () => {
    await ensureAdminRemoteKey();
    if (!usesAdminDatabase() || !getAdminKey()) {
      alert("Clé admin + connexion Vercel requises (ou admin sur thebarber-three.vercel.app).");
      return;
    }
    document.getElementById("admin-restore-media-file")?.click();
  });

  document.getElementById("admin-restore-media-file")?.addEventListener("change", async (e) => {
    const inp = /** @type {HTMLInputElement} */ (e.target);
    const file = inp.files && inp.files[0];
    inp.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const parsed = parseCatalogImportJson(data);
      if (!parsed?.products?.length) {
        throw new Error("JSON sans liste de produits.");
      }
      const withMedia = parsed.products.filter((p) => {
        const photos = Array.isArray(p?.photos) ? p.photos : [];
        const v = String(p?.videoUrl || "");
        return (
          photos.some((u) => String(u).startsWith("data:")) ||
          v.startsWith("data:") ||
          isIdbVideoRef(v)
        );
      });
      if (!withMedia.length) {
        alert(
          "Ce JSON ne contient pas de photos data: ni de vidéos intégrées.\n\nUtilisez l’export fait depuis l’admin où vous aviez ajouté les images, ou ré-uploadez fichier par fichier dans chaque produit.",
        );
        return;
      }
      if (
        !confirm(
          `Envoyer les médias de ${withMedia.length} produit(s) vers Vercel Blob ?\n\nCela peut prendre plusieurs minutes. Gardez l’onglet ouvert.`,
        )
      ) {
        return;
      }
      setAdminStatus("Publication des médias vers Blob…");
      const result = await restoreCatalogMediaFromSource(parsed.products, {
        onProgress: (msg) => setAdminStatus(msg),
      });
      await refreshAdminCatalog();
      renderTable();
      refreshMigrateVideosButton();
      const summary = `${result.updated} mis à jour, ${result.skipped} sans média dans le JSON, ${result.failed} erreur(s).`;
      setAdminStatus(summary);
      alert(`${summary}\n\nRechargez la boutique pour voir les images.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Publication médias impossible.";
      setAdminStatus(msg, "error");
      alert(msg);
    }
  });

  document.getElementById("admin-reload-server")?.addEventListener("click", async () => {
    await ensureAdminRemoteKey();
    setAdminStatus("Rechargement depuis la base…");
    try {
      const h = await refreshAdminCatalog();
      renderTable();
      void initRemoteSyncBanner();
      setAdminStatus(`${h.productCount ?? 0} produit(s) chargés depuis la base.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rechargement impossible.";
      setAdminStatus(msg, "error");
      alert(msg);
    }
  });

  document.getElementById("admin-clear-all")?.addEventListener("click", async () => {
    if (!confirm("Effacer tous les produits ET le panier ?")) return;
    localStorage.removeItem(STORAGE_CART);
    await ensureAdminRemoteKey();
    if (!getAdminKey()) {
      setAdminStatus("Clé admin requise pour vider la base.", "error");
      return;
    }
    setAdminStatus("Effacement de la base…");
    try {
      await adminReplaceCatalog([], { users: [], orders: [] });
      renderTable();
      setAdminStatus("Catalogue effacé sur la base.");
      void initRemoteSyncBanner();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Effacement impossible.";
      setAdminStatus(msg, "error");
      alert(msg);
    }
  });

  document.getElementById("admin-migrate-videos")?.addEventListener("click", async () => {
    const baseDefault = "https://thebarber-three.vercel.app";
    const baseUrl = window
      .prompt("URL du site Vercel :", baseDefault)
      ?.trim()
      .replace(/\/$/, "");
    if (!baseUrl) return;
    await ensureAdminRemoteKey();
    let adminKey = getAdminKey();
    if (!adminKey) {
      adminKey = window.prompt("Clé admin (ADMIN_SECRET Vercel) :")?.trim() || "";
      if (adminKey) setAdminKey(adminKey);
    }
    if (!adminKey) {
      alert("Clé admin requise.");
      return;
    }
    const n = getAdminCatalogProducts().filter((p) => isIdbVideoRef(p.videoUrl)).length;
    if (
      !confirm(
        `Envoyer ${n} vidéo(s) depuis ce navigateur vers Vercel Blob ?\n\nGardez le même navigateur où vous avez créé les produits.`,
      )
    ) {
      return;
    }
    setAdminStatus("Migration des vidéos en cours…");
    try {
      const result = await migrateIdbVideosToRemote({
        baseUrl,
        adminKey,
        onProgress: (msg) => setAdminStatus(msg),
      });
      renderTable();
      refreshMigrateVideosButton();
      const summary = `${result.uploaded} envoyée(s), ${result.skipped} ignorée(s), ${result.failed} erreur(s).`;
      setAdminStatus(summary);
      alert(
        result.uploaded
          ? `${summary}\n\nRechargez le site en ligne pour voir les vidéos.`
          : `${summary}\n\n${result.message || "Ouvrez l’admin sur le même PC/navigateur où les vidéos ont été ajoutées."}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Migration impossible.";
      setAdminStatus(msg, "error");
      alert(msg);
    }
  });

  renderTable();
  refreshMigrateVideosButton();
  void migrateCatalogVideosToIdb().then(() => {
    renderTable();
    refreshMigrateVideosButton();
  });
}

function refreshMigrateVideosButton() {
  const btn = document.getElementById("admin-migrate-videos");
  if (!btn) return;
  const hasIdb = getAdminCatalogProducts().some((p) => isIdbVideoRef(p.videoUrl));
  btn.hidden = isRemoteMode() || !hasIdb;
}

function setRemoteBannerStatus(message, isError = false) {
  const el = document.getElementById("admin-remote-status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#d8a090" : "var(--shop-muted)";
}

function initLocalhostDbPanel() {
  const panel = document.getElementById("admin-localhost-db");
  if (!panel || isRemoteMode()) return;
  panel.hidden = false;
  const urlInp = document.getElementById("admin-remote-url");
  if (urlInp instanceof HTMLInputElement) {
    urlInp.value = getRemoteApiBase();
    urlInp.addEventListener("change", () => setRemoteApiBase(urlInp.value));
  }
  document.getElementById("admin-connect-db")?.addEventListener("click", async () => {
    if (urlInp instanceof HTMLInputElement) setRemoteApiBase(urlInp.value);
    await ensureAdminRemoteKey();
    if (!getAdminKey()) {
      alert("Clé admin (ADMIN_SECRET) requise.");
      return;
    }
    setAdminStatus("Connexion à la base Vercel…");
    const h = await refreshAdminCatalog();
    renderTable();
    void initRemoteSyncBanner();
    setAdminStatus(
      h.ok
        ? `Connecté — ${h.productCount ?? 0} produit(s) chargés depuis la base.`
        : "Connexion impossible — vérifiez l’URL et la clé admin.",
      !h.ok,
    );
  });
}

async function initRemoteSyncBanner() {
  const banner = document.getElementById("admin-remote-banner");
  if (!banner) return;
  if (!isRemoteMode() && !usesAdminDatabase()) return;
  banner.hidden = false;
  const n = getAdminCatalogProducts().length;
  try {
    const healthUrl = isRemoteMode() ? "/api/health" : `${getRemoteApiBase()}/api/health`;
    const healthRes = await fetch(healthUrl, { cache: "no-store" });
    const health = healthRes.ok ? await healthRes.json().catch(() => ({})) : {};
    const serverCount =
      typeof health.productCount === "number" ? health.productCount : n;
    const dbOk = health.ok !== false && health.env?.blob !== false;

    if (!dbOk) {
      setRemoteBannerStatus(
        "⚠ Base serveur indisponible (BLOB_READ_WRITE_TOKEN ou ADMIN_SECRET manquant sur Vercel). Redeploy après configuration.",
        true,
      );
      return;
    }
    if (!getAdminKey()) {
      setRemoteBannerStatus(
        `Base serveur : ${serverCount} produit(s). Saisissez la clé admin pour modifier le catalogue.`,
        true,
      );
      return;
    }
    if (serverCount !== n) {
      setRemoteBannerStatus(
        `Connecté — base serveur : ${serverCount} produit(s), affichage admin : ${n}. Rechargez si les chiffres divergent.`,
        serverCount > n,
      );
      return;
    }
    setRemoteBannerStatus(
      `Connecté à la base serveur — ${serverCount} produit(s) (source de vérité).`,
    );
  } catch {
    setRemoteBannerStatus("Impossible de joindre la base serveur (/api/health).", true);
  }
}

async function ensureAdminRemoteKey() {
  if (getAdminKey()) return;
  const key = window.prompt(
    "Clé administration (ADMIN_SECRET Vercel) — requise pour enregistrer le catalogue sur le serveur :",
  );
  if (key) setAdminKey(key.trim());
}

function bindAdminStoreRefresh() {
  onAdminCatalogUpdated(() => {
    renderTable();
    refreshMigrateVideosButton();
    void initRemoteSyncBanner();
  });
}

async function hydrateAdminUsersOrders() {
  if (!isRemoteMode()) return;
  try {
    await hydrateRemoteStore({
      serverWins: false,
      allowIdbFallback: false,
      usersOrdersOnly: true,
    });
    refreshAdminDashboard();
  } catch (err) {
    console.warn("[thebarber] admin users/orders hydrate failed", err);
  }
}

async function bootAdmin() {
  initLocalhostDbPanel();
  bindAdminStoreRefresh();
  if (isRemoteMode()) {
    void hydrateAdminUsersOrders();
    window.addEventListener("thebarber:store-hydrated", () => refreshAdminDashboard());
  }
  await ensureAdminRemoteKey();
  if (getAdminKey() || isRemoteMode()) {
    try {
      const h = await initAdminCatalogConnection();
      if (!h.ok && h.reason === "no-key" && isRemoteMode()) {
        setAdminStatus("Saisissez la clé admin pour lier la base Vercel.", "error");
      } else if (h.ok) {
        setAdminStatus(`${h.productCount ?? 0} produit(s) — base serveur connectée.`);
      }
    } catch (err) {
      setAdminStatus(
        err instanceof Error ? err.message : "Connexion base impossible.",
        "error",
      );
    }
  } else {
    const { getProducts } = await import("./shop-core.js");
    const { refreshAdminCatalog: refreshLocal } = await import("./shop-admin-catalog.js");
    await refreshLocal().catch(() => {});
  }
  const videoHint = document.getElementById("admin-video-hint");
  if (videoHint && isRemoteMode()) videoHint.style.display = "block";
  main();
  renderTable();
  void initRemoteSyncBanner();
  initAdminDashboard();
}

bootAdmin();
