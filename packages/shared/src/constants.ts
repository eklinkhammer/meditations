export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export const VIDEO_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  PENDING_REVIEW: 'pending_review',
  REJECTED: 'rejected',
} as const;

export const MODERATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const GENERATION_STATUS = {
  PENDING: 'pending',
  GENERATING_SCRIPT: 'generating_script',
  GENERATING_VOICE: 'generating_voice',
  GENERATING_VIDEO: 'generating_video',
  COMPOSITING: 'compositing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const SCRIPT_TYPE = {
  AI_GENERATED: 'ai_generated',
  USER_PROVIDED: 'user_provided',
  TEMPLATE: 'template',
} as const;

export const CREDIT_TRANSACTION_TYPE = {
  PURCHASE: 'purchase',
  GENERATION_SPEND: 'generation_spend',
  PRIVATE_SURCHARGE: 'private_surcharge',
  REFUND: 'refund',
} as const;

export const DEFAULT_CREDIT_PACKS = [
  { credits: 10, priceUsd: 4.99, label: '10 Credits' },
  { credits: 25, priceUsd: 9.99, label: '25 Credits' },
  { credits: 60, priceUsd: 19.99, label: '60 Credits' },
  { credits: 150, priceUsd: 39.99, label: '150 Credits' },
] as const;

export const AUDIO_MIX_LEVELS = {
  VOICEOVER: 1.0,
  AMBIENT: 0.3,
  MUSIC: 0.2,
} as const;
