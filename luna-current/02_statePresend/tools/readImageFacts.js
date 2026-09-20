'use strict';

/**
 * tools/readImageFacts.js - extract structured fields from existing vision/OCR text.
 * Never calls a vision API. Optionally merges image_fields from conversation state.
 */

const imageX = require('../structuredImageExtractor');
const stateMod = require('../conversationState');

function createReadImageFacts(opts) {
  opts = opts || {};

  async function read(args, ctx) {
    args = args || {};
    ctx = ctx || {};
    let visionText = args.vision_text != null ? String(args.vision_text) : '';

    if (!visionText && typeof opts.getLastVisionHint === 'function' && ctx.conversationId) {
      try {
        visionText = String(opts.getLastVisionHint(ctx.conversationId) || '');
      } catch (_) {
        visionText = '';
      }
    }

    const fromVision = visionText ? imageX.extract(visionText) : { fields: {}, found: [], empty: true };

    let stateFields = {};
    let fromState = false;
    if (ctx.conversationId && typeof opts.getMessages === 'function') {
      try {
        const msgs = await opts.getMessages(ctx.conversationId);
        const images = typeof opts.getImages === 'function' ? safe(() => opts.getImages(ctx.conversationId)) : null;
        const full = stateMod.buildState(msgs, { images: images || undefined });
        if (full && full.image_fields && typeof full.image_fields === 'object') {
          const keys = Object.keys(full.image_fields);
          if (keys.length) {
            stateFields = { ...full.image_fields };
            fromState = true;
          }
        }
      } catch (_) {
        /* ignore */
      }
    }

    // vision_text wins on key conflicts
    const fields = { ...stateFields, ...(fromVision.fields || {}) };
    const found = Object.keys(fields);
    const empty = found.length === 0;

    let source = 'vision_text';
    if (fromState && visionText) source = 'both';
    else if (fromState) source = 'state';
    else source = 'vision_text';

    if (empty) {
      return {
        ok: true,
        fields: {},
        found: [],
        empty: true,
        source,
        guidance:
          'No image facts found. Describe the screenshot in vision_text (OCR/description already available to the model). Do not call a vision API from this tool.',
      };
    }

    return { ok: true, fields, found, empty: false, source };
  }

  return { read, spec };
}

function safe(fn) {
  try {
    return fn();
  } catch (_) {
    return null;
  }
}

const spec = {
  name: 'read_image_facts',
  description:
    'Extract structured support fields (account number, error code, status, balance, server, email, date) from screenshot OCR/description text the model already has. Does not call a vision API. Optionally merges image_fields from conversation state.',
  parameters: {
    type: 'object',
    properties: {
      vision_text: {
        type: 'string',
        description: 'Optional OCR or image description text already available from the image',
      },
    },
    additionalProperties: false,
  },
};

module.exports = { createReadImageFacts, spec };
