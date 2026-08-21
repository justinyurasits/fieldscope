const express = require('express');
const multer = require('multer');
const db = require('./db');
const claude = require('./claude');

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024, files: 5 } });
const router = express.Router();

const rateLimit = require('express-rate-limit');
const claudeCallLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.CLAUDE_CALLS_PER_HOUR || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this connection in the last hour. Try again later.' }
});

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- subs & sites ----

router.get('/subs', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
             COALESCE(pc.protocol_count, 0) AS protocol_count,
             COALESCE(tt.done, 0) AS training_done,
             COALESCE(tt.total, 0) AS training_total,
             COALESCE(fl.flags_30d, 0) AS flags_30d,
             COALESCE(fl.unresolved, 0) AS unresolved_flags
      FROM subs s
      LEFT JOIN (
        SELECT sub_id, COUNT(*) AS protocol_count FROM protocols GROUP BY sub_id
      ) pc ON pc.sub_id = s.id
      LEFT JOIN (
        SELECT p.sub_id, SUM(CASE WHEN t.completed THEN 1 ELSE 0 END) AS done, COUNT(*) AS total
        FROM training_items t JOIN protocols p ON p.id = t.protocol_id
        GROUP BY p.sub_id
      ) tt ON tt.sub_id = s.id
      LEFT JOIN (
        SELECT p.sub_id,
               SUM(CASE WHEN pch.status = 'flagged' AND pch.created_at > now() - interval '30 days' THEN 1 ELSE 0 END) AS flags_30d,
               SUM(CASE WHEN pch.status = 'flagged' AND pch.resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved
        FROM photo_checks pch JOIN protocols p ON p.id = pch.protocol_id
        GROUP BY p.sub_id
      ) fl ON fl.sub_id = s.id
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/subs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const subResult = await db.query('SELECT * FROM subs WHERE id = $1', [id]);
    if (subResult.rows.length === 0) return res.status(404).json({ error: 'sub not found' });

    const protocolsResult = await db.query(`
      SELECT p.id, p.task_summary, p.trade, p.approval_status, p.task_status, p.created_at,
             si.name AS site_name,
             COALESCE(tt.done, 0) AS training_done,
             COALESCE(tt.total, 0) AS training_total,
             lc.status AS last_check_status,
             lc.created_at AS last_check_at
      FROM protocols p
      JOIN sites si ON si.id = p.site_id
      LEFT JOIN (
        SELECT protocol_id, SUM(CASE WHEN completed THEN 1 ELSE 0 END) AS done, COUNT(*) AS total
        FROM training_items GROUP BY protocol_id
      ) tt ON tt.protocol_id = p.id
      LEFT JOIN (
        SELECT DISTINCT ON (protocol_id) protocol_id, status, created_at
        FROM photo_checks ORDER BY protocol_id, created_at DESC
      ) lc ON lc.protocol_id = p.id
      WHERE p.sub_id = $1
      ORDER BY p.created_at DESC
    `, [id]);

    const flagHistoryResult = await db.query(`
      SELECT pch.id, pch.status, pch.summary, pch.resolved_at, pch.created_at, p.task_summary
      FROM photo_checks pch
      JOIN protocols p ON p.id = pch.protocol_id
      WHERE p.sub_id = $1
      ORDER BY pch.created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      ...subResult.rows[0],
      protocols: protocolsResult.rows,
      recentChecks: flagHistoryResult.rows
    });
  } catch (err) { next(err); }
});

router.post('/subs', async (req, res, next) => {
  try {
    const { name, trade } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
      'INSERT INTO subs (name, trade) VALUES ($1, $2) RETURNING *',
      [name.trim(), trade || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/sites', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM sites ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/sites', async (req, res, next) => {
  try {
    const { name, address } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
      'INSERT INTO sites (name, address) VALUES ($1, $2) RETURNING *',
      [name.trim(), address || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ---- protocols ----

router.get('/protocols/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const protocolResult = await db.query(`
      SELECT p.*, s.name AS sub_name, si.name AS site_name
      FROM protocols p
      JOIN subs s ON s.id = p.sub_id
      JOIN sites si ON si.id = p.site_id
      WHERE p.id = $1
    `, [id]);
    if (protocolResult.rows.length === 0) return res.status(404).json({ error: 'protocol not found' });

    const [training, reviews, photoChecks] = await Promise.all([
      db.query('SELECT * FROM training_items WHERE protocol_id = $1 ORDER BY id', [id]),
      db.query('SELECT * FROM reviews WHERE protocol_id = $1 ORDER BY id', [id]),
      db.query('SELECT * FROM photo_checks WHERE protocol_id = $1 ORDER BY created_at DESC', [id])
    ]);

    const checksWithImages = await Promise.all(photoChecks.rows.map(async (check) => {
      const images = await db.query('SELECT id, photo_data, photo_mime FROM photo_check_images WHERE photo_check_id = $1', [check.id]);
      return { ...check, images: images.rows };
    }));

    res.json({
      ...protocolResult.rows[0],
      trainingItems: training.rows,
      reviews: reviews.rows,
      photoChecks: checksWithImages
    });
  } catch (err) { next(err); }
});

router.post('/protocols', claudeCallLimiter, async (req, res, next) => {
  try {
    const { subId, siteId, taskDescription } = req.body;
    if (!subId || !siteId || !taskDescription || !taskDescription.trim()) {
      return res.status(400).json({ error: 'subId, siteId, and taskDescription are required' });
    }

    const generated = await claude.generateProtocol(taskDescription.trim());

    const insertResult = await db.query(`
      INSERT INTO protocols
        (sub_id, site_id, task_description, trade, task_summary, applicable_subparts, required_ppe, required_equipment, cited_sections, review_cadence)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      subId, siteId, taskDescription.trim(),
      generated.trade || null,
      generated.taskSummary || taskDescription.trim(),
      JSON.stringify(generated.applicableSubparts || []),
      JSON.stringify(generated.requiredPPE || []),
      JSON.stringify(generated.requiredEquipment || []),
      JSON.stringify(generated.citedSections || []),
      JSON.stringify(generated.reviewCadence || {})
    ]);

    const protocol = insertResult.rows[0];

    const trainingTopics = generated.trainingTopics || [];
    for (const topic of trainingTopics) {
      await db.query('INSERT INTO training_items (protocol_id, topic) VALUES ($1, $2)', [protocol.id, topic]);
    }

    const today = new Date();
    await db.query(
      "INSERT INTO reviews (protocol_id, review_type, due_date) VALUES ($1, 'initial', $2)",
      [protocol.id, addDays(today, 3)]
    );
    await db.query(
      "INSERT INTO reviews (protocol_id, review_type, due_date) VALUES ($1, 'ongoing', $2)",
      [protocol.id, addDays(today, 30)]
    );

    res.status(201).json({ id: protocol.id });
  } catch (err) { next(err); }
});

