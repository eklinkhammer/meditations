export * from './user';
export * from './video';
export * from './generation';
export * from './credits';
export * from './media';
export * from './admin';

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
}
