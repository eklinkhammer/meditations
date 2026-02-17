import { describe, it, expect } from 'vitest';
import { videoSchema, videoFilterSchema, videoListItemSchema } from '../video';

const validVideo = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  title: 'Peaceful Meditation',
  storageKey: 'videos/abc123.mp4',
  durationSeconds: 120,
  visibility: 'public' as const,
  moderationStatus: 'approved' as const,
  visualPrompt: 'A peaceful mountain scene',
  tags: ['meditation', 'nature'],
  viewCount: 0,
  likeCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('videoSchema', () => {
  it('accepts a valid video', () => {
    const result = videoSchema.safeParse(validVideo);
    expect(result.success).toBe(true);
  });

  describe('title length constraints', () => {
    it('accepts title with 1 character', () => {
      const result = videoSchema.safeParse({ ...validVideo, title: 'A' });
      expect(result.success).toBe(true);
    });

    it('accepts title with 200 characters', () => {
      const result = videoSchema.safeParse({ ...validVideo, title: 'x'.repeat(200) });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = videoSchema.safeParse({ ...validVideo, title: '' });
      expect(result.success).toBe(false);
    });

    it('rejects title over 200 characters', () => {
      const result = videoSchema.safeParse({ ...validVideo, title: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  it('accepts all visibility values', () => {
    for (const visibility of ['public', 'private', 'pending_review', 'rejected']) {
      const result = videoSchema.safeParse({ ...validVideo, visibility });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all moderation status values', () => {
    for (const moderationStatus of ['pending', 'approved', 'rejected']) {
      const result = videoSchema.safeParse({ ...validVideo, moderationStatus });
      expect(result.success).toBe(true);
    }
  });

  it('rejects negative viewCount', () => {
    const result = videoSchema.safeParse({ ...validVideo, viewCount: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative likeCount', () => {
    const result = videoSchema.safeParse({ ...validVideo, likeCount: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive durationSeconds', () => {
    const result = videoSchema.safeParse({ ...validVideo, durationSeconds: 0 });
    expect(result.success).toBe(false);
  });
});

describe('videoFilterSchema', () => {
  it('accepts empty filter (all fields optional)', () => {
    const result = videoFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults page to 1', () => {
    const result = videoFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults limit to 20', () => {
    const result = videoFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects limit over 50', () => {
    const result = videoFilterSchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects page less than 1', () => {
    const result = videoFilterSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects limit less than 1', () => {
    const result = videoFilterSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts valid sortBy values', () => {
    for (const sortBy of ['recent', 'popular', 'duration']) {
      const result = videoFilterSchema.safeParse({ sortBy });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid sortBy', () => {
    const result = videoFilterSchema.safeParse({ sortBy: 'alphabetical' });
    expect(result.success).toBe(false);
  });

  it('accepts tags array', () => {
    const result = videoFilterSchema.safeParse({ tags: ['meditation', 'nature'] });
    expect(result.success).toBe(true);
  });
});

describe('videoListItemSchema', () => {
  it('validates a video list item with user info', () => {
    const result = videoListItemSchema.safeParse({
      id: validVideo.id,
      title: validVideo.title,
      thumbnailKey: 'thumb.jpg',
      durationSeconds: validVideo.durationSeconds,
      visibility: validVideo.visibility,
      viewCount: validVideo.viewCount,
      likeCount: validVideo.likeCount,
      createdAt: validVideo.createdAt,
      user: {
        id: validVideo.userId,
        displayName: 'Test User',
      },
    });
    expect(result.success).toBe(true);
  });
});
