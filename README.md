# Phetkasem Brewery System

Next.js App Router, TypeScript, Tailwind CSS and PostgreSQL through Prisma.

The reviewed Brew Day interface runs inside a React client component. Interactive behavior is migrated in src/components/brew-runtime.js. The API, validation, database adapter and application shell use TypeScript.

## Run

Use Node.js 22+ and PostgreSQL.

1. Run npm ci.
2. Copy .env.example to .env. Configure DATABASE_URL, a strong APP_PASSWORD and a random SESSION_SECRET of at least 32 characters.
3. Run npm run db:migrate.
4. Run npm run dev.
5. Open http://localhost:3000 and sign in using APP_PASSWORD.

Production uses npm run build then npm start. Use HTTPS for secure session cookies. This initial version has one shared brewery workspace and one administrator password. Configure request rate limiting at your hosting proxy before public deployment.

## Workflows

- Editable coolers with three fixed 60 L All Rounder slots, drag and drop swaps and mobile move selection.
- Plan, Ferment, Cold crash and a separate confirmed Complete action.
- OG, pH, dates, elapsed days, notes, and SG readings with edit/delete.
- BeerXML import, recipe editing and soft deletion, yeast laboratory/product ID, and dry hop rounds.
- Haze 7-0 v.23 uses the brewer-confirmed schedule of 2 days after fermentation starts and 4 days before a 14-day fermentation ends. Other recipes retain their own schedules. Per-round date overrides are supported.
- Recipe snapshots protect existing batches from subsequent recipe library edits.
- Stock names come from recipes. Malt displays in kg, Hop/Yeast in g. Stored quantities use grams.
- Saved Ferment/Cold crash/Complete consumes recipe malt and yeast. Plan releases those ingredients. Saved checked dry hops consume individual ingredients, and unchecking releases them. Repeated saves do not add another deduction.
- Complete transfers usage to history. Deleting history releases that record's usage.
- Quantities use the full recipe and are not scaled to fermenter volume.
- Legacy batches start stock accounting when edited and saved.
- Calendar, daily pending dry hops, stock thresholds Malt ≤10 kg / Yeast ≤100 g / Hop ≤200 g, Thai/English, responsive navigation.

## Database and concurrent devices

The initial schema stores a validated brewery document in a PostgreSQL JSONB workspace record. Recipe and batch records are embedded. Revision-checked atomic updates protect the whole change, including stock usage, against concurrent overwrites. A conflict stops saving and asks the user to export local changes before reloading. This migration-oriented schema does not yet use a separate table for each business entity.

The UI queues saves and shows their status. After an error, export the current in-memory data before reloading. Other devices see updated data on reload. Language remains per-browser.

The original HTML now has Export data. In the Next.js app use Import backup to validate and replace shared data. Back up first. Imported recipes are stored with the board and stock data.

## LINE

Configure LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID on the server. Add the OA as a friend on the receiving LINE account.

The authenticated LINE button calls POST /api/line. For daily delivery configure your hosting scheduler to call GET /api/cron/alerts with Authorization Bearer CRON_SECRET.

Schedule 01:00 UTC for 08:00 Thailand time. Configure CRON_SECRET on the server. The daily message and retry key are saved before sending. Accepted daily deliveries are not sent again. Provider quotas apply. Credentials stay on the server.

## Checks

- npm run typecheck
- npm run lint
- npm test
- npm run build
- npm run test:integration (requires a migrated test database)

Pushing to GitHub does not provision hosting, PostgreSQL, or LINE. Configure your selected host and run database migrations before using shared data.
