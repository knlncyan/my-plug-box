import type { PluginHostAPI } from './types/index';

type GlobalWithApiFactory = typeof globalThis & {
  __MODUDESK_API_FACTORY__?: () => Promise<PluginHostAPI>;
};

function isValidApi(value: unknown): value is PluginHostAPI {
  return !!value
    && typeof value === 'object'
    && typeof (value as PluginHostAPI).call === 'function'
    && typeof (value as PluginHostAPI).get === 'function';
}

let cachedApiPromise: Promise<PluginHostAPI> | null = null;

export async function createPluginApi(seedApi?: unknown): Promise<PluginHostAPI> {
  if (isValidApi(seedApi)) {
    return seedApi;
  }

  if (cachedApiPromise) {
    return cachedApiPromise;
  }

  cachedApiPromise = (async () => {
    const globalScope = globalThis as GlobalWithApiFactory;

    if (typeof globalScope.__MODUDESK_API_FACTORY__ === 'function') {
      const api = await globalScope.__MODUDESK_API_FACTORY__();
      if (isValidApi(api)) return api;
    }

    throw new Error('[plugin-sdk] Plugin API factory is not available in current runtime');
  })();

  return cachedApiPromise;
}

export async function createViewApi(seedApi?: unknown): Promise<PluginHostAPI> {
  return createPluginApi(seedApi);
}
