#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const positional = [];
  const options = {};

  while (args.length > 0) {
    const token = args.shift();
    if (!token) break;
    if (token.startsWith('--')) {
      const [k, v] = token.slice(2).split('=');
      if (v !== undefined) {
        options[k] = v;
      } else {
        const next = args[0];
        if (next && !next.startsWith('--')) {
          options[k] = args.shift();
        } else {
          options[k] = true;
        }
      }
    } else {
      positional.push(token);
    }
  }

  return { command, positional, options };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

function ensureString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[plugbox] invalid field: ${field}`);
  }
  return value.trim();
}

function normalizePluginId(raw) {
  const pluginId = ensureString(raw, 'pluginId');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(pluginId)) {
    throw new Error('[plugbox] pluginId must match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/');
  }
  return pluginId;
}

function buildScript(framework) {
  const frameworkPluginImport = framework === 'vue'
    ? "import vue from '@vitejs/plugin-vue';"
    : "import react from '@vitejs/plugin-react';";

  const frameworkPluginCall = framework === 'vue' ? 'vue()' : 'react()';

  return `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
${frameworkPluginImport}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const configPath = path.resolve(root, 'plugbox.config.json');

function readConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function ensureString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(\`[plugbox-build] invalid field: \${field}\`);
  }
  return value.trim();
}

async function main() {
  const cfg = readConfig();
  const pluginId = ensureString(cfg.pluginId, 'pluginId');
  const outRootDir = path.resolve(root, typeof cfg.outDir === 'string' ? cfg.outDir : 'dist');
  const outDir = path.resolve(outRootDir, pluginId);

  const moduleEntry = path.resolve(root, ensureString(cfg.entries?.module, 'entries.module'));
  const hasView = !!cfg.view;
  const rollupInput = { index: moduleEntry };

  if (hasView) {
    const viewEntry = path.resolve(root, ensureString(cfg.entries?.view, 'entries.view'));
    rollupInput['view/index'] = viewEntry;
  }

  await build({
    configFile: false,
    root,
    plugins: [${frameworkPluginCall}],
    resolve: {
      alias: [
        { find: '@plug-box/plugin-sdk', replacement: path.resolve(root, 'sdk/index.ts') },
        { find: 'react/jsx-runtime', replacement: path.resolve(root, 'sdk/react-jsx-runtime.ts') },
        { find: 'react/jsx-dev-runtime', replacement: path.resolve(root, 'sdk/react-jsx-runtime.ts') },
        { find: /^react$/, replacement: path.resolve(root, 'sdk/react.ts') },
      ],
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        preserveEntrySignatures: 'strict',
        input: rollupInput,
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  });

  const iconSource = typeof cfg.entries?.icon === 'string'
    ? path.resolve(root, cfg.entries.icon)
    : null;
  const iconTargetRel = iconSource && fs.existsSync(iconSource)
    ? '/plugins/' + pluginId + '/icon' + path.extname(iconSource)
    : undefined;

  if (iconSource && fs.existsSync(iconSource)) {
    const target = path.resolve(outDir, 'icon' + path.extname(iconSource));
    fs.copyFileSync(iconSource, target);
  }

  const manifest = {
    id: pluginId,
    name: ensureString(cfg.name, 'name'),
    version: ensureString(cfg.version, 'version'),
    description: typeof cfg.description === 'string' ? cfg.description : '',
    activationEvents: Array.isArray(cfg.activationEvents) ? cfg.activationEvents : [],
    view: hasView ? (cfg.view ?? undefined) : undefined,
    commands: Array.isArray(cfg.commands) ? cfg.commands : [],
    moduleUrl: '/plugins/' + pluginId + '/index.js',
    viewUrl: hasView ? '/plugins/' + pluginId + '/view/index.js' : undefined,
    icon: iconTargetRel,
  };

  fs.writeFileSync(
    path.resolve(outDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.info('[plugbox-build] done:', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
}

function sdkIndexTs() {
  return `export interface PluginDisposable {
  dispose(): void;
}

export type CapabilityMethod = (...args: unknown[]) => unknown | Promise<unknown>;
export type CapabilityContract = Record<string, CapabilityMethod>;

export interface CommandsCapability {
  execute(commandId: string, ...args: unknown[]): Promise<unknown>;
}

export interface ViewsCapability {
  activate(viewId: string): void;
}

export interface EventsCapability {
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): PluginDisposable;
}

