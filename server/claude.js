const fs = require('fs');
const path = require('path');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

const OSHA_LIBRARY = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'osha-library.json'), 'utf8')
);

function parseJsonLoose(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

async function callClaude({ system, content, maxTokens }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || 1500,
      system,
      messages: [{ role: 'user', content }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function generateProtocol(taskDescription) {
  const system = [
    'You are a construction safety compliance assistant.',
    'You are given a curated library of OSHA 1926 construction standards (paraphrased, not verbatim regulatory text) and a verbal description of work about to be performed by a subcontractor.',
    'Select only the entries from the library that are actually relevant to the described task, and produce a scoped safety protocol.',
    'Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:',
    '{"taskSummary": string, "trade": string, "applicableSubparts": [{"code": string, "title": string}], "requiredPPE": [string], "requiredEquipment": [string], "citedSections": [{"code": string, "title": string, "requirement": string}], "reviewCadence": {"initial": string, "ongoing": string}, "trainingTopics": [string]}',
    "Keep requiredPPE and requiredEquipment concrete and visually checkable in a jobsite photo (e.g. 'hard hat', 'high-visibility vest', 'fall arrest harness', 'trench box / shoring', 'ground-fault circuit interrupter').",
    'Use only sections present in the provided library, cited exactly as given.'
  ].join(' ');

  const content = `OSHA library:\n${JSON.stringify(OSHA_LIBRARY, null, 2)}\n\nTask description:\n${taskDescription}`;

  const text = await callClaude({ system, content, maxTokens: 1600 });
  return parseJsonLoose(text);
}

async function checkPhoto({ requiredPPE, requiredEquipment, taskSummary, images }) {
  const system = [
    'You are a jobsite photo compliance checker.',
    'You are given a required PPE list, a required equipment list, and one or more jobsite photos from the same check (e.g. a wide shot and a close-up) — treat them together as one scene.',
    'Check the photos against each required item as best as visually determinable.',
    'Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:',
    '{"status": "compliant" or "flagged", "findings": [{"item": string, "observed": "present" or "missing" or "unclear", "note": string}], "summary": string}',
    "Mark overall status 'flagged' if any required item is clearly missing.",
    "If the photos genuinely do not show enough of the scene to judge an item, mark that item 'unclear' rather than guessing, and do not let 'unclear' items alone flag the whole check unless most items are unclear."
  ].join(' ');

  const content = [
    {
      type: 'text',
      text: `Required PPE: ${JSON.stringify(requiredPPE || [])}\nRequired equipment: ${JSON.stringify(requiredEquipment || [])}\nTask: ${taskSummary || ''}`
    },
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } }))
  ];

  const text = await callClaude({ system, content, maxTokens: 1200 });
  return parseJsonLoose(text);
}

module.exports = { generateProtocol, checkPhoto, OSHA_LIBRARY };
