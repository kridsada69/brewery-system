import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';

const [target, action, ...args] = process.argv.slice(2);
const commands = {
  dev: ['node_modules/next/dist/bin/next', 'dev', '--webpack'],
  build: ['node_modules/next/dist/bin/next', 'build', '--webpack'],
  start: ['node_modules/next/dist/bin/next', 'start'],
  migrate: ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  generate: ['node_modules/prisma/build/index.js', 'generate'],
};
if (!['dev', 'prod'].includes(target) || !commands[action] ||
    (action === 'dev' && target !== 'dev') ||
    (['build', 'start'].includes(action) && target !== 'prod')) {
  throw new Error('Invalid environment or command');
}
let settings;
try {
  settings = parseEnv(readFileSync(`.env.${target}`, 'utf8'));
} catch {
  throw new Error(`Create .env.${target} first: npm run env:init`);
}
for (const key of ['DATABASE_URL', 'APP_PASSWORD', 'SESSION_SECRET']) {
  if (!settings[key] || settings[key].startsWith('replace-')) {
    throw new Error(`Configure ${key} in .env.${target}`);
  }
}
if (settings.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
// Refuse an accidentally shared database, even if credentials differ.
try {
  const other = parseEnv(readFileSync(`.env.${target === 'dev' ? 'prod' : 'dev'}`, 'utf8'));
  const identity = value => {
    const url = new URL(value);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  };
  if (other.DATABASE_URL && identity(other.DATABASE_URL) === identity(settings.DATABASE_URL)) {
    throw new Error('Dev and prod must use separate databases');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const result = spawnSync(process.execPath, [...commands[action], ...args], {
  stdio: 'inherit',
  env: {...process.env, ...settings, NODE_ENV: target === 'dev' ? 'development' : 'production'},
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
