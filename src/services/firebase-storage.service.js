import admin from "../config/firebase.js";
import { privateStorageReference } from "./protected-media.service.js";

const safeFileName = (value) =>
  String(value || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-160);

export const uploadImageToFirebase = async ({
  upload,
  folder,
  prefix,
}) => {
  const bucket = admin.storage().bucket();
  const fileName =
    `${folder}/${prefix}_${Date.now()}_${safeFileName(upload.originalname)}`;
  const storageFile = bucket.file(fileName);

  await storageFile.save(upload.buffer, {
    resumable: false,
    metadata: {
      contentType: upload.mimetype,
      cacheControl: "private, max-age=300",
    },
  });

  return {
    imageUrl: privateStorageReference(bucket.name, fileName),
    storageFile,
    accessMethod: "protected_media",
  };
};

export const deleteFirebaseFile = async (storageFile) => {
  if (!storageFile) return;
  await storageFile.delete({ ignoreNotFound: true });
};