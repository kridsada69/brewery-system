import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';

const legacy = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
for (const target of ['dev', 'prod']) {
  const path = `.env.${target}`;
  if (existsSync(path)) { console.log(`Kept existing ${path}`); continue; }
  const secret = () => randomBytes(32).toString('hex');
  const dbPassword = secret();
  const port = target === 'dev' ? 5433 : 5434;
  const password = target === 'dev' && legacy.APP_PASSWORD ? legacy.APP_PASSWORD : secret();
  writeFileSync(path, [
    `POSTGRES_PASSWORD=${dbPassword}`,
    `DATABASE_URL=postgresql://brewery_${target}:${dbPassword}@localhost:${port}/brewery_${target}?schema=public`,
    `APP_PASSWORD=${password}`, `SESSION_SECRET=${secret()}`, `CRON_SECRET=${secret()}`,
    'LINE_CHANNEL_ACCESS_TOKEN=', 'LINE_USER_ID=', `PORT=${target === 'dev' ? 3000 : 3001}`, '',
  ].join('\n'), {mode: 0o600, flag: 'wx'});
  console.log(`Created ${path}; login password is stored in APP_PASSWORD`);
}
