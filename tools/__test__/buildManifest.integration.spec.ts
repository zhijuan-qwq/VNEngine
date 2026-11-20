import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildManifestOptions } from '../buildManifest.ts';
import { buildManifest, generateManifest } from '../buildManifest.ts';

const tempDirs: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vnengine-manifest-'));
  tempDirs.push(dir);
  return dir;
}

async function touch(root: string, rel: string): Promise<void> {
  const abs = join(root, ...rel.split('/'));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, '');
}

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

describe('buildManifest', () => {
  it('should build an empty manifest for an empty directory', async () => {
    const root = await makeTempRoot();
    expect(await buildManifest({ root })).toEqual({
      images: {},
      audio: {},
      scripts: {},
      spritesheets: {},
    });
  });

  it('should classify nested resources and use file stems as ids', async () => {
    const root = await makeTempRoot();
    await touch(root, 'assets/images/bg/bg_campus.png');
    await touch(root, 'assets/images/char/ch_hero_default.webp');
    await touch(root, 'assets/audio/bgm/bgm_morning.ogg');
    await touch(root, 'assets/audio/se/se_click.mp3');
    await touch(root, 'scripts/demo.vns');

    expect(await buildManifest({ root })).toEqual({
      images: {
        bg_campus: '/assets/images/bg/bg_campus.png',
        ch_hero_default: '/assets/images/char/ch_hero_default.webp',
      },
      audio: {
        bgm_morning: '/assets/audio/bgm/bgm_morning.ogg',
        se_click: '/assets/audio/se/se_click.mp3',
      },
      scripts: { demo: '/scripts/demo.vns' },
      spritesheets: {},
    });
  });

  it('should apply absolute, rooted and protocol-relative URL prefixes', async () => {
    const root = await makeTempRoot();
    await touch(root, 'images/x.png');

    expect((await buildManifest({ root, urlPrefix: '/static' })).images.x).toBe(
      '/static/images/x.png',
    );
    expect((await buildManifest({ root, urlPrefix: 'static' })).images.x).toBe(
      '/static/images/x.png',
    );
    expect(
      (await buildManifest({ root, urlPrefix: 'https://cdn.example.com/a' }))
        .images.x,
    ).toBe('https://cdn.example.com/a/images/x.png');
  });

  it('should percent-encode URL path segments with spaces', async () => {
    const root = await makeTempRoot();
    await touch(root, 'my dir/x.png');

    expect((await buildManifest({ root })).images.x).toBe('/my%20dir/x.png');
  });

  it('should classify extensions case-insensitively but keep their case', async () => {
    const root = await makeTempRoot();
    await touch(root, 'IMG.PNG');
    await touch(root, 'SOUND.OGG');

    const manifest = await buildManifest({ root });
    expect(manifest.images.IMG).toBe('/IMG.PNG');
    expect(manifest.audio.SOUND).toBe('/SOUND.OGG');
  });

  it('should allow the same id across different categories', async () => {
    const root = await makeTempRoot();
    await touch(root, 'same.png');
    await touch(root, 'same.ogg');

    const manifest = await buildManifest({ root });
    expect(manifest.images.same).toBe('/same.png');
    expect(manifest.audio.same).toBe('/same.ogg');
  });

  it('should skip hidden files, hidden directories and unknown extensions', async () => {
    const root = await makeTempRoot();
    await touch(root, '.hidden.png');
    await touch(root, '.hidden/inside.png');
    await touch(root, 'notes.txt');
    await touch(root, 'README');
    await touch(root, 'visible.png');

    const manifest = await buildManifest({ root });
    expect(Object.keys(manifest.images)).toEqual(['visible']);
  });

  it('should skip symbolic links', async () => {
    const root = await makeTempRoot();
    await touch(root, 'real.png');
    await touch(root, 'dir/inside.png');
    await symlink(join(root, 'real.png'), join(root, 'link.png'));
    await symlink(join(root, 'dir'), join(root, 'linked-dir'));

    const manifest = await buildManifest({ root });
    expect(Object.keys(manifest.images).sort()).toEqual(['inside', 'real']);
  });

  it('should sort ids and produce deterministic output', async () => {
    const root = await makeTempRoot();
    await touch(root, 'b.png');
    await touch(root, 'a.png');
    await touch(root, 'deep/nested/tree/c.png');

    const first = await buildManifest({ root });
    const second = await buildManifest({ root });

    expect(Object.keys(first.images)).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('should reject a missing root directory', async () => {
    const root = await makeTempRoot();
    await expect(
      buildManifest({ root: join(root, 'missing') }),
    ).rejects.toThrow('does not exist');
  });

  it('should reject a root path that is a file', async () => {
    const root = await makeTempRoot();
    await touch(root, 'plain.txt');
    await expect(
      buildManifest({ root: join(root, 'plain.txt') }),
    ).rejects.toThrow('is not a directory');
  });

  it('should reject an empty root', async () => {
    await expect(buildManifest({ root: '' })).rejects.toThrow(
      '--root must not be empty.',
    );
  });

  it('should reject invalid ids', async () => {
    const root = await makeTempRoot();
    await touch(root, '1bg.png');
    await expect(buildManifest({ root })).rejects.toThrow('Invalid asset id');

    const dottedRoot = await makeTempRoot();
    await touch(dottedRoot, 'bg.v2.png');
    await expect(buildManifest({ root: dottedRoot })).rejects.toThrow(
      'Invalid asset id',
    );
  });

  it('should reject duplicate ids within a category', async () => {
    const root = await makeTempRoot();
    await touch(root, 'a.png');
    await touch(root, 'a.jpg');

    await expect(buildManifest({ root })).rejects.toThrow(
      'Duplicate asset id "a" in images',
    );
  });

  it('should reject duplicate ids across directories', async () => {
    const root = await makeTempRoot();
    await touch(root, 'one/a.png');
    await touch(root, 'two/a.png');

    await expect(buildManifest({ root })).rejects.toThrow(
      'Duplicate asset id "a" in images: "one/a.png" and "two/a.png"',
    );
  });

  it('should reject null options', async () => {
    await expect(
      buildManifest(null as unknown as BuildManifestOptions),
    ).rejects.toThrow('--root must not be empty.');
  });
});

describe('generateManifest', () => {
  it('should write pretty JSON with a trailing newline and report counts', async () => {
    const root = await makeTempRoot();
    await touch(root, 'images/a.png');
    await touch(root, 'audio/b.ogg');
    await touch(root, 'scripts/c.vns');
    const out = join(root, 'nested/deep/manifest.json');

    const summary = await generateManifest({ root, out });
    expect(summary).toEqual({
      images: 1,
      audio: 1,
      scripts: 1,
      out: resolve(out),
    });

    const content = await readFile(out, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    expect(content.endsWith('\n\n')).toBe(false);
    expect(JSON.parse(content)).toEqual(await buildManifest({ root }));
  });

  it('should overwrite an existing manifest file', async () => {
    const root = await makeTempRoot();
    await touch(root, 'a.png');
    const out = join(root, 'manifest.json');
    await writeFile(out, 'old');

    await generateManifest({ root, out });

    expect(JSON.parse(await readFile(out, 'utf8'))).toEqual(
      await buildManifest({ root }),
    );
  });

  it('should allow the output file to live inside the scanned root', async () => {
    const root = await makeTempRoot();
    await touch(root, 'a.png');
    const out = join(root, 'manifest.json');

    const first = await generateManifest({ root, out });
    const second = await generateManifest({ root, out });

    expect(first).toEqual(second);
  });

  it('should reject an empty out path', async () => {
    await expect(generateManifest({ root: 'public', out: '' })).rejects.toThrow(
      '--out must not be empty.',
    );
  });

  it('should reject an out path that is an existing directory', async () => {
    const root = await makeTempRoot();
    const outDir = join(root, 'outdir');
    await mkdir(outDir);
    await expect(generateManifest({ root, out: outDir })).rejects.toThrow(
      'Failed to write manifest',
    );
  });

  it('should reject a missing root', async () => {
    const root = await makeTempRoot();
    await expect(
      generateManifest({
        root: join(root, 'missing'),
        out: join(root, 'm.json'),
      }),
    ).rejects.toThrow('does not exist');
  });
});

describe('CLI', () => {
  const scriptPath = fileURLToPath(
    new URL('../buildManifest.ts', import.meta.url),
  );
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

  function run(args: string[]) {
    return spawnSync(
      process.execPath,
      ['--experimental-strip-types', scriptPath, ...args],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  }

  it('should print usage and exit with code 0 for --help', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  it('should generate a manifest and exit with code 0', async () => {
    const root = await makeTempRoot();
    await touch(root, 'assets/images/bg/bg_campus.png');
    const out = join(root, 'manifest.json');

    const result = run(['--root', root, '--out', out]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('images=1');
    const manifest = JSON.parse(await readFile(out, 'utf8'));
    expect(manifest.images.bg_campus).toBe('/assets/images/bg/bg_campus.png');
  });

  it('should exit with code 1 for a missing root', async () => {
    const root = await makeTempRoot();
    const result = run(['--root', join(root, 'missing')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not exist');
  });

  it('should exit with code 1 for an unknown option', () => {
    const result = run(['--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown option');
  });
});
