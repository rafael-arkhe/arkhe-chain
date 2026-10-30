import test from 'node:test';
import assert from 'node:assert/strict';
import { operationRoute,observeRequest,prometheusMetrics,metricsAuthorized } from '../lib/observability.mjs';
test('observability uses bounded routes, histogram buckets and JSON without identifiers or secrets',()=>{
  const route=operationRoute(['documents','private-cnpj-token','export']);assert.equal(route,'documents');assert.equal(operationRoute(['arbitrary-secret']),'other');
  const logs=[];observeRequest({route,method:'GET',status:503,duration:.08},line=>logs.push(JSON.parse(line)));
  assert.equal(logs[0].level,'error');assert.match(logs[0].operation_id,/^[a-f0-9-]{36}$/);assert.equal(logs[0].installation_scope,'single-org');
  assert.doesNotMatch(JSON.stringify(logs),/private-cnpj-token|authorization|tenant_id/);
  const metrics=prometheusMetrics();assert.match(metrics,/arkhe_http_duration_seconds_bucket\{route="documents",method="GET",status_class="5xx",le="0.1"\} 1/);assert.doesNotMatch(metrics,/private-cnpj-token/);
  delete process.env.ARKHE_METRICS_TOKEN;assert.equal(metricsAuthorized(new Request('http://local')),false);
  process.env.ARKHE_METRICS_TOKEN='x'.repeat(40);
  assert.equal(metricsAuthorized(new Request('http://local',{headers:{Authorization:'Bearer '+'x'.repeat(40)}})),true);
  assert.equal(metricsAuthorized(new Request('http://local',{headers:{Authorization:'Bearer wrong'}})),false);delete process.env.ARKHE_METRICS_TOKEN;
});