export interface SettingsCapability {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  onChange<T>(key: string, handler: (value: T | undefined) => void): PluginDisposable;
}

export interface StorageCapability {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface PluginCapabilityMap {
  commands: CommandsCapability;
  views: ViewsCapability;
  events: EventsCapability;
  settings: SettingsCapability;
  storage: StorageCapability;
}

export type CapabilityById<K extends string> =
  K extends keyof PluginCapabilityMap
    ? PluginCapabilityMap[K]
    : CapabilityContract;

export interface PluginHostAPI {
  readonly pluginId: string;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  get<K extends string>(id: K): CapabilityById<K>;
}

export interface CommandExecutionContext {
  api: PluginHostAPI;
}

export type PluginCommandHandler = (
  context: CommandExecutionContext,
  ...args: unknown[]
) => Promise<unknown> | unknown;

export interface PluginModule {
  readonly pluginId: string;
  commands?: Record<string, PluginCommandHandler>;
  activate?: (api: PluginHostAPI) => Promise<void> | void;
  deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}

type GlobalWithApiFactory = typeof globalThis & {
  __PLUG_BOX_API_FACTORY__?: () => Promise<PluginHostAPI>;
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

    if (typeof globalScope.__PLUG_BOX_API_FACTORY__ === 'function') {
      const api = await globalScope.__PLUG_BOX_API_FACTORY__();
      if (isValidApi(api)) return api;
    }

    throw new Error('[plugin-sdk] Plugin API factory is not available in current runtime');
  })();

  return cachedApiPromise;
}

export async function createViewApi(seedApi?: unknown): Promise<PluginHostAPI> {
  return createPluginApi(seedApi);
}
`;
}

function sdkReactTs() {
  return `declare global {
  interface Window {
    React?: any;
  }
}

function getReact() {
  const react = window.React;
  if (!react) {
    throw new Error('[plugin-sdk] host React runtime not found on window.React');
  }
  return react;
}

const ReactProxy = new Proxy({}, {
  get(_target, prop: string | symbol) {
    return getReact()[prop as keyof ReturnType<typeof getReact>];
  },
});

export default ReactProxy as typeof import('react');

export const createElement = (...args: any[]) => getReact().createElement(...args);
export const Fragment = getReact().Fragment;
export const useState = <T,>(initial: T) => getReact().useState(initial) as [T, (value: T) => void];
export const useEffect = (effect: any, deps?: any[]) => getReact().useEffect(effect, deps);
export const useMemo = <T,>(factory: () => T, deps: any[]) => getReact().useMemo(factory, deps);
export const useRef = <T,>(value: T) => getReact().useRef(value);
export const useCallback = <T extends (...args: any[]) => any>(cb: T, deps: any[]) => getReact().useCallback(cb, deps);
export const useLayoutEffect = (effect: any, deps?: any[]) => getReact().useLayoutEffect(effect, deps);
export const useReducer = (...args: any[]) => getReact().useReducer(...args);
export const useContext = (...args: any[]) => getReact().useContext(...args);
export const useId = () => getReact().useId();
export const useTransition = () => getReact().useTransition();
export const useDeferredValue = <T,>(value: T) => getReact().useDeferredValue(value);
`;
}

function sdkReactJsxRuntimeTs() {
  return `declare global {
  interface Window {
    React?: any;
  }
}

function getReact() {
  const react = window.React;
  if (!react) {
    throw new Error('[plugin-sdk] host React runtime not found on window.React');
  }
  return react;
}

export const Fragment = getReact().Fragment;

export function jsx(type: any, props: any, key?: any) {
  const nextProps = key === undefined ? props : { ...props, key };
  return getReact().createElement(type, nextProps);
}

