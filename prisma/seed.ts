import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const defaults = {
  siteName: '大彪TV',
  logoUrl: '/images/dabiao-logo.svg',
  faviconUrl: '/images/dabiao-icon.svg',
  accentColor: '#E50914',
  themePreset: 'netflix',
  heroEnabled: 'true',
  noticeEnabled: 'true',
};

async function main() {
  for (const [key, value] of Object.entries(defaults)) {
    await db.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}

main().finally(() => db.$disconnect());
