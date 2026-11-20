import { normalizeUrlPrefix, parseCliArgs } from '../buildManifest.ts';

describe('normalizeUrlPrefix', () => {
  it('should normalize empty and slash-only prefixes to an empty prefix', () => {
    expect(normalizeUrlPrefix('')).toBe('');
    expect(normalizeUrlPrefix('/')).toBe('');
    expect(normalizeUrlPrefix('///')).toBe('');
  });

  it('should strip trailing slashes and add a leading slash', () => {
    expect(normalizeUrlPrefix('/assets')).toBe('/assets');
    expect(normalizeUrlPrefix('/assets/')).toBe('/assets');
    expect(normalizeUrlPrefix('assets')).toBe('/assets');
    expect(normalizeUrlPrefix('assets/')).toBe('/assets');
  });

  it('should keep absolute and protocol-relative URLs unchanged', () => {
    expect(normalizeUrlPrefix('https://cdn.example.com/assets')).toBe(
      'https://cdn.example.com/assets',
    );
    expect(normalizeUrlPrefix('//cdn.example.com/assets')).toBe(
      '//cdn.example.com/assets',
    );
  });

  it('should reject non-string prefixes', () => {
    expect(() => normalizeUrlPrefix(null as unknown as string)).toThrow(
      'expected a string',
    );
  });
});

describe('parseCliArgs', () => {
  it('should apply defaults when no arguments are provided', () => {
    expect(parseCliArgs([])).toEqual({
      help: false,
      root: 'public',
      urlPrefix: '',
      out: 'public/assets/manifest.json',
    });
  });

  it('should parse long options', () => {
    expect(
      parseCliArgs([
        '--root',
        'dist',
        '--url-prefix',
        '/assets',
        '--out',
        'tmp/manifest.json',
      ]),
    ).toEqual({
      help: false,
      root: 'dist',
      urlPrefix: '/assets',
      out: 'tmp/manifest.json',
    });
  });

  it('should parse short options and equals syntax', () => {
    expect(parseCliArgs(['-r', 'dist', '-o', 'm.json', '-h'])).toEqual({
      help: true,
      root: 'dist',
      urlPrefix: '',
      out: 'm.json',
    });
    expect(parseCliArgs(['--root=assets']).root).toBe('assets');
    expect(parseCliArgs(['--help']).help).toBe(true);
  });

  it('should reject unknown options', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow('Unknown option');
  });

  it('should reject positional arguments', () => {
    expect(() => parseCliArgs(['resources'])).toThrow();
  });

  it('should reject options with missing values', () => {
    expect(() => parseCliArgs(['--root'])).toThrow();
  });

  it('should reject empty root and out paths', () => {
    expect(() => parseCliArgs(['--root', ''])).toThrow(
      '--root must not be empty.',
    );
    expect(() => parseCliArgs(['--out', ''])).toThrow(
      '--out must not be empty.',
    );
  });
});
