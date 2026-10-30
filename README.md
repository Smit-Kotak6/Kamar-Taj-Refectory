# Kamar-Taj Refectory

A full-stack refectory management app for students, kitchen administrators, and meal-scanning staff. Students manage meals and view their billing activity; administrators manage menus, memberships, rates, and reports; staff redeem meal QR codes.

## Features

- **Students:** institute-email signup and login, meal bookings, leave requests, rotating meal QR codes, rebate history, and monthly billing.
- **Administrators:** membership management, meal schedules and closures, menu publishing, meal rates, kitchen overview, demand and waste reports.
- **Staff:** meal verification and redemption, including manual code entry.
- Published menus become read-only once their meal has ended or their date has passed.

Payment collection and predictive forecasting are outside the current scope.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma |
| Hosting | Render Web Service and Render PostgreSQL |

## Project structure

```text
backend/    Express API, Prisma schema and migrations
frontend/   React application
```

## Run locally

You need Node.js, npm, and a running PostgreSQL database. The frontend and backend run in separate terminals during development.

1. Clone the working branch and install dependencies:

   ```bash
   git clone -b krunal https://github.com/dhruvbhaikagathara-bit/kamar-taj-refectory.git
   cd kamar-taj-refectory
   npm --prefix backend ci
   npm --prefix frontend ci
   ```

2. Create `backend/.env` using `backend/.env.example` as a starting point. Set `DATABASE_URL` to your **local** PostgreSQL connection string and provide unique, private values for `JWT_SECRET` and `QR_SECRET`. Set `INSTITUTE_TZ=Asia/Kolkata` for institute meal times. Never commit `.env` or real secrets.

3. Apply migrations and generate the Prisma client:

   ```bash
   cd backend
   npx prisma migrate deploy
   npm run db:generate
   ```

4. Start the backend from `backend/`:

   ```bash
   npm run dev
   ```

5. In a second terminal, start the frontend from `frontend/`:

   ```bash
   cd frontend
   npm run dev
   ```

Open `http://localhost:5173`. The local API runs at `http://localhost:5000`; the frontend development server forwards API requests to it. You can check API readiness at `http://localhost:5000/api/ready`.

## Accounts and roles

Sign up with an `@mnnit.ac.in` email address. New accounts start with the **STUDENT** role. Admin and staff access must be granted deliberately; public signup does not create privileged accounts.

For a local database, first sign up the intended account, then run the relevant promotion script from `backend/`:

```bash
npx tsx src/promoteDemoAdmin.ts admin1@mnnit.ac.in
npx tsx src/promoteDemoStaff.ts staff1@mnnit.ac.in
```

Replace the example addresses with the actual signed-up `@mnnit.ac.in` addresses. Log out and sign back in after promotion. The promotion scripts must connect to the **same database** as the website whose roles you want to change. Do not point them at production by accident.

## Production deployment on Render

This project can serve the built frontend and API from one Render Web Service, backed by a separate Render PostgreSQL database.

Use the repository's `krunal` branch, leave **Root Directory** blank, and set these commands on the Web Service:

**Build command**

```bash
npm --prefix frontend ci --include=dev && npm --prefix frontend run build && npm --prefix backend ci --include=dev && npm --prefix backend run db:generate && npm --prefix backend run build
```

**Start command**

```bash
cd backend && npx prisma migrate deploy && node dist/src/seedSchedule.js && npm start
```

Configure the Web Service environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Render PostgreSQL **Internal Database URL** |
| `NODE_ENV` | `production` |
| `INSTITUTE_TZ` | `Asia/Kolkata` |
| `JWT_SECRET` | A long, random secret |
| `QR_SECRET` | A separate long, random secret |

Render supplies `PORT`; do not hard-code it. Do not commit database URLs or secrets. For a locally run promotion script against the hosted database, use Render's **External Database URL** with TLS enabled (for example, `sslmode=require`), then clear that temporary environment variable. A newly created hosted database starts without your local users and data.

After deployment, open the Web Service's `.onrender.com` URL and check `/api/ready`. The production service also serves frontend routes, so refreshing an app page should load the site.

## Build checks

```bash
npm --prefix backend run build
npm --prefix frontend run build
```

These commands verify TypeScript compilation and the production frontend bundle. A successful build does not replace checking login, role access, bookings, menu changes, billing, and QR redemption against the intended database.
