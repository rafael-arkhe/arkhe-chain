import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCnpj, validCnpj } from '../lib/cnpj.mjs';
test('RFB numeric compatibility and official alphanumeric example 12.ABC.345/01DE-35', () => {
  for (const value of ['12.ABC.345/01DE-35', '12ABC34501DE35', '12.abc.345/01de-35', '11.222.333/0001-81', '11222333000181']) assert.equal(validCnpj(value), true, value);
  assert.equal(normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
});
test('CNPJ rejects altered DVs, letters in DVs, unicode, separators, truncation and repeated digits', () => {
  for (const value of ['12ABC34501DE34', '12ABC34501DE3A', '12ÁBC34501DE35', '１２ABC34501DE35', '12-ABC-345-01DE-35', '12ABC34501DE3', '12ABC34501DE350', '00000000000000', '11111111111111', ' 12ABC34501DE35', null, 11222333000181]) assert.equal(validCnpj(value), false, String(value));
});
