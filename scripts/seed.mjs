import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import config from './database-config.cjs';
try {
  config.assertClientProvider(config.applyDatabaseEnvironment());
  const result = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], {stdio:'inherit', env:process.env});
  process.exitCode = result.status ?? 1;
} catch (error) {console.error(error.message); process.exitCode = 1;}
