import type {
  UserProfile,
  UpdateUser,
  VideoListItem,
  VideoFilter,
  Video,
  CreateGenerationRequest,
  GenerationRequest,
  GenerationProgress,
  CreditBalance,
  PurchaseCredits,
  AmbientSound,
  MusicTrack,
  ScriptTemplate,
  PricingConfig,
  UpdatePricingConfig,
  ModerationAction,
} from '@meditations/shared';

export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}

export { ApiError };

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await config.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(response.status, body);
    }

    return response.json() as Promise<T>;
  }

  return {
    // Users
    users: {
      getProfile: () => request<UserProfile>('/api/users'),
      updateProfile: (data: UpdateUser) =>
        request<UserProfile>('/api/users', {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
    },

    // Videos
    videos: {
      list: (filters?: Partial<VideoFilter>) => {
        const params = new URLSearchParams();
        if (filters?.search) params.set('search', filters.search);
        if (filters?.sortBy) params.set('sortBy', filters.sortBy);
        if (filters?.tags) params.set('tags', filters.tags.join(','));
        if (filters?.page) params.set('page', String(filters.page));
        if (filters?.limit) params.set('limit', String(filters.limit));
        const qs = params.toString();
        return request<PaginatedResponse<VideoListItem>>(
          `/api/videos${qs ? `?${qs}` : ''}`,
        );
      },
      get: (id: string) => request<Video & { user: { id: string; displayName: string } }>(`/api/videos/${id}`),
      listMy: (page?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (page) params.set('page', String(page));
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return request<PaginatedResponse<Video>>(
          `/api/videos/my${qs ? `?${qs}` : ''}`,
        );
      },
    },

    // Generations
    generations: {
      create: (data: CreateGenerationRequest) =>
        request<GenerationRequest>('/api/generations', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      list: (page?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (page) params.set('page', String(page));
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return request<PaginatedResponse<GenerationRequest>>(
          `/api/generations${qs ? `?${qs}` : ''}`,
        );
      },
      getProgress: (id: string) =>
        request<GenerationProgress>(`/api/generations/${id}/progress`),
    },

    // Credits
    credits: {
      getBalance: () => request<CreditBalance>('/api/credits'),
      getPacks: () =>
        request<{ packs: typeof import('@meditations/shared').DEFAULT_CREDIT_PACKS }>(
          '/api/credits/packs',
        ),
      purchase: (data: PurchaseCredits) =>
        request<{ success: boolean; creditsAdded: number; newBalance: number }>(
          '/api/credits/purchase',
          { method: 'POST', body: JSON.stringify(data) },
        ),
    },

    // Media assets
    media: {
      listAmbientSounds: () =>
        request<{ data: AmbientSound[] }>('/api/media/ambient-sounds'),
      listMusicTracks: () =>
        request<{ data: MusicTrack[] }>('/api/media/music-tracks'),
      listScriptTemplates: () =>
        request<{ data: ScriptTemplate[] }>('/api/media/script-templates'),
    },

    // Admin
    admin: {
      getStats: () =>
        request<{ totalUsers: number; totalVideos: number; pendingModeration: number }>(
          '/api/admin/stats',
        ),
      listUsers: (page?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (page) params.set('page', String(page));
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return request<PaginatedResponse<UserProfile>>(
          `/api/admin/users${qs ? `?${qs}` : ''}`,
        );
      },
      getModeration: (page?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (page) params.set('page', String(page));
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return request<PaginatedResponse<Video>>(
          `/api/admin/moderation${qs ? `?${qs}` : ''}`,
        );
      },
      moderate: (data: ModerationAction) =>
        request<Video>('/api/admin/moderation', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      getPricing: () =>
        request<{ data: PricingConfig[] }>('/api/admin/pricing'),
      updatePricing: (data: UpdatePricingConfig) =>
        request<PricingConfig>('/api/admin/pricing', {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
