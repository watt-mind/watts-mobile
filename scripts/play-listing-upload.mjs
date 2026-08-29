#!/usr/bin/env node
/**
 * Upload Play Store listing graphics (icon, feature graphic, phone screenshots)
 * via the Play Developer API. Text metadata is assumed already saved in Console.
 *
 * Usage:
 *   node scripts/play-listing-upload.mjs [--dry-run] [--screenshots-only]
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE_NAME = 'com.coachwatts.app';
const LANGUAGE = 'en-US';
const LISTING_DIR = join(ROOT, 'dist', 'play-listing');
const SERVICE_ACCOUNT = resolve(
  process.env.PLAY_SERVICE_ACCOUNT_PATH ??
    join(ROOT, 'credentials/android/play-service-account.json'),
);

const PHONE_SCREENSHOTS = [
  '01-android-today.png',
  '02-android-plan.png',
  '03-android-coach.png',
  '04-android-log.png',
  '05-android-nutrition.png',
  '06-android-health-connect.png',
];

const PHONE_SCREENSHOT_SIZE = { width: 1080, height: 1920 };

const SHORT_DESCRIPTION =
  'AI endurance coach companion: today\u2019s session, wellness, fueling & coach chat.';

const FULL_DESCRIPTION = `Coach Watts is your AI-powered endurance coaching companion for athletes training with power, heart rate, and pace.

Activate on your phone, set a goal, get a lightweight training plan, and see your first insight. Then run the daily loop: Today\u2019s recommendation, quick wellness and recovery logging, nutrition quick-log, and real-time Coach chat\u2014synced with your Coach Watts account on coachwatts.com.

WHAT YOU CAN DO
\u2022 See today\u2019s session recommendation and planned workouts
\u2022 Log wellness, recovery context, and nutrition
\u2022 Chat with your AI coach (text, photos, dictation)
\u2022 Connect Apple Health or Health Connect (optional) to prefill check-ins and sync workouts
\u2022 Receive coaching notifications when enabled

BUILT FOR ENDURANCE ATHLETES
Coach Watts is a training companion\u2014not a medical device. It does not diagnose, treat, or prevent disease. Deep plan editing, analytics, teams, and billing administration stay on the web.

Sign in with Google or Apple via OAuth in your system browser. Works with the hosted Coach Watts service at coachwatts.com.

Privacy: https://coachwatts.com/privacy
Support: support@coachwatts.com`;

function readPngSize(filePath) {
  const buffer = readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Expected a PNG file: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function validatePhoneScreenshots(paths) {
  if (paths.length < 4) {
    throw new Error(
      'Google Play requires at least four distinct phone screenshots for this listing',
    );
  }

  const hashes = new Set();
  for (const filePath of paths) {
    const { width, height, sha256 } = readPngSize(filePath);
    if (width !== PHONE_SCREENSHOT_SIZE.width || height !== PHONE_SCREENSHOT_SIZE.height) {
      throw new Error(
        `Phone screenshot must be ${PHONE_SCREENSHOT_SIZE.width}x${PHONE_SCREENSHOT_SIZE.height}: ${filePath} is ${width}x${height}`,
      );
    }
    if (hashes.has(sha256)) {
      throw new Error(`Duplicate phone screenshot content: ${filePath}`);
    }
    hashes.add(sha256);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const screenshotsOnly = process.argv.includes('--screenshots-only');

  const iconPath = join(LISTING_DIR, 'app-icon-512x512.png');
  const featurePath = join(LISTING_DIR, 'feature-graphic-1024x500.png');
  const phoneScreenshotPaths = PHONE_SCREENSHOTS.map((file) => join(LISTING_DIR, file));
  const requiredAssets = screenshotsOnly
    ? phoneScreenshotPaths
    : [iconPath, featurePath, ...phoneScreenshotPaths];
  for (const p of requiredAssets) {
    if (!existsSync(p)) throw new Error(`Missing asset: ${p}`);
  }
  validatePhoneScreenshots(phoneScreenshotPaths);

  if (dryRun) {
    console.log('Dry run — would upload:');
    if (!screenshotsOnly) {
      console.log('  icon:', iconPath);
      console.log('  featureGraphic:', featurePath);
    }
    for (const f of PHONE_SCREENSHOTS) console.log('  phoneScreenshot:', join(LISTING_DIR, f));
    if (!screenshotsOnly) {
      console.log('  shortDescription:', SHORT_DESCRIPTION);
      console.log('  fullDescription length:', FULL_DESCRIPTION.length);
    }
    return;
  }

  if (!existsSync(SERVICE_ACCOUNT)) {
    throw new Error(`Missing ${SERVICE_ACCOUNT}`);
  }

  const credentials = JSON.parse(readFileSync(SERVICE_ACCOUNT, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });

  console.log(`Creating Play edit for ${PACKAGE_NAME}…`);
  const edit = await play.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.data.id;
  if (!editId) throw new Error('edits.insert returned no edit id');

  try {
    if (!screenshotsOnly) {
      console.log('Updating listing text…');
      await play.edits.listings.update({
        packageName: PACKAGE_NAME,
        editId,
        language: LANGUAGE,
        requestBody: {
          language: LANGUAGE,
          title: 'Coach Watts',
          shortDescription: SHORT_DESCRIPTION,
          fullDescription: FULL_DESCRIPTION,
        },
      });
    }

    async function uploadImage(imageType, filePath) {
      console.log(`  upload ${imageType}: ${filePath}`);
      await play.edits.images.upload({
        packageName: PACKAGE_NAME,
        editId,
        language: LANGUAGE,
        imageType,
        media: {
          mimeType: 'image/png',
          body: createReadStream(filePath),
        },
      });
    }

    if (!screenshotsOnly) {
      console.log('Uploading icon…');
      await uploadImage('icon', iconPath);

      console.log('Uploading feature graphic…');
      await uploadImage('featureGraphic', featurePath);
    }

    console.log('Uploading phone screenshots…');
    console.log('  deleting existing phone screenshots first…');
    await play.edits.images.deleteall({
      packageName: PACKAGE_NAME,
      editId,
      language: LANGUAGE,
      imageType: 'phoneScreenshots',
    });
    for (const file of PHONE_SCREENSHOTS) {
      await uploadImage('phoneScreenshots', join(LISTING_DIR, file));
    }

    console.log('Committing edit…');
    await play.edits.commit({ packageName: PACKAGE_NAME, editId });
    console.log('Play listing graphics committed.');
  } catch (err) {
    try {
      await play.edits.delete({ packageName: PACKAGE_NAME, editId });
    } catch {
      // best-effort
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  if (err?.errors?.[0]?.message) console.error(err.errors[0].message);
  process.exit(1);
});
