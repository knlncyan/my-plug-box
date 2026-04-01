#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const scriptDir =
  typeof __dirname === 'string'
    ? __dirname
    : (process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd());
const SDK_TYPES_BUNDLE_PATH = path.resolve(scriptDir, 'modudesk-sdk-types.json');
const EMBEDDED_SDK_TYPES_BUNDLE =
  typeof globalThis !== 'undefined'
  && globalThis.__MODUDESK_SDK_TYPES_BUNDLE__
  && typeof globalThis.__MODUDESK_SDK_TYPES_BUNDLE__ === 'object'
    ? globalThis.__MODUDESK_SDK_TYPES_BUNDLE__
    : null;

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
    throw new Error(`[modudesk] invalid field: ${field}`);
  }
  return value.trim();
}

function normalizePluginId(raw) {
  const pluginId = ensureString(raw, 'pluginId');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(pluginId)) {
    throw new Error('[modudesk] pluginId must match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/');
  }
  return pluginId;
}

function readBundledSdkTypes() {
  if (
    EMBEDDED_SDK_TYPES_BUNDLE
    && typeof EMBEDDED_SDK_TYPES_BUNDLE.capability === 'string'
    && typeof EMBEDDED_SDK_TYPES_BUNDLE.api === 'string'
    && typeof EMBEDDED_SDK_TYPES_BUNDLE.pluginModule === 'string'
  ) {
    return EMBEDDED_SDK_TYPES_BUNDLE;
  }

  if (!fs.existsSync(SDK_TYPES_BUNDLE_PATH)) {
    throw new Error(
      `[modudesk-plugin] sdk type bundle not found: ${SDK_TYPES_BUNDLE_PATH}\n` +
      'Please run: node tools/plugin-devtool/scripts/update-sdk-types.mjs'
    );
  }

  const raw = fs.readFileSync(SDK_TYPES_BUNDLE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof parsed.capability !== 'string'
    || typeof parsed.api !== 'string'
    || typeof parsed.pluginModule !== 'string'
  ) {
    throw new Error(`[modudesk-plugin] invalid sdk type bundle: ${SDK_TYPES_BUNDLE_PATH}`);
  }

  return parsed;
}

function sdkRuntimeIndexTs() {
  return `export * from './types/capability';
export * from './types/api';
export * from './types/plugin-module';

import type { PluginHostAPI } from './types/api';

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

function writeSdkRuntimeFiles(targetDir) {
  const sdkDir = path.join(targetDir, 'sdk');
  writeFile(path.join(sdkDir, 'index.ts'), sdkRuntimeIndexTs());
  writeFile(path.join(sdkDir, 'react.ts'), sdkReactTs());
  writeFile(path.join(sdkDir, 'react-jsx-runtime.ts'), sdkReactJsxRuntimeTs());
}

function syncSdkTypes(targetDir) {
  const sdkDir = path.join(targetDir, 'sdk');
  const sdkTypesDir = path.join(sdkDir, 'types');
  ensureDir(sdkTypesDir);

  const bundle = readBundledSdkTypes();
  const capabilitySource = bundle.capability;
  const apiSource = bundle.api;
  const pluginModuleSource = bundle.pluginModule;

  writeFile(path.join(sdkTypesDir, 'capability.ts'), capabilitySource);
  writeFile(path.join(sdkTypesDir, 'api.ts'), apiSource);
  writeFile(path.join(sdkTypesDir, 'plugin-module.ts'), pluginModuleSource);

  writeSdkRuntimeFiles(targetDir);
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
const configPath = path.resolve(root, 'modudesk.config.json');

function readConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function ensureString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(\`[modudesk-build] invalid field: \${field}\`);
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
        { find: '@modudesk/plugin-sdk', replacement: path.resolve(root, 'sdk/index.ts') },
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

  console.info('[modudesk-build] done:', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
}

function reactViewTsx(pluginId) {
  return `import React, { useEffect, useState } from 'react';
import { createPluginApi } from '@modudesk/plugin-sdk';
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
import { createPluginApi } from '@modudesk/plugin-sdk';
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
  return `import type { PluginModule } from '@modudesk/plugin-sdk';

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

function modudeskConfig(pluginId) {
  return JSON.stringify({
    pluginId,
    name: pluginId,
    version: '1.0.0',
    description: 'Plugin scaffold generated by modudesk-plugin tool',
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
        '@modudesk/plugin-sdk': ['./sdk/index.ts'],
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
  ensureDir(path.join(targetDir, 'sdk/types'));

  writeFile(path.join(targetDir, 'package.json'), packageJson(projectName, framework));
  writeFile(path.join(targetDir, 'tsconfig.json'), tsConfig(framework));
  writeFile(path.join(targetDir, 'modudesk.config.json'), modudeskConfig(pluginId));
  writeFile(path.join(targetDir, 'scripts/build.mjs'), buildScript(framework));

  syncSdkTypes(targetDir);

  writeFile(path.join(targetDir, 'src/index.ts'), moduleIndexTs(pluginId));
  writeFile(path.join(targetDir, 'src/view/style.css'), styleCss());
  writeFile(path.join(targetDir, 'src/icon.svg'), iconSvg());

  if (framework === 'vue') {
    writeFile(path.join(targetDir, 'src/view/index.vue'), vueViewVue(pluginId));
    const cfgPath = path.join(targetDir, 'modudesk.config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.entries.view = 'src/view/index.vue';
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  } else {
    writeFile(path.join(targetDir, 'src/view/index.tsx'), reactViewTsx(pluginId));
  }

  console.info(`\n[modudesk-plugin] Project created: ${targetDir}`);
  console.info('[modudesk-plugin] Next steps:');
  console.info('  1) cd ' + targetDir);
  console.info('  2) pnpm install');
  console.info('  3) pnpm build');
  console.info('  4) node ../tools/plugin-devtool/bin/modudesk-plugin.mjs sync-sdk .   # optional');
  console.info('  5) copy dist/<pluginId> to app/public/plugins/<pluginId>');
}

function runBuild(projectDir) {
  const targetDir = path.resolve(projectDir);
  const scriptPath = path.resolve(targetDir, 'scripts/build.mjs');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`[modudesk-plugin] build script not found: ${scriptPath}`);
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: targetDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`[modudesk-plugin] build failed: ${targetDir}`);
  }
}

function runSyncSdk(projectDir) {
  const targetDir = path.resolve(projectDir);
  const sdkDir = path.join(targetDir, 'sdk');
  if (!fs.existsSync(sdkDir)) {
    throw new Error(`[modudesk-plugin] sdk directory not found: ${sdkDir}`);
  }

  syncSdkTypes(targetDir);
  console.info(`[modudesk-plugin] sdk types synced: ${targetDir}`);
}

function printHelp() {
  console.info('Usage:');
  console.info('  node tools/plugin-devtool/bin/modudesk-plugin.mjs init <project-dir> [--framework react|vue] [--plugin-id <id>]');
  console.info('  node tools/plugin-devtool/bin/modudesk-plugin.mjs build [project-dir]');
  console.info('  node tools/plugin-devtool/bin/modudesk-plugin.mjs sync-sdk [project-dir]');
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

    const framework = String(
      options.framework ?? (options.vue ? 'vue' : 'react')
    ).toLowerCase();
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

  if (command === 'sync-sdk') {
    const projectDir = positional[0] ? path.resolve(process.cwd(), positional[0]) : process.cwd();
    runSyncSdk(projectDir);
    return;
  }

  throw new Error('Unsupported command: ' + command);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
