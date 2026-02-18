import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const { mockSend, mockGetSignedUrl } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
    },
    PutObjectCommand: class MockPutObject {
      Bucket: string;
      Key: string;
      Body: unknown;
      ContentType: string;
      constructor(params: any) {
        this.Bucket = params.Bucket;
        this.Key = params.Key;
        this.Body = params.Body;
        this.ContentType = params.ContentType;
      }
    },
    GetObjectCommand: class MockGetObject {
      Bucket: string;
      Key: string;
      constructor(params: any) {
        this.Bucket = params.Bucket;
        this.Key = params.Key;
      }
    },
    DeleteObjectCommand: class MockDeleteObject {
      Bucket: string;
      Key: string;
      constructor(params: any) {
        this.Bucket = params.Bucket;
        this.Key = params.Key;
      }
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

vi.mock('../../../config.js', () => ({
  config: {
    s3: {
      endpoint: 'https://s3.test.com',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      bucket: 'test-bucket',
      publicUrl: 'https://cdn.test.com',
    },
  },
}));

// Mock queue to prevent Redis connections
vi.mock('../../../jobs/queue.js', () => ({
  videoGenerateQueue: { add: vi.fn() },
  redisConnection: {},
}));

import { upload, download, getPresignedUrl, getPublicUrl, del } from '../s3-service.js';

describe('S3 storage service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('uploads with correct bucket, key, and content type', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await upload('videos/test.mp4', Buffer.from('data'), 'video/mp4');

      expect(result).toBe('videos/test.mp4');
      expect(mockSend).toHaveBeenCalledOnce();

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Bucket).toBe('test-bucket');
      expect(cmd.Key).toBe('videos/test.mp4');
      expect(cmd.ContentType).toBe('video/mp4');
    });

    it('accepts a Readable stream as body', async () => {
      mockSend.mockResolvedValueOnce({});
      const stream = Readable.from(['chunk1', 'chunk2']);

      const result = await upload('audio/test.mp3', stream, 'audio/mpeg');

      expect(result).toBe('audio/test.mp3');
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('accepts a string as body', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await upload('text/test.txt', 'hello', 'text/plain');

      expect(result).toBe('text/test.txt');
    });
  });

  describe('download', () => {
    it('returns stream from S3 response body', async () => {
      const mockStream = Readable.from(['data']);
      mockSend.mockResolvedValueOnce({ Body: mockStream });

      const result = await download('videos/test.mp4');

      expect(result).toBe(mockStream);
      expect(mockSend).toHaveBeenCalledOnce();

      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Bucket).toBe('test-bucket');
      expect(cmd.Key).toBe('videos/test.mp4');
    });
  });

  describe('getPresignedUrl', () => {
    it('generates presigned URL with default expiry', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed-url.example.com/test');

      const url = await getPresignedUrl('videos/test.mp4');

      expect(url).toBe('https://signed-url.example.com/test');
      expect(mockGetSignedUrl).toHaveBeenCalledOnce();

      const [, , options] = mockGetSignedUrl.mock.calls[0];
      expect(options.expiresIn).toBe(3600);
    });

    it('accepts custom expiry', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed-url.example.com/test');

      await getPresignedUrl('videos/test.mp4', 7200);

      const [, , options] = mockGetSignedUrl.mock.calls[0];
      expect(options.expiresIn).toBe(7200);
    });
  });

  describe('getPublicUrl', () => {
    it('constructs public URL from config base', () => {
      const url = getPublicUrl('videos/test.mp4');
      expect(url).toBe('https://cdn.test.com/videos/test.mp4');
    });

    it('strips trailing slashes from base URL', async () => {
      vi.resetModules();

      vi.doMock('../../../config.js', () => ({
        config: {
          s3: {
            endpoint: 'https://s3.test.com',
            accessKey: 'test-access-key',
            secretKey: 'test-secret-key',
            bucket: 'test-bucket',
            publicUrl: 'https://cdn.test.com/',
          },
        },
      }));

      const { getPublicUrl: freshGetPublicUrl } = await import('../s3-service.js');
      const url = freshGetPublicUrl('path/to/file.mp4');
      expect(url).toBe('https://cdn.test.com/path/to/file.mp4');
    });
  });

  describe('del', () => {
    it('sends delete command with correct bucket and key', async () => {
      mockSend.mockResolvedValueOnce({});

      await del('videos/test.mp4');

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.Bucket).toBe('test-bucket');
      expect(cmd.Key).toBe('videos/test.mp4');
    });

    it('propagates errors from s3.send', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 delete error'));

      await expect(del('videos/test.mp4')).rejects.toThrow('S3 delete error');
    });
  });

  describe('error propagation', () => {
    it('upload propagates errors from s3.send', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 upload error'));

      await expect(upload('key', Buffer.from('data'), 'text/plain')).rejects.toThrow('S3 upload error');
    });

    it('download propagates errors from s3.send', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 download error'));

      await expect(download('key')).rejects.toThrow('S3 download error');
    });

    it('getPresignedUrl propagates errors from getSignedUrl', async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error('Presign error'));

      await expect(getPresignedUrl('key')).rejects.toThrow('Presign error');
    });

    it('getPresignedUrl passes GetObjectCommand with correct bucket and key', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.example.com');

      await getPresignedUrl('videos/test.mp4');

      const cmd = mockGetSignedUrl.mock.calls[0][1];
      expect(cmd.Bucket).toBe('test-bucket');
      expect(cmd.Key).toBe('videos/test.mp4');
    });
  });
});
