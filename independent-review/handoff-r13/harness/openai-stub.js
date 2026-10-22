'use strict';

function OpenAI() {
  this.chat = {
    completions: {
      create: async (req) => {
        const hook = global.__lunaModel;
        if (!hook || typeof hook.create !== 'function') {
          throw new Error('stub model was not installed');
        }
        return hook.create(req);
      },
    },
  };
}

module.exports = OpenAI;
module.exports.default = OpenAI;