router.patch('/protocols/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;
    if (!approvedBy || !approvedBy.trim()) return res.status(400).json({ error: 'approvedBy is required' });
    const { rows } = await db.query(
      "UPDATE protocols SET approval_status = 'approved', approved_by = $1, approved_at = now() WHERE id = $2 RETURNING *",
      [approvedBy.trim(), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'protocol not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/protocols/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { taskStatus } = req.body;
    if (!['active', 'completed'].includes(taskStatus)) return res.status(400).json({ error: 'taskStatus must be active or completed' });
    const { rows } = await db.query('UPDATE protocols SET task_status = $1 WHERE id = $2 RETURNING *', [taskStatus, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'protocol not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ---- training items ----

router.patch('/training-items/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completed, attestedBy } = req.body;
    if (completed && (!attestedBy || !attestedBy.trim())) {
      return res.status(400).json({ error: 'attestedBy is required to mark training complete' });
    }
    const { rows } = await db.query(
      `UPDATE training_items
       SET completed = $1,
           attested_by = CASE WHEN $1 THEN $2 ELSE NULL END,
           completed_at = CASE WHEN $1 THEN now() ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [!!completed, completed ? attestedBy.trim() : null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'training item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ---- reviews ----

router.patch('/reviews/:id/complete', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completedBy } = req.body;
    if (!completedBy || !completedBy.trim()) return res.status(400).json({ error: 'completedBy is required' });
    const { rows } = await db.query(
      'UPDATE reviews SET completed_by = $1, completed_at = now() WHERE id = $2 RETURNING *',
      [completedBy.trim(), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'review not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ---- photo checks ----

router.post('/protocols/:id/photo-checks', claudeCallLimiter, upload.array('photos', 5), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'at least one photo is required' });

    const protocolResult = await db.query('SELECT * FROM protocols WHERE id = $1', [id]);
    if (protocolResult.rows.length === 0) return res.status(404).json({ error: 'protocol not found' });
    const protocol = protocolResult.rows[0];

    const images = req.files.map((f) => ({ base64: f.buffer.toString('base64'), mime: f.mimetype }));

    const result = await claude.checkPhoto({
      requiredPPE: protocol.required_ppe,
      requiredEquipment: protocol.required_equipment,
      taskSummary: protocol.task_summary,
      images
    });

    const insertResult = await db.query(`
      INSERT INTO photo_checks (protocol_id, status, findings, summary)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `, [id, result.status === 'compliant' ? 'compliant' : 'flagged', JSON.stringify(result.findings || []), result.summary || null]);

    const check = insertResult.rows[0];

    for (const img of images) {
      await db.query('INSERT INTO photo_check_images (photo_check_id, photo_data, photo_mime) VALUES ($1,$2,$3)', [check.id, img.base64, img.mime]);
    }

    const savedImages = await db.query('SELECT id, photo_data, photo_mime FROM photo_check_images WHERE photo_check_id = $1', [check.id]);

    res.status(201).json({ ...check, images: savedImages.rows });
  } catch (err) { next(err); }
});

router.patch('/photo-checks/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolvedBy, note } = req.body;
    if (!resolvedBy || !resolvedBy.trim()) return res.status(400).json({ error: 'resolvedBy is required' });
    const { rows } = await db.query(
      'UPDATE photo_checks SET resolved_by = $1, resolved_at = now(), resolution_note = $2 WHERE id = $3 RETURNING *',
      [resolvedBy.trim(), note || null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'photo check not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ---- dashboard ----

router.get('/dashboard', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id AS protocol_id, s.name AS sub_name, si.name AS site_name, p.trade,
             p.task_summary, p.approval_status, p.task_status,
             ir.id AS initial_review_id, ir.due_date AS initial_review_due, ir.completed_at AS initial_review_completed_at,
             orv.id AS ongoing_review_id, orv.due_date AS ongoing_review_due, orv.completed_at AS ongoing_review_completed_at,
             COALESCE(tt.done, 0) AS training_done,
             COALESCE(tt.total, 0) AS training_total,
             lc.status AS last_check_status,
             lc.created_at AS last_check_at,
             COALESCE(uf.unresolved_flags, 0) AS unresolved_flags
      FROM protocols p
      JOIN subs s ON s.id = p.sub_id
      JOIN sites si ON si.id = p.site_id
      LEFT JOIN reviews ir ON ir.protocol_id = p.id AND ir.review_type = 'initial'
      LEFT JOIN reviews orv ON orv.protocol_id = p.id AND orv.review_type = 'ongoing'
      LEFT JOIN (
        SELECT protocol_id, SUM(CASE WHEN completed THEN 1 ELSE 0 END) AS done, COUNT(*) AS total
        FROM training_items GROUP BY protocol_id
      ) tt ON tt.protocol_id = p.id
      LEFT JOIN (
        SELECT DISTINCT ON (protocol_id) protocol_id, status, created_at
        FROM photo_checks ORDER BY protocol_id, created_at DESC
      ) lc ON lc.protocol_id = p.id
      LEFT JOIN (
        SELECT protocol_id, COUNT(*) AS unresolved_flags
        FROM photo_checks WHERE status = 'flagged' AND resolved_at IS NULL
        GROUP BY protocol_id
      ) uf ON uf.protocol_id = p.id
      WHERE p.task_status = 'active'
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
