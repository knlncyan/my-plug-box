#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_FILE = path.resolve(__dirname, '..', 'bin', 'modudesk-sdk-types.json');
const SOURCES_CONFIG_FILE = path.resolve(__dirname, 'sdk-type-sources.json');

function readRepoFile(relativePath) {
  const absolutePath = path.resolve(REPO_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`[update-sdk-types] source file not found: ${absolutePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function normalizeSourceForBundle(source) {
  // Remove UTF-8 BOM to avoid \uFEFF mojibake in JSON payload.
  const withoutBom = source.replace(/^\uFEFF/, '');
  // Strip comments to keep the bundle compact and avoid encoding noise from comment text.
  const withoutBlockComments = withoutBom.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  // Normalize excessive blank lines.
  return withoutLineComments.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function readSourcesConfig() {
  if (!fs.existsSync(SOURCES_CONFIG_FILE)) {
    throw new Error(`[update-sdk-types] sources config not found: ${SOURCES_CONFIG_FILE}`);
  }

  const raw = fs.readFileSync(SOURCES_CONFIG_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const sources = parsed?.sources;

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(`[update-sdk-types] invalid sources config: ${SOURCES_CONFIG_FILE}`);
  }

  return sources;
}

function applyReplaceRules(source, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return source;
  }

  let next = source;
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    if (typeof rule.from !== 'string' || typeof rule.to !== 'string') continue;
    next = next.split(rule.from).join(rule.to);
  }
  return next;
}

function main() {
  const sources = readSourcesConfig();
  const bundled = {};
  const sourceMap = {};

  for (const source of sources) {
    const id = source?.id;
    const filePath = source?.path;
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('[update-sdk-types] source.id must be non-empty string');
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw new Error(`[update-sdk-types] source.path is missing for id: ${id}`);
    }

    const raw = readRepoFile(filePath);
    const replaced = applyReplaceRules(raw, source.replace);
    bundled[id] = normalizeSourceForBundle(replaced);
    sourceMap[id] = filePath;
  }

  const requiredIds = ['capability', 'api', 'pluginModule'];
  for (const id of requiredIds) {
    if (typeof bundled[id] !== 'string') {
      throw new Error(`[update-sdk-types] missing required source id: ${id}`);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: sourceMap,
    ...bundled,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.info(`[update-sdk-types] wrote: ${OUT_FILE}`);
}

main();
