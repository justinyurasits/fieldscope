require('dotenv').config();
const db = require('./db');

const SUBS = [
  { name: 'Alcott Electrical', trade: 'electrical' },
  { name: 'Marrow Masonry', trade: 'scaffolding' },
  { name: 'Delgado Excavation', trade: 'excavation' },
  { name: 'Highline Roofing', trade: 'roofing' }
];

const SITES = [
  { name: '280 Congress St', address: 'Boston, MA' },
  { name: '14 Fan Pier Way', address: 'Boston, MA' }
];

async function seed() {
  for (const sub of SUBS) {
    const existing = await db.query('SELECT id FROM subs WHERE name = $1', [sub.name]);
    if (existing.rows.length === 0) {
      await db.query('INSERT INTO subs (name, trade) VALUES ($1, $2)', [sub.name, sub.trade]);
    }
  }
  for (const site of SITES) {
    const existing = await db.query('SELECT id FROM sites WHERE name = $1', [site.name]);
    if (existing.rows.length === 0) {
      await db.query('INSERT INTO sites (name, address) VALUES ($1, $2)', [site.name, site.address]);
    }
  }
  console.log('Seed data applied.');
  await db.pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
