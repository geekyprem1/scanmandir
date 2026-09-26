import { afterEach, describe, expect, it } from 'vitest';
import { getConfig, resetConfigCache } from '../../src/shared/config.js';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  resetConfigCache();
});

describe('configuration guards', () => {
  it('requires DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    resetConfigCache();
    expect(() => getConfig()).toThrow(/DATABASE_URL/);
  });

  it('refuses the development filesystem storage driver in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'local';
    resetConfigCache();
    expect(() => getConfig()).toThrow(/must not run in production/);
  });

  it('refuses the default storage signing secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_URL_SECRET = 'development_only_storage_secret_change_me';
    resetConfigCache();
    expect(() => getConfig()).toThrow();
  });

  it('rejects a signing secret that is too short to be meaningful', () => {
    process.env.STORAGE_URL_SECRET = 'short';
    resetConfigCache();
    expect(() => getConfig()).toThrow(/STORAGE_URL_SECRET/);
  });

  it('rejects a non-numeric port instead of silently defaulting', () => {
    process.env.API_PORT = 'not-a-port';
    resetConfigCache();
    expect(() => getConfig()).toThrow(/API_PORT/);
  });

  it('applies documented defaults when optional values are absent', () => {
    delete process.env.API_PORT;
    delete process.env.JOB_MAX_ATTEMPTS;
    resetConfigCache();

    const config = getConfig();
    expect(config.API_PORT).toBe(3000);
    expect(config.JOB_MAX_ATTEMPTS).toBe(5);
    expect(config.isProduction).toBe(false);
  });
});
