import { describe, expect, it } from 'vitest';
import { hostPatternFor, patternCovers } from '@/core/profiles/host-permission';
import { normalizeEndpoint, suggestAddressing } from '@/core/profiles/profile-store';

describe('host permissions', () => {
  it('asks for the host only with path-style and for its subdomains with virtual-hosted', () => {
    expect(hostPatternFor({ endpoint: 'https://s3.example.com', addressing: 'path' })).toBe(
      'https://s3.example.com/*',
    );
    expect(hostPatternFor({ endpoint: 'https://s3.example.com:9000', addressing: 'virtual' })).toBe(
      'https://*.s3.example.com/*',
    );
  });

  it('never builds a wildcard for localhost or IP addresses', () => {
    expect(hostPatternFor({ endpoint: 'http://localhost:8333', addressing: 'virtual' })).toBe(
      'http://localhost/*',
    );
    expect(hostPatternFor({ endpoint: 'http://127.0.0.1:9000', addressing: 'virtual' })).toBe(
      'http://127.0.0.1/*',
    );
  });

  it('knows when a wildcard still covers another profile on the same host', () => {
    const pathProfile = { endpoint: 'https://s3.example.com', addressing: 'path' as const };
    expect(patternCovers('https://*.s3.example.com/*', pathProfile)).toBe(true);
    expect(patternCovers('https://s3.example.com/*', pathProfile)).toBe(true);
    expect(patternCovers('https://other.example.com/*', pathProfile)).toBe(false);
    expect(patternCovers('http://s3.example.com/*', pathProfile)).toBe(false);
  });
});

describe('endpoint input', () => {
  it('normalises URLs and refuses plain http outside the local machine', () => {
    expect(normalizeEndpoint(' https://s3.example.com/ ')).toEqual({
      endpoint: 'https://s3.example.com',
    });
    expect(normalizeEndpoint('http://localhost:8333')).toEqual({
      endpoint: 'http://localhost:8333',
    });
    expect(normalizeEndpoint('http://s3.example.com')).toEqual({ problem: 'insecureRemote' });
    expect(normalizeEndpoint('ftp://x')).toEqual({ problem: 'unsupportedScheme' });
    expect(normalizeEndpoint('not a url')).toEqual({ problem: 'invalid' });
  });

  it('suggests virtual-hosted addressing for AWS only', () => {
    expect(suggestAddressing('https://s3.eu-west-1.amazonaws.com')).toBe('virtual');
    expect(suggestAddressing('https://s3.example.com')).toBe('path');
  });
});
