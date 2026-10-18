'use strict';
/** [ME] minimal internal-note formatter: a synthetic note body, enough to exercise the note path. */
module.exports = {
  ESCALATE_NOTE_FOOTER: '',
  resolveNoteDestination: () => ({}),
  isBareAccountPlaceholder: () => false,
  formatEscalateNoteHtml: (o) => '<b>Problem:</b> ' + String((o && (o.problem || o.problemText)) || '') + '<br><b>Action needed:</b> ' + String((o && o.actionNeeded) || ''),
};
