/**
 * Generic API interceptor pipeline and default response-code handling.
 */
import type { ApiInterceptor, ApiInterceptorContext, ApiLikeResponse } from '../domain/interceptor';

export class ApiInterceptorPipeline {
  private readonly interceptors = new Set<ApiInterceptor>();

  add(interceptor: ApiInterceptor): () => void {
    this.interceptors.add(interceptor);
    return () => this.interceptors.delete(interceptor);
  }

  run<TResponse extends ApiLikeResponse>(context: ApiInterceptorContext<TResponse>): void {
    for (const interceptor of this.interceptors) {
      try {
        interceptor(context);
      } catch (error) {
        console.error('[api-interceptor] interceptor failed:', error);
      }
    }
  }
}

export const defaultApiLoggingInterceptor: ApiInterceptor = ({ command, response }) => {
  if (response.success) return;

  switch (response.code) {
    case 'WARNING':
      console.warn(`[plugin-backend] ${command} warning: ${response.message}`);
      return;
    case 'CONFLICT':
      console.error(`[plugin-backend] ${command} conflict: ${response.message}`);
      return;
    default:
      console.error(
        `[plugin-backend] ${command} error: ${response.code} ${response.message}`
      );
  }
};
