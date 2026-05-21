import { put } from "@vercel/blob";
import { getMediaBlobAccess } from "./blob-access.mjs";
import { blobSdkAuthOptions } from "./blob-sdk-auth.mjs";

/** @param {unknown} err */
function shouldRetryAsPrivate(err, preferred) {
  if (preferred !== "public") return false;
  const msg = err instanceof Error ? err.message : String(err || "");
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  return (
    name === "BlobAccessError" ||
    /forbidden|access denied|not allowed|private store|public access|cannot use public/i.test(
      msg,
    )
  );
}

/**
 * put() média avec accès aligné sur le store (private par défaut).
 * @param {string} pathname
 * @param {Buffer | Uint8Array | string} body
 * @param {string} contentType
 * @param {{ multipart?: boolean }} [extra]
 */
export async function putMediaBlob(pathname, body, contentType, extra = {}) {
  const auth = blobSdkAuthOptions();
  const preferred = getMediaBlobAccess();
  const base = {
    ...auth,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    ...extra,
  };
  try {
    return {
      result: await put(pathname, body, { ...base, access: preferred }),
      access: preferred,
    };
  } catch (err) {
    if (!shouldRetryAsPrivate(err, preferred)) throw err;
    return {
      result: await put(pathname, body, { ...base, access: "private" }),
      access: "private",
    };
  }
}
