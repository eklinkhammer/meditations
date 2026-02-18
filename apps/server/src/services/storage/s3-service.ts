import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config.js';

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: 'auto',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

const bucket = config.s3.bucket;

export async function upload(
  key: string,
  body: Readable | Buffer | string,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function download(key: string): Promise<Readable> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!res.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }
  return res.Body as Readable;
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export function getPublicUrl(key: string): string {
  const base = config.s3.publicUrl.replace(/\/+$/, '');
  return `${base}/${key}`;
}

export async function del(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}
