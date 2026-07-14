import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/ADMIN/.gemini/antigravity/brain/2687c993-4391-437d-9325-a6c8c50e5de7';

async function run() {
  console.log('Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: 'e:/NitroCine/client',
    shell: true,
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 3500));

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'mobile_390x844', width: 390, height: 844 },
    { name: 'tablet_768x1024', width: 768, height: 1024 },
    { name: 'desktop_1440x900', width: 1440, height: 900 },
    { name: 'fullhd_1920x1080', width: 1920, height: 1080 }
  ];

  try {
    for (const vp of viewports) {
      console.log(`Capturing for ${vp.name}...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }
      });
      const page = await context.newPage();
      await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

      await page.evaluate(() => window.scrollTo(0, 600));
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => window.scrollTo(0, 1400));
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => window.scrollTo(0, 500));
      await new Promise(r => setTimeout(r, 800));

      const fullPath = path.join(ARTIFACTS_DIR, `cinematic_${vp.name}.png`);
      await page.screenshot({ path: fullPath, fullPage: false });
      console.log(`Saved ${fullPath}`);

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync('e:/NitroCine/client/capture_transitions.mjs'); } catch (e) {}
  }
}

run().catch(console.error);
