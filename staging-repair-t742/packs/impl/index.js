'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { claim } = require('./packsClaim');
const { unresolvedPolicy } = require('../../../staging-repair-t739/candidate/unresolvedPolicy');
const { decide, REFUSE_ID, HANDOFF_ID, catalogCensus } = require('./packsDecide');

const PROPOSITIONS = path.join(__dirname, 'packs-propositions.json');

function propositionsSha256() {
  return crypto.createHash('sha256').update(fs.readFileSync(PROPOSITIONS)).digest('hex');
}

module.exports = {
  claim,
  unresolvedPolicy,
  decide,
  REFUSE_ID,
  HANDOFF_ID,
  catalogCensus,
  propositionsSha256,
};
