import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';

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
    throw new Error(`[modudesk-build] invalid field: ${field}`);
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
    plugins: [vue()],
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