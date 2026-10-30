import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHealthServer } from "../src/index.js";
test("HTTP health disclaims authority and Prometheus can scrape real metrics", async()=>{
  const server=createHealthServer();server.listen(0,"127.0.0.1");await once(server,"listening");
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(url+"/health")).json(),{ok:true,service:"arkhe-agi-mcp",authority:"none"});
    const metrics=await fetch(url+"/metrics");assert.equal(metrics.status,200);
    assert.match(await metrics.text(),/^arkhe_mcp_http_requests_total 2$/m);
    assert.equal((await fetch(url+"/mcp")).status,404);
    assert.equal((await fetch(url+"/health",{method:"POST"})).status,405);
  } finally {server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
