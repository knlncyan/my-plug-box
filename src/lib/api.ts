/**
 * Generic API interceptor pipeline and default response-code handling.
 */
import { ApiResponse } from '@/domain/protocol';
import type { ApiInterceptor, ApiInterceptorContext, ApiLikeResponse } from '../domain/interceptor';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

// interface InvokeApiOptions {
//     allowWarning?: boolean;
// }

class API {
    private readonly interceptors = new Set<ApiInterceptor>();

    // 构造时注入所有拦截器
    constructor() {
        const codeVierify: ApiInterceptor = ({ command, response }) => {
            if (response.success) return;
            switch (response.code) {
                case 'WARNING':
                    console.warn(`[plugin-backend] ${command} warning: ${response.message}`);
                    return;
                default:
                    toast.error(`[plugin-backend] ${command} error: ${response.code} ${response.message}`, { position: 'bottom-right' })
                    throw new Error(`[plugin-backend] ${command} error: ${response.code} ${response.message}`);
            }
        }

        this.add(codeVierify);
    }

    /**
     * 对外暴露的方法,统一调用这个来间接调用rust后端，返回会自动包装上ApiResponse
     */
    async invokeApi<T>(
        command: string,
        payload?: Record<string, unknown>,
        // options?: InvokeApiOptions
    ): Promise<ApiResponse<T>> {
        let response: ApiResponse<T>;

        try {
            response = await invoke<ApiResponse<T>>(command, payload);
        } catch (error) {
            throw new Error(`[plugin-backend] ${command} invoke failed: ${String(error)}`);
        }

        // 调用所有拦截器
        this.run({ command, payload, response });

        return response
    }

    private add(interceptor: ApiInterceptor) {
        this.interceptors.add(interceptor);
    }

    private run<TResponse extends ApiLikeResponse>(context: ApiInterceptorContext<TResponse>): void {
        for (const interceptor of this.interceptors) {
            try {
                interceptor(context);
            } catch (error) {
                console.error('[api-interceptor] interceptor failed:', error);
            }
        }
    }


}

export default new API();
