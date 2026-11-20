import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { AssetManifest } from '../src/types/engine.ts';

export type AssetCategory = 'images' | 'audio' | 'scripts';

export interface CliOptions {
  help: boolean;
  root: string;
  urlPrefix: string;
  out: string;
}

export interface BuildManifestOptions {
  root: string;
  urlPrefix?: string;
}

export interface GenerateManifestOptions {
  root: string;
  urlPrefix?: string;
  out: string;
}

export interface ManifestSummary {
  images: number;
  audio: number;
  scripts: number;
  out: string;
}

interface ScannedAsset {
  category: AssetCategory;
  relSegments: string[];
  relPath: string;
}

interface AssetEntry {
  url: string;
  relPath: string;
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
]);
const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.m4a', '.flac']);
const SCRIPT_EXTENSIONS = new Set(['.vns']);
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const DEFAULT_ROOT = 'public';
const DEFAULT_OUT = 'public/assets/manifest.json';

const USAGE = `Usage: npm run build:manifest -- [options]

Options:
  -r, --root <dir>         Resource root directory (default: ${DEFAULT_ROOT})
      --url-prefix <p>     URL prefix for asset paths
                           (default: "" -> /<relative-path>)
  -o, --out <file>         Output manifest file (default: ${DEFAULT_OUT})
  -h, --help               Show this help

Both --root and --out are resolved relative to the current working directory.
--root should point at a resource directory, not the repository root.
Prefer a .json output path: files with resource extensions are picked up
by later scans.`;

export function normalizeUrlPrefix(prefix: string): string {
  if (typeof prefix !== 'string') {
    throw new Error('Invalid URL prefix: expected a string.');
  }
  const trimmed = prefix.replace(/\/+$/, '');
  if (trimmed === '') {
    return '';
  }
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let values: {
    root: string;
    'url-prefix': string;
    out: string;
    help: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        root: { type: 'string', short: 'r', default: DEFAULT_ROOT },
        'url-prefix': { type: 'string', default: '' },
        out: { type: 'string', short: 'o', default: DEFAULT_OUT },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }

  if (values.root === '') {
    throw new Error('--root must not be empty.');
  }
  if (values.out === '') {
    throw new Error('--out must not be empty.');
  }

  return {
    help: values.help,
    root: values.root,
    urlPrefix: normalizeUrlPrefix(values['url-prefix']),
    out: values.out,
  };
}

export async function buildManifest(
  options: BuildManifestOptions,
): Promise<AssetManifest> {
  const root = options?.root;
  if (typeof root !== 'string' || root === '') {
    throw new Error('--root must not be empty.');
  }
  const urlPrefix = normalizeUrlPrefix(options.urlPrefix ?? '');
  const assets = await scanDirectory(root);

  const buckets: Record<AssetCategory, Map<string, AssetEntry>> = {
    images: new Map(),
    audio: new Map(),
    scripts: new Map(),
  };

  for (const asset of assets) {
    const filename = asset.relSegments[asset.relSegments.length - 1];
    const id = parse(filename).name;
    if (!IDENTIFIER_PATTERN.test(id)) {
      throw new Error(
        `Invalid asset id "${id}" derived from "${asset.relPath}": ids must match ${IDENTIFIER_PATTERN}.`,
      );
    }

    const bucket = buckets[asset.category];
    const existing = bucket.get(id);
    if (existing) {
      throw new Error(
        `Duplicate asset id "${id}" in ${asset.category}: "${existing.relPath}" and "${asset.relPath}".`,
      );
    }
    bucket.set(id, {
      url: buildUrl(urlPrefix, asset.relSegments),
      relPath: asset.relPath,
    });
  }

  return {
    images: toUrlRecord(buckets.images),
    audio: toUrlRecord(buckets.audio),
    scripts: toUrlRecord(buckets.scripts),
    spritesheets: {},
  };
}

export async function generateManifest(
  options: GenerateManifestOptions,
): Promise<ManifestSummary> {
  const out = options?.out;
  if (typeof out !== 'string' || out === '') {
    throw new Error('--out must not be empty.');
  }

  const manifest = await buildManifest({
    root: options.root,
    urlPrefix: options.urlPrefix,
  });
  const absOut = resolve(out);

  try {
    await mkdir(dirname(absOut), { recursive: true });
    await writeFile(absOut, renderManifest(manifest), 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to write manifest to "${absOut}": ${errorMessage(error)}`,
      { cause: error },
    );
  }

  return {
    images: Object.keys(manifest.images).length,
    audio: Object.keys(manifest.audio).length,
    scripts: Object.keys(manifest.scripts).length,
    out: absOut,
  };
}

async function scanDirectory(root: string): Promise<ScannedAsset[]> {
  const absRoot = resolve(root);
  let rootStat;
  try {
    rootStat = await stat(absRoot);
  } catch {
    throw new Error(`Root directory "${absRoot}" does not exist.`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Root path "${absRoot}" is not a directory.`);
  }

  const assets: ScannedAsset[] = [];
  await walk(absRoot, [], assets);
  return assets;
}

async function walk(
  absDir: string,
  relSegments: string[],
  assets: ScannedAsset[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Failed to read directory "${absDir}": ${errorMessage(error)}`,
      { cause: error },
    );
  }

  entries.sort((a, b) => compareStrings(a.name, b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      await walk(
        join(absDir, entry.name),
        [...relSegments, entry.name],
        assets,
      );
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const category = classifyFile(entry.name);
    if (!category) {
      continue;
    }
    const nextSegments = [...relSegments, entry.name];
    assets.push({
      category,
      relSegments: nextSegments,
      relPath: nextSegments.join('/'),
    });
  }
}

function classifyFile(filename: string): AssetCategory | null {
  const extension = parse(filename).ext.toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'images';
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return 'scripts';
  }
  return null;
}

function buildUrl(prefix: string, relSegments: string[]): string {
  const encoded = relSegments.map((segment) => encodeURIComponent(segment));
  const relPath = encoded.join('/');
  return prefix === '' ? `/${relPath}` : `${prefix}/${relPath}`;
}

function toUrlRecord(bucket: Map<string, AssetEntry>): Record<string, string> {
  return Object.fromEntries(
    [...bucket.entries()]
      .sort((a, b) => compareStrings(a[0], b[0]))
      .map(([id, entry]) => [id, entry.url]),
  );
}

function renderManifest(manifest: AssetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${errorMessage(error)}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  try {
    const summary = await generateManifest(options);
    console.log(
      `Generated manifest: images=${summary.images} audio=${summary.audio} scripts=${summary.scripts}`,
    );
    console.log(`Wrote ${summary.out}`);
  } catch (error) {
    console.error(`Error: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main();
}
