/**
 * Auth options for @vercel/blob (OIDC on Vercel, token locally / CI).
 * @returns {import("@vercel/blob").BlobCommandOptions}
 */
export function blobSdkAuthOptions() {
  const rw = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (rw) return { token: rw };

  const oidc = String(process.env.VERCEL_OIDC_TOKEN || "").trim();
  let storeId = String(process.env.BLOB_STORE_ID || "").trim();
  if (storeId && !storeId.startsWith("store_")) {
    storeId = `store_${storeId}`;
  }
  if (oidc && storeId) {
    return { oidcToken: oidc, storeId };
  }
  return {};
}
