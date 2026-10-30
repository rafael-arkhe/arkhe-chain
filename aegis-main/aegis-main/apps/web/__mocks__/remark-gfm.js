/**
 * Manual mock for `remark-gfm` (ESM-only). Jest auto-uses this for the node
 * module so it is never loaded as ESM under jsdom. The plugin is a no-op in
 * tests; the react-markdown mock ignores plugins anyway.
 */
module.exports = function remarkGfm() {};
