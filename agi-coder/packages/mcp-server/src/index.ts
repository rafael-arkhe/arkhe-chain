import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { verifyMmrInclusion } from './tools/verify-mmr.js';
import { attestGpu } from './tools/attest-gpu.js';
import { totalCost } from './tools/get-cost.js';
const server = new McpServer({ name: 'agi-coder', version: '0.1.0' });
const hex = z.string().regex(/^[a-f0-9]{64}$/);
server.registerTool('verify_mmr_inclusion', {
  description: 'Verify a portable MMR proof against a caller-trusted root.',
  inputSchema: { value: hex, root: hex, proof: z.object({ leaf_index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), leaf_count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), siblings: z.array(hex).max(53), peaks: z.array(hex).max(53) }) },
}, async ({value, root, proof}) => ({ content: [{ type: 'text', text: JSON.stringify({ valid: verifyMmrInclusion(value, proof, root) }) }] }));
server.registerTool('attest_gpu', {
  description: 'Report GPU verifier availability. Currently returns an explicit unsupported error.', inputSchema: {},
}, async () => ({ isError: true, content: [{type:'text', text: JSON.stringify(attestGpu())}] }));
server.registerTool('get_cost', {
  description: 'Sum caller-supplied costs in integer micro USD; this is not live provider billing.',
  inputSchema: { entries: z.array(z.object({ category: z.string(), micro_usd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), measured: z.boolean() })).max(10000) },
}, async ({entries}) => ({ content: [{type:'text', text: JSON.stringify({ total_micro_usd: totalCost(entries), source: 'caller-supplied' })}] }));
await server.connect(new StdioServerTransport());
