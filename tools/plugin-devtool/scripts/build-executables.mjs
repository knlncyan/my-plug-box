#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOL_ROOT = path.resolve(__dirname, '..');

const BIN_ENTRY_SOURCE = path.resolve(TOOL_ROOT, 'bin', 'modudesk-plugin.mjs');
const SDK_TYPES_BUNDLE = path.resolve(TOOL_ROOT, 'bin', 'modudesk-sdk-types.json');
const DIST_DIR = path.resolve(TOOL_ROOT, 'dist');
const BUILD_TMP_DIR = path.resolve(DIST_DIR, '.tmp');
const BIN_ENTRY_PKG = path.resolve(BUILD_TMP_DIR, 'modudesk-plugin.pkg.cjs');

const TARGET_MAP = {
  windows: ['node18-win-x64'],
  linux: ['node18-linux-x64'],
  macos: ['node18-macos-x64'],
  'macos-arm64': ['node18-macos-arm64'],
};

function parseTargetsArg(argv) {
  const raw = argv.find((token) => token.startsWith('--targets='))?.split('=')[1];
  if (!raw) return ['windows', 'linux', 'macos'];
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resolvePkgTargets(logicalTargets) {
  const resolved = [];
  for (const logical of logicalTargets) {
    const mapped = TARGET_MAP[logical];
    if (!mapped) {
      throw new Error(
        `[build-executables] unsupported target "${logical}". ` +
        `supported: ${Object.keys(TARGET_MAP).join(', ')}`
      );
    }
    resolved.push(...mapped);
  }
  return resolved;
}

function ensurePreconditions() {
  if (!fs.existsSync(BIN_ENTRY_SOURCE)) {
    throw new Error(`[build-executables] entry not found: ${BIN_ENTRY_SOURCE}`);
  }
  if (!fs.existsSync(SDK_TYPES_BUNDLE)) {
    throw new Error(
      `[build-executables] sdk bundle not found: ${SDK_TYPES_BUNDLE}\n` +
      'Please run: node tools/plugin-devtool/scripts/update-sdk-types.mjs'
    );
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(BUILD_TMP_DIR, { recursive: true });
}

function cleanupTempArtifacts() {
  try {
    if (fs.existsSync(BUILD_TMP_DIR)) {
      fs.rmSync(BUILD_TMP_DIR, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

async function buildPkgEntry() {
  const embeddedBundleRaw = fs.readFileSync(SDK_TYPES_BUNDLE, 'utf8');
  const embeddedBundleObject = JSON.parse(embeddedBundleRaw);

  await esbuild({
    entryPoints: [BIN_ENTRY_SOURCE],
    outfile: BIN_ENTRY_PKG,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    logLevel: 'info',
    define: {
      'globalThis.__MODUDESK_SDK_TYPES_BUNDLE__': JSON.stringify(embeddedBundleObject),
    },
  });
}

function runPkgOne(target) {
  const outFile = path.join(DIST_DIR, `modudesk-plugin-${target}`);
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const command =
    `${npxCmd} pkg ` +
    `"${BIN_ENTRY_PKG}" ` +
    `--targets "${target}" ` +
    `--output "${outFile}"`;

  const result = spawnSync(command, {
    cwd: TOOL_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw new Error(
      `[build-executables] pkg spawn failed for target "${target}": ${String(result.error)}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `[build-executables] pkg failed for target "${target}" with exit code ${String(result.status)}`
    );
  }
}

function runPkg(targets) {
  const failed = [];
  for (const target of targets) {
    try {
      runPkgOne(target);
    } catch (error) {
      failed.push({ target, error: String(error) });
    }
  }

  if (failed.length > 0) {
    const lines = failed.map((item) => `- ${item.target}: ${item.error}`).join('\n');
    throw new Error(`[build-executables] some targets failed:\n${lines}`);
  }
}

async function main() {
  const logicalTargets = parseTargetsArg(process.argv.slice(2));
  const pkgTargets = resolvePkgTargets(logicalTargets);

  try {
    ensurePreconditions();
    await buildPkgEntry();
    runPkg(pkgTargets);

    console.info(`[build-executables] done: ${DIST_DIR}`);
  } finally {
    cleanupTempArtifacts();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
