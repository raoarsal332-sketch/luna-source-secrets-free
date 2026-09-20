'use strict';

/**
 * analyzer.js - root-cause analysis.
 *
 * The AI proposes a cause; this module decides whether to trust it. Low
 * confidence, an unknown category, or any model error all force
 * insufficientEvidence, which stops the pipeline before a patch is written.
 * It collects more signal instead of guessing.
 */

const { ROOT_CAUSES } = require('./schema');

const SYSTEM = `You are the root-cause analyst for Luna, a customer-support bot for a prop-trading firm (FundedElite) running on Intercom.
You receive structured failure evidence produced by Luna's own pre-send gate (presendMega) and runtime detectors.
Rules you must obey:
- Choose exactly one category from the allowed list.
- Ground every claim in the supplied evidence and cite the evidence keys you used.
- If the evidence is insufficient to identify a cause, set insufficient_evidence=true, confidence<=0.3 and category="unknown". Do NOT guess.
- You perform analysis only. You never write, approve or deploy a change here.`;

const SCHEMA = JSON.stringify({
  category: `one of: ${ROOT_CAUSES.join(', ')}`,
  explanation: 'string, <=120 words, evidence-grounded',
  confidence: 'number 0..1',
  evidence_refs: ['evidence keys you used'],
  suspected_components: ['Luna module or prompt file names'],
  insufficient_evidence: 'boolean',
}, null, 2);

function createAnalyzer(cfg, llm) {
  async function analyze(bucket, context) {
    if (!bucket) return { category: 'unknown', explanation: 'No event supplied.', confidence: 0, evidenceRefs: [], suspectedComponents: [], insufficientEvidence: true };

    const payload = {
      fingerprint: bucket.fingerprint,
      code: bucket.code,
      detector: bucket.detector,
      severity: bucket.severity,
      occurrences: bucket.occurrences,
      summary: bucket.summary,
      samples: (bucket.samples || []).slice(-5),
      engine: bucket.engine,
      system_context: context || {},
    };

    let data;
    try {
      data = await llm.json(SYSTEM, JSON.stringify(payload, null, 2), SCHEMA);
    } catch (e) {
      return { category: 'unknown', explanation: `Analysis unavailable: ${e.message}`, confidence: 0, evidenceRefs: [], suspectedComponents: [], insufficientEvidence: true };
    }

    const category = ROOT_CAUSES.includes(data.category) ? data.category : 'unknown';
    let confidence = Number(data.confidence);
    confidence = Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0;
    let insufficient = !!data.insufficient_evidence;
    if (confidence < cfg.minConfidence) insufficient = true;   // hard guard, whatever the model claimed
    if (category === 'unknown') insufficient = true;

    return {
      category,
      explanation: String(data.explanation || '').slice(0, 1200),
      confidence,
      evidenceRefs: (data.evidence_refs || []).map(String).slice(0, 20),
      suspectedComponents: (data.suspected_components || []).map(String).slice(0, 20),
      insufficientEvidence: insufficient,
    };
  }
  return { analyze };
}

module.exports = { createAnalyzer, SYSTEM, SCHEMA };