export const jsxs = jsx;

export function jsxDEV(type: any, props: any, key?: any) {
  const nextProps = key === undefined ? props : { ...props, key };
  return getReact().createElement(type, nextProps);
}
`;
}

function reactViewTsx(pluginId) {
  return `import React, { useEffect, useState } from 'react';
import { createPluginApi } from '@plug-box/plugin-sdk';
import './style.css';

export default function PluginView() {
  const [result, setResult] = useState('ready');

  useEffect(() => {
    void (async () => {
      const api = await createPluginApi();
      const value = await api.get('commands').execute('${pluginId}.ping');
      setResult(String(value));
    })();
  }, []);

  return (
    <div className="demo-view-root">
      <h2>Demo View</h2>
      <p>Command Result: {result}</p>
    </div>
  );
}
`;
}

function vueViewVue(pluginId) {
  return `<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createPluginApi } from '@plug-box/plugin-sdk';
import './style.css';

const result = ref('ready');

onMounted(async () => {
  const api = await createPluginApi();
  const value = await api.get('commands').execute('${pluginId}.ping');
  result.value = String(value);
});
</script>

<template>
  <div class="demo-view-root">
    <h2>Demo View</h2>
    <p>Command Result: {{ result }}</p>
  </div>
</template>
`;
}

function moduleIndexTs(pluginId) {
  return `import type { PluginModule } from '@plug-box/plugin-sdk';

const pluginId = '${pluginId}';

const plugin: PluginModule = {
  pluginId,
  activate: async () => {
    console.info('[${pluginId}] activated');
  },
  commands: {
    '${pluginId}.open': (context) => {
      context.api.get('views').activate('${pluginId}.main');
      return null;
    },
    '${pluginId}.ping': () => {
      return 'pong';
    },
  },
};

export default plugin;
`;
}

function styleCss() {
  return `.demo-view-root {
  box-sizing: border-box;
  height: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  color: #0f172a;
  font-family: "Segoe UI", "PingFang SC", sans-serif;
}
`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <rect x="4" y="4" width="56" height="56" rx="14" fill="#F0F9FF"/>
  <path d="M16 20h32v24H16z" fill="#0EA5E9"/>
  <path d="M22 28h20" stroke="#E0F2FE" stroke-width="3" stroke-linecap="round"/>
  <path d="M22 34h14" stroke="#E0F2FE" stroke-width="3" stroke-linecap="round"/>
</svg>
`;
}

function plugboxConfig(pluginId) {
  return JSON.stringify({
    pluginId,
    name: pluginId,
    version: '1.0.0',
    description: 'Plugin scaffold generated by plugbox-plugin tool',
    activationEvents: [
      `onCommand:${pluginId}.open`,
      `onView:${pluginId}.main`,
    ],
    view: {
      id: `${pluginId}.main`,
      title: 'Main View',
      props: {
        welcome: 'Hello from plugin view',
      },
    },
    commands: [
      { id: `${pluginId}.open`, description: 'Open plugin view' },
      { id: `${pluginId}.ping`, description: 'Ping command' },
    ],
    entries: {
      module: 'src/index.ts',
      view: 'src/view/index.tsx',
      icon: 'src/icon.svg',
    },
    outDir: 'dist',
  }, null, 2) + '\n';
}

function packageJson(projectName, framework) {
  const frameworkDeps = framework === 'vue'
    ? { vue: '^3.5.13' }
    : { react: '^19.2.0', 'react-dom': '^19.2.0' };
  const frameworkDevDeps = framework === 'vue'
    ? { '@vitejs/plugin-vue': '^5.2.1', '@vue/compiler-sfc': '^3.5.13' }
    : { '@vitejs/plugin-react': '^4.6.0', '@types/react': '^19.1.8', '@types/react-dom': '^19.1.6' };

  return JSON.stringify({
    name: projectName,
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      build: 'node scripts/build.mjs',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      ...frameworkDeps,
    },
    devDependencies: {
      typescript: '^5.8.3',
      vite: '^7.0.4',
      ...frameworkDevDeps,
    },
  }, null, 2) + '\n';
}

