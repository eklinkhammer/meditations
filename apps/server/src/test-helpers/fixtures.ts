export const VALID_USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user',
  creditsBalance: 100,
  isPremium: false,
};

export const ADMIN_USER = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'admin',
  creditsBalance: 500,
  isPremium: true,
};

export const VALID_VIDEO = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  userId: VALID_USER.id,
  title: 'Peaceful Meditation',
  storageKey: 'videos/abc123.mp4',
  thumbnailKey: 'thumbs/abc123.jpg',
  durationSeconds: 120,
  visibility: 'public',
  moderationStatus: 'approved',
  visualPrompt: 'A peaceful mountain scene',
  tags: ['meditation', 'nature'],
  viewCount: 10,
  likeCount: 5,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const VALID_GENERATION = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  userId: VALID_USER.id,
  status: 'pending',
  visualPrompt: 'A peaceful scene',
  scriptType: 'ai_generated',
  scriptContent: null,
  durationSeconds: 60,
  ambientSoundId: null,
  musicTrackId: null,
  videoProvider: null,
  voiceProvider: null,
  creditsCharged: 5,
  progress: 0,
  videoId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};
