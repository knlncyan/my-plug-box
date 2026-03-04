/**
 * API 拦截器领域类型：
 * - 统一定义拦截上下文与拦截器函数签名。
 */
export interface ApiLikeResponse {
  success: boolean;
  code: string;
  message: string;
}

export interface ApiInterceptorContext<TResponse = unknown> {
  command: string;
  payload?: Record<string, unknown>;
  response: TResponse;
}

export type ApiInterceptor = <TResponse extends ApiLikeResponse>(
  context: ApiInterceptorContext<TResponse>
) => void;
