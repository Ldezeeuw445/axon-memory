// Frontend unit tests (src/**). Edge functions are Deno and run under `npm test`.
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.{js,jsx}'], exclude: ['**/node_modules/**', 'dist/**', 'supabase/**'] } });
