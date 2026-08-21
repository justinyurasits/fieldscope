// Dev-only smoke test. Uses pg-mem (in-memory Postgres-compatible engine)
// to exercise the real schema + routes without a live Postgres server.
// Not part of the shipped app — safe to delete.

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';

const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');

const mem = newDb({ autoCreateForeignKeyIndices: true });
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const pgAdapter = mem.adapters.createPg();

const realPgPath = require.resolve('pg');
require.cache[realPgPath] = { id: realPgPath, filename: realPgPath, loaded: true, exports: pgAdapter };

const db = require('./db');
const claude = require('./claude');

claude.generateProtocol = async (taskDescription) => ({
  taskSummary: taskDescription.slice(0, 60),
  trade: 'electrical',
  applicableSubparts: [{ code: '1926.404', title: 'Electrical' }],
  requiredPPE: ['hard hat', 'insulated gloves'],
  requiredEquipment: ['GFCI'],
  citedSections: [{ code: '1926.404(f)(6)', title: 'Grounding', requirement: 'Metal parts must be grounded.' }],
  reviewCadence: { initial: 'Within 3 business days', ongoing: 'Every 30 days' },
  trainingTopics: ['Lockout/tagout basics', 'GFCI use on temporary power']
});
let checkResult = { status: 'flagged', findings: [{ item: 'hard hat', observed: 'missing', note: 'Not visible.' }], summary: 'Hard hat not visible in frame.' };
claude.checkPhoto = async (args) => {
  if (args.images.length !== 2) throw new Error('expected 2 images in this test call');
  return checkResult;
};

const express = require('express');
const routes = require('./routes');

function multipartBody(fields, files) {
  const boundary = '----smoketestboundary';
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files || []) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${f.name}"\r\nContent-Type: image/jpeg\r\n\r\n`));
    parts.push(f.buffer);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('[ok] schema applied');

  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use((err, req, res, next) => { console.error('ROUTE ERROR:', err); res.status(500).json({ error: err.message }); });

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}/api`;
  const j = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const p = (body) => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const sub = await (await fetch(`${base}/subs`, j({ name: 'Test Electrical Co', trade: 'electrical' }))).json();
  const site = await (await fetch(`${base}/sites`, j({ name: 'Test Site' }))).json();
  console.log('[ok] created sub + site');

  const protoRes = await fetch(`${base}/protocols`, j({ subId: sub.id, siteId: site.id, taskDescription: 'Electrician running conduit on 3rd floor' }));
  const protoBody = await protoRes.json();
  if (!protoRes.ok) throw new Error('protocol creation failed: ' + JSON.stringify(protoBody));
  console.log('[ok] generated protocol', protoBody.id);

  let detail = await (await fetch(`${base}/protocols/${protoBody.id}`)).json();
  if (detail.approval_status !== 'draft') throw new Error('expected new protocol to be draft, got ' + detail.approval_status);
  console.log('[ok] protocol starts as draft');

  const approveRes = await fetch(`${base}/protocols/${protoBody.id}/approve`, p({ approvedBy: 'Jane Safety, PSM' }));
  if (!approveRes.ok) throw new Error('approve failed: ' + JSON.stringify(await approveRes.json()));
  console.log('[ok] protocol approved');

  const badTrainingRes = await fetch(`${base}/training-items/${detail.trainingItems[0].id}`, p({ completed: true }));
  if (badTrainingRes.ok) throw new Error('expected training completion without attestedBy to fail');
  console.log('[ok] training completion rejected without attestedBy');

  const trainingRes = await fetch(`${base}/training-items/${detail.trainingItems[0].id}`, p({ completed: true, attestedBy: 'John Foreman' }));
  const trainingBody = await trainingRes.json();
  if (!trainingBody.completed || trainingBody.attested_by !== 'John Foreman') throw new Error('training attestation not recorded correctly');
  console.log('[ok] training item attested');

  const initialReview = detail.reviews.find((r) => r.review_type === 'initial');
  const reviewRes = await fetch(`${base}/reviews/${initialReview.id}/complete`, p({ completedBy: 'Jane Safety, PSM' }));
  if (!reviewRes.ok) throw new Error('review complete failed');
  console.log('[ok] initial review marked complete');

  const files = [
    { name: 'wide.jpg', buffer: Buffer.from('fake wide shot') },
    { name: 'close.jpg', buffer: Buffer.from('fake close up') }
  ];
  const mp = multipartBody({}, files);
  const photoRes = await fetch(`${base}/protocols/${protoBody.id}/photo-checks`, { method: 'POST', headers: { 'Content-Type': mp.contentType }, body: mp.body });
  const photoBody = await photoRes.json();
  if (!photoRes.ok) throw new Error('photo check failed: ' + JSON.stringify(photoBody));
  if (photoBody.status !== 'flagged') throw new Error('expected flagged status');
  if (photoBody.images.length !== 2) throw new Error('expected 2 stored images, got ' + photoBody.images.length);
  console.log('[ok] multi-photo check recorded as flagged with', photoBody.images.length, 'images');

  const dashBefore = await (await fetch(`${base}/dashboard`)).json();
  if (Number(dashBefore[0].unresolved_flags) !== 1) throw new Error('expected 1 unresolved flag on dashboard');
  console.log('[ok] dashboard shows unresolved flag');

  const resolveRes = await fetch(`${base}/photo-checks/${photoBody.id}/resolve`, p({ resolvedBy: 'Jane Safety, PSM', note: 'Sub corrected on re-check.' }));
  if (!resolveRes.ok) throw new Error('resolve failed');
  console.log('[ok] flag resolved');

  const dashAfter = await (await fetch(`${base}/dashboard`)).json();
  if (Number(dashAfter[0].unresolved_flags) !== 0) throw new Error('expected 0 unresolved flags after resolve');
  console.log('[ok] dashboard reflects resolved flag');

  const subDetail = await (await fetch(`${base}/subs/${sub.id}`)).json();
  if (subDetail.protocols.length !== 1) throw new Error('expected 1 protocol in sub rollup');
  if (subDetail.recentChecks.length !== 1) throw new Error('expected 1 recent check in sub rollup');
  console.log('[ok] sub-level rollup returns protocols + recent checks');

  const subsList = await (await fetch(`${base}/subs`)).json();
  const thisSub = subsList.find((s) => s.id === sub.id);
  if (Number(thisSub.training_done) !== 1 || Number(thisSub.training_total) !== 2) throw new Error('subs list training aggregate wrong');
  console.log('[ok] subs list aggregates training correctly');

  server.close();
  await db.pool.end();
  console.log('\nAll smoke tests passed.');
}

main().catch((err) => {
  console.error('\nSmoke test failed:', err);
  process.exit(1);
});
