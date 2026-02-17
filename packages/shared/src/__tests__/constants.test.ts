import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CREDIT_PACKS,
  USER_ROLES,
  VIDEO_VISIBILITY,
  MODERATION_STATUS,
  GENERATION_STATUS,
  SCRIPT_TYPE,
  CREDIT_TRANSACTION_TYPE,
  AUDIO_MIX_LEVELS,
} from '../constants';

describe('DEFAULT_CREDIT_PACKS', () => {
  it('has exactly 4 entries', () => {
    expect(DEFAULT_CREDIT_PACKS).toHaveLength(4);
  });

  it('has correct credits values', () => {
    expect(DEFAULT_CREDIT_PACKS.map((p) => p.credits)).toEqual([10, 25, 60, 150]);
  });

  it('has correct price values', () => {
    expect(DEFAULT_CREDIT_PACKS.map((p) => p.priceUsd)).toEqual([4.99, 9.99, 19.99, 39.99]);
  });

  it('has labels for each pack', () => {
    for (const pack of DEFAULT_CREDIT_PACKS) {
      expect(pack.label).toBeTruthy();
      expect(typeof pack.label).toBe('string');
    }
  });
});

describe('USER_ROLES', () => {
  it('has USER and ADMIN keys', () => {
    expect(USER_ROLES.USER).toBe('user');
    expect(USER_ROLES.ADMIN).toBe('admin');
  });
});

describe('VIDEO_VISIBILITY', () => {
  it('has all expected values', () => {
    expect(VIDEO_VISIBILITY.PUBLIC).toBe('public');
    expect(VIDEO_VISIBILITY.PRIVATE).toBe('private');
    expect(VIDEO_VISIBILITY.PENDING_REVIEW).toBe('pending_review');
    expect(VIDEO_VISIBILITY.REJECTED).toBe('rejected');
  });
});

describe('MODERATION_STATUS', () => {
  it('has all expected values', () => {
    expect(MODERATION_STATUS.PENDING).toBe('pending');
    expect(MODERATION_STATUS.APPROVED).toBe('approved');
    expect(MODERATION_STATUS.REJECTED).toBe('rejected');
  });
});

describe('GENERATION_STATUS', () => {
  it('has all expected values', () => {
    expect(GENERATION_STATUS.PENDING).toBe('pending');
    expect(GENERATION_STATUS.GENERATING_SCRIPT).toBe('generating_script');
    expect(GENERATION_STATUS.GENERATING_VOICE).toBe('generating_voice');
    expect(GENERATION_STATUS.GENERATING_VIDEO).toBe('generating_video');
    expect(GENERATION_STATUS.COMPOSITING).toBe('compositing');
    expect(GENERATION_STATUS.COMPLETED).toBe('completed');
    expect(GENERATION_STATUS.FAILED).toBe('failed');
  });
});

describe('SCRIPT_TYPE', () => {
  it('has all expected values', () => {
    expect(SCRIPT_TYPE.AI_GENERATED).toBe('ai_generated');
    expect(SCRIPT_TYPE.USER_PROVIDED).toBe('user_provided');
    expect(SCRIPT_TYPE.TEMPLATE).toBe('template');
  });
});

describe('CREDIT_TRANSACTION_TYPE', () => {
  it('has all expected values', () => {
    expect(CREDIT_TRANSACTION_TYPE.PURCHASE).toBe('purchase');
    expect(CREDIT_TRANSACTION_TYPE.GENERATION_SPEND).toBe('generation_spend');
    expect(CREDIT_TRANSACTION_TYPE.PRIVATE_SURCHARGE).toBe('private_surcharge');
    expect(CREDIT_TRANSACTION_TYPE.REFUND).toBe('refund');
  });
});

describe('AUDIO_MIX_LEVELS', () => {
  it('has correct mix levels', () => {
    expect(AUDIO_MIX_LEVELS.VOICEOVER).toBe(1.0);
    expect(AUDIO_MIX_LEVELS.AMBIENT).toBe(0.3);
    expect(AUDIO_MIX_LEVELS.MUSIC).toBe(0.2);
  });
});
