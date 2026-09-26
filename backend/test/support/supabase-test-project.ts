/**
 * Stand-in for a Supabase project in tests.
 *
 * Verification runs against a locally generated key set, so nothing here reaches the
 * network. The URL matters because it derives the default issuer and audience: the
 * integration project's environment, the global setup and the token signer in
 * `tokens.ts` all have to agree on it, which is why it lives in one place.
 */
export const SUPABASE_TEST_URL = 'https://test-project.supabase.co';
export const SUPABASE_TEST_ISSUER = `${SUPABASE_TEST_URL}/auth/v1`;
export const SUPABASE_TEST_AUDIENCE = 'authenticated';
