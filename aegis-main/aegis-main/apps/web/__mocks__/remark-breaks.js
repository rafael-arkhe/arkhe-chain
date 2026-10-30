/**
 * Manual mock for `remark-breaks` (ESM-only). Jest auto-uses this for the node
 * module so it is never loaded as ESM under jsdom. No-op plugin in tests.
 */
module.exports = function remarkBreaks() {};
