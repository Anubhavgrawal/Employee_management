import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const client = new S3Client({
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT || undefined,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  credentials: env.STORAGE_ACCESS_KEY_ID ? { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY! } : undefined,
});

export const objectStorage = {
  async put(key: string, body: Buffer, contentType: string) {
    await client.send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: env.STORAGE_SSE || undefined }));
  },
  async remove(key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  },
  async downloadUrl(key: string) {
    return getSignedUrl(client, new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }), { expiresIn: env.STORAGE_DOWNLOAD_URL_TTL_SECONDS });
  },
};