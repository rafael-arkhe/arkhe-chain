// Read-only RPC inspection. This file contains no signing or send-transaction API.
import { Connection, PublicKey } from '@solana/web3.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const digest = data => createHash('sha256').update(data).digest('hex');
const programs = ['dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'];
const files = ['dynamic_bonding_curve.so', 'cp_amm.so'];
const configKey = new PublicKey('Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp');
const report = [];
mkdirSync('output/prelaunch', { recursive: true });
for (const network of ['mainnet-beta', 'devnet']) {
  const connection = new Connection(`https://api.${network}.solana.com`, 'finalized');
  const directory = resolve(`output/prelaunch/${network}`);
  mkdirSync(directory, { recursive: true });
  const entry = { sourceNetwork: network, endpoint: connection.rpcEndpoint, genesisHash: await connection.getGenesisHash(), fixtureDirectory: directory, configFile: `${directory}/config.json`, fixtures: [], readOnly: true };
  for (let index = 0; index < programs.length; index++) {
    const program = await connection.getAccountInfoAndContext(new PublicKey(programs[index]));
    if (!program.value?.executable || program.value.owner.toBase58() !== 'BPFLoaderUpgradeab1e11111111111111111111111' || program.value.data.readUInt32LE() !== 2) throw Error('unexpected program loader');
    const programDataAddress = new PublicKey(program.value.data.subarray(4, 36));
    const programData = await connection.getAccountInfoAndContext(programDataAddress);
    if (programData.value.data.readUInt32LE() !== 3) throw Error('invalid program data');
    const bytes = programData.value.data.subarray(45);
    const fixture = { program: programs[index], file: files[index], sha256: digest(bytes), bytes: bytes.length, observedSlot: program.context.slot, programDataObservedSlot: programData.context.slot, deploymentSlot: programData.value.data.readBigUInt64LE(4).toString(), upgradeAuthority: programData.value.data[12] ? new PublicKey(programData.value.data.subarray(13, 45)).toBase58() : null };
    writeFileSync(`${directory}/${files[index]}`, bytes);
    entry.fixtures.push(fixture);
  }
  const config = await connection.getAccountInfoAndContext(configKey);
  if (!config.value?.owner.equals(new PublicKey(programs[1]))) throw Error('unexpected config owner');
  entry.configSha256 = digest(config.value.data); entry.configObservedSlot = config.context.slot;
  writeFileSync(entry.configFile, JSON.stringify({ pubkey: configKey.toBase58(), account: { lamports: config.value.lamports, owner: config.value.owner.toBase58(), executable: false, rentEpoch: 0, data: [config.value.data.toString('base64'), 'base64'] } }, null, 2));
  writeFileSync(`${directory}/profile.json`, JSON.stringify(entry, null, 2));
  report.push(entry);
}
writeFileSync('output/prelaunch/deployments.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
