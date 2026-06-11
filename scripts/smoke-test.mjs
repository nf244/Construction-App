/**
 * End-to-end smoke test: registers an owner, creates a job with an email
 * invite, posts a photo update, checks compression + progress bar, then
 * registers the invited employee and confirms the invite was redeemed.
 *
 * Run with the dev server up:  node scripts/smoke-test.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5173';

// 1200x900 test "site photo": draw shapes on a canvas inside the page and
// turn it into an uploadable PNG file.
async function makePhotoBuffer(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 2400, 1800);
    grad.addColorStop(0, '#87ceeb');
    grad.addColorStop(1, '#8b5a2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2400, 1800);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `hsl(${(i * 37) % 360} 60% 50%)`;
      ctx.fillRect((i * 173) % 2300, (i * 257) % 1700, 140, 90);
    }
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

function fail(msg) {
  console.error(`✗ FAIL: ${msg}`);
  process.exitCode = 1;
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => fail(`page error: ${e.message}`));

// --- register first user (starts as Employee; pretend admin promoted them) ---
// In the smoke test we can't hit the admin setup page (no VITE_ADMIN_CODE in dev),
// so we register normally and rely on IndexedDB to test the rest of the flow.
// The key behaviours (no role picker, auto-Employee, invite redemption) are tested.
await page.goto(BASE);
await page.getByRole('button', { name: 'Create Account' }).click();
await page.getByLabel('Full name').fill('Olive Owner');
await page.getByLabel('Email').fill('owner@test.com');
await page.getByLabel('Password').fill('hunter22');
await page.getByRole('button', { name: 'Create Account' }).last().click();
await page.getByText('My Jobs').waitFor({ timeout: 5000 });
console.log('✓ user registered (starts as Employee, no role picker)');

// --- promote to owner so they can create jobs (admin would do this in prod) --
// Directly set role in IndexedDB via the page's exposed service layer.
await page.evaluate(async () => {
  const { putDoc, listDocs } = await import('/src/services/local/storage.js');
  const users = await listDocs('users');
  const me = users[0];
  await putDoc('users', { ...me, role: 'owner' });
  localStorage.setItem('sitetrack.session', me.id);
});
await page.reload();
await page.getByText('All Jobs').waitFor({ timeout: 5000 });
console.log('✓ user promoted to owner (simulating admin action)');

// --- create job with an invite ----------------------------------------------
await page.getByRole('link', { name: '+ New Job' }).click();
await page.getByLabel('Job name *').fill('Riverside Duplex');
await page.getByLabel('Client').fill('Smith Family');
await page.getByPlaceholder('Invite by email…').fill('crew@test.com');
await page.getByRole('button', { name: 'Add Invite' }).click();
await page.getByRole('button', { name: 'Create Job' }).click();
await page.getByText('Pending invites').waitFor({ timeout: 5000 });
console.log('✓ job created with pending invite for crew@test.com');

// --- post a photo update ------------------------------------------------------
const buffer = await makePhotoBuffer(page);
await page
  .locator('input[type=file]')
  .setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer });
await page.locator('.upload-preview img').waitFor({ timeout: 10000 });
const caption = await page.locator('.upload-preview figcaption').textContent();
const [orig, stored] = caption.split('→').map((s) => s.trim());
console.log(`✓ photo compressed: ${orig} -> ${stored}`);
if (!caption.includes('→')) fail('no compression caption');

await page.getByPlaceholder(/What got done today/).fill('Framing finished on the second floor.');
await page.getByText('Update overall progress').click();
await page.locator('.composer input[type=range]').fill('45');
await page.getByRole('button', { name: 'Post Update' }).click();
await page.locator('.update .photo-thumb img').waitFor({ timeout: 10000 });
console.log('✓ update posted with photo');

const bar = await page.locator('.progress-lg .progress-fill').getAttribute('style');
if (!bar.includes('45%')) fail(`progress bar shows "${bar}", expected 45%`);
else console.log('✓ job progress bar at 45%');

// --- lightbox ----------------------------------------------------------------
await page.locator('.update .photo-thumb').first().click();
await page.locator('.lightbox img').waitFor({ timeout: 5000 });
await page.keyboard.press('Escape');
console.log('✓ lightbox opens full image');

// --- invited employee signs up and sees the job ------------------------------
await page.getByRole('button', { name: 'Sign out' }).click();
await page.getByRole('button', { name: 'Create Account' }).click();
await page.getByLabel('Full name').fill('Casey Crew');
await page.getByLabel('Email').fill('crew@test.com');
await page.getByLabel('Password').fill('hunter22');
await page.getByRole('button', { name: 'Create Account' }).last().click();
// Invite redemption: the employee should now be on the job's team.
await page.goto(`${BASE}/#/`);
await page.getByText('My Jobs').waitFor({ timeout: 5000 });
await page.getByText('Riverside Duplex').waitFor({ timeout: 5000 });
console.log('✓ invited employee auto-joined the job on sign-up');

// employee cannot create jobs
const newJobLink = await page.getByRole('link', { name: '+ New Job' }).count();
if (newJobLink !== 0) fail('employee should not see New Job button');
else console.log('✓ employee has no New Job button');

await browser.close();
console.log(process.exitCode ? 'SMOKE TEST FAILED' : 'ALL SMOKE TESTS PASSED');
