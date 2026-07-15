import crypto from "crypto";

import admin from "../config/firebase.js";

const signedUrlExpiration = "01-01-2035";

const safeFileName = (value) =>
  String(value || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-160);

const firebaseDownloadUrl = (bucketName, fileName, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;

export const uploadImageToFirebase = async ({
  upload,
  folder,
  prefix,
}) => {
  const bucket = admin.storage().bucket();
  const fileName =
    `${folder}/${prefix}_${Date.now()}_${safeFileName(upload.originalname)}`;
  const storageFile = bucket.file(fileName);
  const downloadToken = crypto.randomUUID();

  try {
    await storageFile.save(upload.buffer, {
      resumable: false,
      metadata: {
        contentType: upload.mimetype,
        cacheControl: "private, max-age=3600",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    return {
      imageUrl: firebaseDownloadUrl(bucket.name, fileName, downloadToken),
      storageFile,
      accessMethod: "download_token",
    };
  } catch (tokenUploadError) {
    console.warn(
      "Falló la carga con token de descarga; intentando URL firmada:",
      tokenUploadError.message,
    );

    try {
      await storageFile.save(upload.buffer, {
        resumable: false,
        metadata: {
          contentType: upload.mimetype,
          cacheControl: "private, max-age=3600",
        },
      });

      const [signedUrl] = await storageFile.getSignedUrl({
        action: "read",
        expires: signedUrlExpiration,
      });

      return {
        imageUrl: signedUrl,
        storageFile,
        accessMethod: "signed_url",
      };
    } catch (signedUploadError) {
      const error = new Error(
        "Firebase Storage rechazó la imagen con ambos métodos de acceso.",
        { cause: signedUploadError },
      );
      error.code =
        signedUploadError.code || tokenUploadError.code || "storage_upload_failed";
      error.details = {
        tokenMethod: tokenUploadError.message,
        signedMethod: signedUploadError.message,
        bucket: bucket.name,
      };
      throw error;
    }
  }
};

export const deleteFirebaseFile = async (storageFile) => {
  if (!storageFile) return;
  await storageFile.delete({ ignoreNotFound: true });
};