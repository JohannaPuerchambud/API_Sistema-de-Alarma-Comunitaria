import crypto from "crypto";

import admin, { storageBucketName } from "../config/firebase.js";

const DEFAULT_MEDIA_TTL_SECONDS = 15 * 60;
const MEDIA_PATH_PREFIX = "/api/media/images/";

const mediaSecret = () =>
  process.env.MEDIA_URL_SECRET || process.env.JWT_SECRET || "";

const defaultApiOrigin = () =>
  String(
    process.env.API_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      `http://localhost:${process.env.PORT || 4000}`,
  ).replace(/\/$/, "");

const decodeFirebaseObjectPath = (url) => {
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    objectPath: decodeURIComponent(match[2]),
    legacyDownloadToken: Boolean(url.searchParams.get("token")),
  };
};

export const parseStorageReference = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.startsWith("gs://")) {
    const withoutScheme = raw.slice(5);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0) return null;
    return {
      bucket: withoutScheme.slice(0, slashIndex),
      objectPath: withoutScheme.slice(slashIndex + 1),
      legacyDownloadToken: false,
    };
  }

  try {
    const url = new URL(raw);
    if (url.hostname === "firebasestorage.googleapis.com") {
      return decodeFirebaseObjectPath(url);
    }

    if (url.hostname === "storage.googleapis.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;
      return {
        bucket: decodeURIComponent(segments[0]),
        objectPath: decodeURIComponent(segments.slice(1).join("/")),
        legacyDownloadToken: false,
      };
    }

    if (url.hostname === `${storageBucketName}.storage.googleapis.com`) {
      return {
        bucket: storageBucketName,
        objectPath: decodeURIComponent(url.pathname.replace(/^\//, "")),
        legacyDownloadToken: false,
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const privateStorageReference = (bucket, objectPath) =>
  `gs://${bucket}/${objectPath}`;

const signPayload = (encodedPayload) =>
  crypto
    .createHmac("sha256", mediaSecret())
    .update(encodedPayload)
    .digest("base64url");

const revokeLegacyDownloadToken = async (reference) => {
  if (!reference.legacyDownloadToken) return;

  try {
    const storageFile = admin
      .storage()
      .bucket(reference.bucket)
      .file(reference.objectPath);
    const [metadata] = await storageFile.getMetadata();
    const customMetadata = { ...(metadata.metadata || {}) };
    delete customMetadata.firebaseStorageDownloadTokens;
    await storageFile.setMetadata({ metadata: customMetadata });
  } catch (error) {
    console.warn("No se pudo revocar un token antiguo de evidencia:", {
      objectPath: reference.objectPath,
      message: error.message,
    });
  }
};

export const createProtectedMediaUrl = async (
  value,
  { origin = defaultApiOrigin(), ttlSeconds = DEFAULT_MEDIA_TTL_SECONDS } = {},
) => {
  const reference = parseStorageReference(value);
  if (!reference || reference.bucket !== storageBucketName) return value || null;

  if (!mediaSecret()) {
    throw new Error(
      "No se puede proteger la evidencia porque JWT_SECRET no est? configurado.",
    );
  }

  await revokeLegacyDownloadToken(reference);

  const payload = Buffer.from(
    JSON.stringify({
      bucket: reference.bucket,
      objectPath: reference.objectPath,
      expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
    }),
  ).toString("base64url");
  const signature = signPayload(payload);

  return `${String(origin).replace(/\/$/, "")}${MEDIA_PATH_PREFIX}${payload}.${signature}`;
};

export const verifyProtectedMediaToken = (token) => {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !mediaSecret()) return null;

  const expectedSignature = signPayload(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      decoded.bucket !== storageBucketName ||
      !decoded.objectPath ||
      Number(decoded.expiresAt) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

export const requestOrigin = (req) =>
  `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
