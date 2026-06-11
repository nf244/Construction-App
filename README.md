# SiteTrack — Construction Job Tracker

A photo-heavy construction job tracking app. Create jobs, build the crew, post
progress updates with compressed photos, and watch status bars move from
groundbreaking to handover.

## Features

- **Login / registration** with three roles: **Owner**, **Project Manager**, **Employee**
- **Jobs**: owners and project managers create jobs with client, address, and scope
- **Team & invites**: pick existing users when creating a job, or invite anyone by
  email — pending invites are redeemed automatically the first time that email signs up
- **Progress updates**: any team member posts updates with descriptions and photos;
  updates can move the job's overall progress
- **Status bars**: every job card shows a live progress bar; the owner's dashboard
  shows all jobs company-wide with totals and average progress
- **Photo handling**: every photo is compressed client-side before storage
  (resized to 1600px JPEG plus a 360px thumbnail); grids render thumbnails only
  and the full image loads on demand in a lightbox

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Roles

| Ability | Owner | Project Manager | Employee |
| --- | :-: | :-: | :-: |
| See all jobs | ✅ | their jobs | their jobs |
| Create jobs | ✅ | ✅ | — |
| Invite / remove team members | ✅ | jobs they run | — |
| Set status & progress directly | ✅ | jobs they run | — |
| Post photo/description updates | ✅ | ✅ | ✅ |

## Data layer: local mode vs Firebase mode

The app picks its backend at startup based on environment variables:

- **No Firebase config** → local mode: accounts and data live in the browser
  (IndexedDB). Zero setup, but data does not sync between devices.
- **`VITE_FIREBASE_*` set** → Firebase mode: Firebase Auth (email/password)
  for accounts, Firestore for jobs/users/photos. Everything syncs across
  devices.

The switch lives in `src/services/firebase.js`; `storage.js` and `auth.js` are
facades over `src/services/local/` and `src/services/cloud/`. The UI never
knows which backend it is on.

### Setting up Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add
   project** (Analytics optional).
2. **Build → Authentication → Get started** → Sign-in method → enable
   **Email/Password**.
3. **Build → Firestore Database → Create database** → production mode → pick a
   region near you.
4. In Firestore → **Rules**, paste the contents of [`firestore.rules`](firestore.rules)
   and **Publish**.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register the app →
   copy the `firebaseConfig` values into `.env` (see `.env.example`) and/or
   into Vercel → Project → Settings → Environment Variables:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
6. Authentication → Settings → **Authorized domains**: add your Vercel domain
   so logins work in production.

> **Why photos live in Firestore:** new Firebase projects require the paid
> Blaze plan for Cloud Storage, so on the free tier compressed photos are
> stored as base64 inside Firestore `photos` documents. The compressor keeps
> every photo well under Firestore's 1 MiB document cap (a typical phone photo
> stores at 30–150 KB). If you upgrade to Blaze later, move
> `savePhoto`/`photoUrl` in `src/services/images.js` to Firebase Storage.

### Testing against the emulator

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-sitetrack
VITE_FIREBASE_API_KEY=demo VITE_FIREBASE_AUTH_DOMAIN=x VITE_FIREBASE_PROJECT_ID=demo-sitetrack \
  VITE_FIREBASE_APP_ID=demo VITE_FIREBASE_EMULATOR=1 npx vite --port 5174
node scripts/smoke-test.mjs http://localhost:5174
```

## Try it locally

Since accounts are stored in your browser, you can simulate the whole flow in one
browser by signing out and registering again:

1. Register as an **Owner** → create a job → invite `crew@example.com`
2. Sign out → register `crew@example.com` as an **Employee** → the job appears automatically
3. Post an update with photos → sign back in as the owner → watch the status bar
