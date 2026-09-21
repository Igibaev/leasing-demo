import { closeSync, existsSync, openSync, readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${args.join(' ')}`);
}
const prisma = resolve('node_modules/prisma/build/index.js');
if (mode === 'test' || mode === 'browser') {
  const folder = mkdtempSync(join(tmpdir(), 'leasing-test-'));
  const database = join(folder, 'test.db');
  const env = { ...process.env, LEASING_DATABASE_URL: `file:${database}` };
  try {
    closeSync(openSync(database, 'a'));
    writeFileSync(join(folder, 'schema.prisma'), readFileSync('prisma/schema.prisma', 'utf8').replace('file:./dev.db', `file:${database}`));
    symlinkSync(resolve('prisma/migrations'), join(folder, 'migrations'), 'dir');
    run([prisma, 'migrate', 'deploy', '--schema', join(folder, 'schema.prisma')], env);
    run(['--import', 'tsx', 'prisma/seed.ts'], env);
    run(mode === 'browser' ? ['scripts/browser-smoke.mjs'] : ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.e2e.config.ts'], env);
  } finally { rmSync(folder, { recursive: true, force: true }); }
} else if (mode === 'setup' || mode === 'reset') {
  if (process.env.LEASING_DATABASE_URL) throw new Error('setup/reset only operate on prisma/dev.db; unset LEASING_DATABASE_URL');
  const database = resolve('prisma/dev.db');
  const fresh = !existsSync(database);
  // SQLite schema engine may require the target file to exist on a fresh checkout.
  closeSync(openSync(database, 'a'));
  if (mode === 'reset') {
    if (!process.argv.includes('--confirm-demo-reset')) throw new Error('Reset deletes local demo data. Use npm run db:reset -- --confirm-demo-reset');
    run([prisma, 'migrate', 'reset', '--force', '--skip-seed']);
    run(['--import', 'tsx', 'prisma/seed.ts']);
  } else {
    run([prisma, 'migrate', 'deploy']);
    // Do not reseed a populated database or overwrite user changes.
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient();
    const populated = await client.config.count();
    await client.$disconnect();
    if (fresh || !populated) run(['--import', 'tsx', 'prisma/seed.ts']);
  }
} else throw new Error('Expected setup, reset or test');
