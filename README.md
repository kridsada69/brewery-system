# Phetkasem Brewery System

Next.js App Router, TypeScript, Tailwind CSS and PostgreSQL through Prisma.

The reviewed Brew Day interface runs inside a React client component. Interactive behavior is migrated in src/components/brew-runtime.js. The API, validation, database adapter and application shell use TypeScript.

## วิธีรันโปรเจกต์ (Run)

### 1. เตรียมเครื่อง

ติดตั้ง Node.js 22 ขึ้นไป และ Docker Desktop ที่มี Docker Compose v2
(รองรับ `--wait`) แล้วเปิด Docker Desktop ให้พร้อมก่อนรันฐานข้อมูล
ใช้คำสั่งทั้งหมดจากโฟลเดอร์ `brewery-system`

ตรวจสอบเครื่องมือ:

```bash
node -v
npm -v
docker compose version
docker info
```

หากใช้ nvm ให้เลือก Node.js รุ่นที่ติดตั้งไว้และมีเวอร์ชันตั้งแต่ 22 ขึ้นไปก่อน
จากนั้นติดตั้ง dependencies:

```bash
npm ci
```

### 2. รัน Development ครั้งแรก

```bash
npm run setup:dev
npm run start:dev
```

เปิด [http://localhost:3000](http://localhost:3000) แล้วเข้าระบบด้วยค่า
`APP_PASSWORD` ในไฟล์ `.env.dev`

`setup:dev` จะสร้างไฟล์ `.env.dev` และ `.env.prod` หากยังไม่มี เปิดเฉพาะฐานข้อมูล dev
สร้าง Prisma Client และสร้าง/อัปเดตตารางด้วย migrations ตามลำดับ
ครั้งแรกจะนำ `APP_PASSWORD` จาก `.env` เดิมมาใช้กับ dev ถ้ามี
หากไม่มีจะสุ่มรหัสให้ ส่วน production จะมีรหัสของตัวเอง
การรันซ้ำจะไม่เขียนทับไฟล์ตั้งค่าที่มีอยู่แล้ว

### 3. รัน Development ครั้งถัดไป

เปิด Docker Desktop แล้วรัน:

```bash
npm run db:up:dev
npm run start:dev
```

ใช้ `npm run dev` แทน `npm run start:dev` ได้ ทั้งสองคำสั่งใช้ Webpack อยู่แล้ว
จึงไม่ต้องต่อท้าย `-- --webpack`
หากอัปเดตโค้ดแล้วมี migrations ใหม่ ให้รัน `npm run db:migrate:dev` ก่อนเปิดแอป

### 4. รัน Production บนเครื่องนี้

หยุดแอป dev ด้วย `Ctrl+C` ก่อน เพราะ dev และ production ใช้โฟลเดอร์ `.next` ร่วมกัน
ไม่ควรรันแอปทั้งสองโหมดพร้อมกันใน checkout เดียว
ส่วนฐานข้อมูลทั้งสองชุดสามารถเปิดพร้อมกันได้

ครั้งแรก (หลัง `npm ci`):

```bash
npm run setup:prod
npm run build:prod
npm run start:prod
```

เปิด [http://localhost:3001](http://localhost:3001) แล้วใช้ `APP_PASSWORD` จาก `.env.prod`

ครั้งถัดไป หากโค้ดและค่าที่ใช้ตอน build ไม่เปลี่ยน:

```bash
npm run db:up:prod
npm run start:prod
```

เมื่ออัปเดตโค้ด ให้หยุดแอป สำรองข้อมูล แล้วรัน:

```bash
npm ci
npm run db:up:prod
npm run db:migrate:prod
npm run build:prod
npm run start:prod
```

เมื่อนำขึ้นใช้งานสาธารณะ ต้องตั้ง HTTPS และ rate limiting ที่ proxy

### ไฟล์ตั้งค่าและการแยกฐานข้อมูล

| รายการ | Development | Production |
| --- | --- | --- |
| ไฟล์ตั้งค่า | `.env.dev` | `.env.prod` |
| พอร์ตแอป | 3000 | 3001 |
| พอร์ต PostgreSQL | 5433 | 5434 |
| ชื่อฐานข้อมูลและผู้ใช้ | brewery_dev | brewery_prod |
| Volume เก็บข้อมูล | brewery_dev_data | brewery_prod_data |

ทั้งสองโหมดมีผู้ใช้ รหัสผ่านฐานข้อมูล รหัสเข้าแอป และ session secret แยกกัน
ฐานข้อมูลเปิดรับการเชื่อมต่อเฉพาะ localhost และเก็บข้อมูลถาวรในคนละ volume
คำสั่งแอปจะใช้ค่าจากไฟล์ที่เลือก โดยทับค่าเดียวกันจาก terminal หรือ `.env` เดิม
และปฏิเสธเมื่อ dev/prod ชี้ไปยังฐานข้อมูลเดียวกัน
ไฟล์ที่มีรหัสจริงถูกละเว้นจาก Git

สร้างไฟล์ตั้งค่าอย่างเดียวได้ด้วย:

```bash
npm run env:init
```

เปลี่ยนรหัสเข้าแอปได้โดยแก้ `APP_PASSWORD` ในไฟล์ของโหมดนั้น แล้วหยุดและเปิดแอปใหม่
หากเปลี่ยนค่าที่ใช้ตอน build ของ production ต้อง build ใหม่ด้วย
อย่าใส่รหัสจริงลงใน README หรือ commit ไฟล์ตั้งค่า

หาก volume ถูกสร้างแล้ว การแก้ `POSTGRES_PASSWORD` ในไฟล์อย่างเดียวจะไม่เปลี่ยนรหัสใน
PostgreSQL ต้องเปลี่ยนรหัสผู้ใช้ในฐานข้อมูลด้วย และแก้ `DATABASE_URL` ให้ตรงกัน

### หยุดระบบ

กด `Ctrl+C` ใน terminal ที่รันแอป จากนั้นหยุดฐานข้อมูลของโหมดที่ต้องการ:

```bash
npm run db:stop:dev
# หรือ
npm run db:stop:prod
```

การหยุดฐานข้อมูลไม่ลบข้อมูล หลีกเลี่ยง `docker compose down -v`
เพราะจะลบ volume และข้อมูลในฐานข้อมูลด้วย

### ใช้ฐานข้อมูล Production ภายนอก

รัน `npm run env:init` แล้วแก้ `DATABASE_URL` ใน `.env.prod` ให้เป็นฐานข้อมูลปลายทาง
ตั้ง `APP_PASSWORD` และ secrets ตามที่ต้องการ จากนั้นรัน:

```bash
npm run db:migrate:prod
npm run build:prod
npm run start:prod
```

กรณีนี้ไม่ต้องรัน `setup:prod` หรือ `db:up:prod` เพราะใช้ฐานข้อมูลภายนอก
ควรสำรองข้อมูลก่อน migrations ทุกครั้ง

### แก้ปัญหาที่พบบ่อย

| อาการ | วิธีตรวจและแก้ |
| --- | --- |
| `docker: command not found` | ติดตั้ง Docker Desktop แล้วเปิด terminal ใหม่ |
| เชื่อมต่อ Docker daemon ไม่ได้ | เปิด Docker Desktop และรอให้พร้อม ตรวจด้วย `docker info` |
| Node.js เวอร์ชันไม่รองรับ | เลือก Node.js 22 ขึ้นไป แล้วติดตั้ง dependencies ด้วย `npm ci` |
| `Cannot find module '.prisma/client/default'` | หยุดแอป แล้วรัน `setup:dev` หรือ `setup:prod` ตามโหมดเพื่อสร้าง Prisma Client และเตรียมฐานข้อมูล |
| `Database unavailable` หรือเชื่อมต่อฐานข้อมูลไม่ได้ | รัน `db:up:dev` หรือ `db:up:prod` ตรวจ `DATABASE_URL` ในไฟล์ของโหมดนั้น แล้วรัน migrations |
| Turbopack โหลด native bindings ไม่ได้ | ใช้ `npm run start:dev` ซึ่งเลือก Webpack ให้แล้ว หากต้องการซ่อม dependencies ให้หยุดแอปแล้วรัน `npm ci` |
| พอร์ตถูกใช้งาน | หยุดโปรแกรมเดิมที่ใช้พอร์ตนั้น หรือเปลี่ยน `PORT` ของแอปในไฟล์ตั้งค่า |
| Production แจ้งว่าไม่มี build | หยุดแอป dev แล้วรัน `npm run build:prod` ก่อน `npm run start:prod` |

คำสั่งทั่วไป `build`, `db:generate`, `db:migrate` และ `test:integration`
ยังมีไว้สำหรับ CI ที่ส่ง environment variables เข้ามาเอง
สำหรับการรันในเครื่องให้ใช้คำสั่งที่ระบุโหมดตามด้านบน

## Deploy บน Railway

สร้าง PostgreSQL service และแอปใน Railway project เดียวกัน แล้วตั้งค่าแอป:

| รายการ | ค่า |
| --- | --- |
| Build Command | `npm run build` |
| Pre-deploy Command | `npm run db:migrate` |
| Start Command | `npm run start:cloud` |
| Healthcheck Path | `/login` |

ตั้ง environment variables ใน Railway:

- `DATABASE_URL`: อ้างอิง `DATABASE_URL` ของ PostgreSQL service ใน project
- `APP_PASSWORD`: รหัสเข้าแอปบน cloud
- `SESSION_SECRET`: ค่าสุ่มอย่างน้อย 32 ตัวอักษร
- `CRON_SECRET`: ค่าสุ่มแยกสำหรับ scheduler หากเปิดใช้งาน
- `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_USER_ID`: ตั้งเมื่อใช้แจ้งเตือน LINE

ให้ Railway กำหนด `PORT` และตั้ง `NODE_ENV=production`
คำสั่ง `start:cloud` อ่านค่าจาก Railway โดยตรง ไม่ต้องอัปโหลด `.env.prod`
ไฟล์ `.railwayignore` กันไฟล์ค่าลับและ dependencies บนเครื่องออกจากการอัปโหลดด้วย CLI
เลือก Generate Domain หลัง deploy เพื่อเปิดแอปผ่าน HTTPS
ฐานข้อมูล cloud เป็นคนละชุดกับ dev/prod ใน Docker บนเครื่อง และเริ่มต้นโดยไม่มีข้อมูลเดิม

## Workflows

- Editable coolers with three fixed 60 L All Rounder slots, drag and drop swaps and mobile move selection.
- Plan, Ferment, Cold crash and a separate confirmed Complete action.
- OG, pH, dates, elapsed days, notes, and SG readings with edit/delete.
- BeerXML import, recipe editing and soft deletion, yeast laboratory/product ID, and dry hop rounds.
- Haze 7-0 v.23 uses the brewer-confirmed schedule of 2 days after fermentation starts and 4 days before a 14-day fermentation ends. Other recipes use explicit start offsets when supplied; otherwise the default calendar schedule is the fermentation start date plus the BeerXML dry-hop TIME converted from minutes to whole days, as requested by the brewer. TIME remains separately displayed as contact duration. Per-round date overrides are supported.
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
