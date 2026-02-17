import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      S3_ENDPOINT: 'https://s3.test.com',
      S3_ACCESS_KEY: 'test-access-key',
      S3_SECRET_KEY: 'test-secret-key',
      S3_BUCKET: 'test-bucket',
      S3_PUBLIC_URL: 'https://cdn.test.com',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
    },
  },
});
