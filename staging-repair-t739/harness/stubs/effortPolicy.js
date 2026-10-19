'use strict';
/** [ME] Shadow selector is absent. answerParams ignores the decision and stays on medium. */
module.exports = require('./_generic').withFallback({
  select() { return { effort: 'medium', rule: 'explicit-stub' }; },
}, 'effortPolicy');
