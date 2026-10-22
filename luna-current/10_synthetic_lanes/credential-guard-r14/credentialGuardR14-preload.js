'use strict';

/**
 * Entry-point preload. Load this with node --require before the engine
 * so the network seal covers builtins that Node has already cached.
 */
const guard = require('./credentialGuardR14');
guard.installNetworkSeal();