function tsConfig(framework) {
  const jsx = framework === 'react' ? 'react-jsx' : 'preserve';
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx,
      lib: ['ES2020', 'DOM'],
      baseUrl: '.',
      paths: {
        '@plug-box/plugin-sdk': ['./sdk/index.ts'],
      },
    },
    include: ['src', 'sdk'],
  }, null, 2) + '\n';
}

function createProject(targetDir, framework, pluginIdOption) {
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }

  const projectName = path.basename(targetDir);
  const defaultPluginId = `external.${projectName.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase()}`;
  const pluginId = normalizePluginId(pluginIdOption ?? defaultPluginId);

  ensureDir(targetDir);
  ensureDir(path.join(targetDir, 'src/view'));
  ensureDir(path.join(targetDir, 'scripts'));
  ensureDir(path.join(targetDir, 'sdk'));

  writeFile(path.join(targetDir, 'package.json'), packageJson(projectName, framework));
  writeFile(path.join(targetDir, 'tsconfig.json'), tsConfig(framework));
  writeFile(path.join(targetDir, 'plugbox.config.json'), plugboxConfig(pluginId));
  writeFile(path.join(targetDir, 'scripts/build.mjs'), buildScript(framework));
  writeFile(path.join(targetDir, 'sdk/index.ts'), sdkIndexTs());
  writeFile(path.join(targetDir, 'sdk/react.ts'), sdkReactTs());
  writeFile(path.join(targetDir, 'sdk/react-jsx-runtime.ts'), sdkReactJsxRuntimeTs());
  writeFile(path.join(targetDir, 'src/index.ts'), moduleIndexTs(pluginId));
  writeFile(path.join(targetDir, 'src/view/style.css'), styleCss());
  writeFile(path.join(targetDir, 'src/icon.svg'), iconSvg());

  if (framework === 'vue') {
    writeFile(path.join(targetDir, 'src/view/index.vue'), vueViewVue(pluginId));
    const cfgPath = path.join(targetDir, 'plugbox.config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.entries.view = 'src/view/index.vue';
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  } else {
    writeFile(path.join(targetDir, 'src/view/index.tsx'), reactViewTsx(pluginId));
  }

  console.info(`\n[plugbox-plugin] Project created: ${targetDir}`);
  console.info('[plugbox-plugin] Next steps:');
  console.info('  1) cd ' + targetDir);
  console.info('  2) pnpm install');
  console.info('  3) pnpm build');
  console.info('  4) copy dist/<pluginId> to app/public/plugins/<pluginId>');
}

function runBuild(projectDir) {
  const targetDir = path.resolve(projectDir);
  const scriptPath = path.resolve(targetDir, 'scripts/build.mjs');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`[plugbox-plugin] build script not found: ${scriptPath}`);
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: targetDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`[plugbox-plugin] build failed: ${targetDir}`);
  }
}

function printHelp() {
  console.info('Usage:');
  console.info('  node tools/plugin-devtool/bin/plugbox-plugin.mjs init <project-dir> [--framework react|vue] [--plugin-id <id>]');
  console.info('  node tools/plugin-devtool/bin/plugbox-plugin.mjs build [project-dir]');
}

async function main() {
  const { command, positional, options } = parseArgs(process.argv.slice(2));
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    const projectDir = positional[0];
    if (!projectDir) {
      throw new Error('Missing project directory');
    }

    const framework = String(options.framework ?? 'react').toLowerCase();
    if (framework !== 'react' && framework !== 'vue') {
      throw new Error('framework must be react or vue');
    }

    const pluginIdOption = options['plugin-id'] ? String(options['plugin-id']) : undefined;
    createProject(path.resolve(process.cwd(), projectDir), framework, pluginIdOption);
    return;
  }

  if (command === 'build') {
    const projectDir = positional[0] ? path.resolve(process.cwd(), positional[0]) : process.cwd();
    runBuild(projectDir);
    return;
  }

  throw new Error('Unsupported command: ' + command);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

