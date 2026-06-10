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

## Data layer & moving to Firebase

All persistence currently lives in the browser (IndexedDB), deliberately wrapped
behind three small service modules so the UI never touches storage directly:

| File | Today | With Firebase |
| --- | --- | --- |
| `src/services/storage.js` | IndexedDB document store | Firestore collections |
| `src/services/auth.js` | local accounts (salted SHA-256) | Firebase Auth |
| `src/services/images.js` | compressed blobs in IndexedDB | Firebase Storage uploads + download URLs |

To migrate: keep every exported function signature, swap the bodies for Firebase
SDK calls, and the pages/components work unchanged. Client-side compression in
`images.js` should be kept — it runs *before* upload, which is exactly what you
want for Firebase's free-tier storage and bandwidth quotas.

## Try it locally

Since accounts are stored in your browser, you can simulate the whole flow in one
browser by signing out and registering again:

1. Register as an **Owner** → create a job → invite `crew@example.com`
2. Sign out → register `crew@example.com` as an **Employee** → the job appears automatically
3. Post an update with photos → sign back in as the owner → watch the status bar
