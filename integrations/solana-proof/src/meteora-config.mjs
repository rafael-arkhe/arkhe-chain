import { buildCurveWithMarketCap, TokenType, TokenAuthorityOption, BaseFeeMode, CollectFeeMode, MigrationOption, MigrationFeeOption, ActivationType, MigratedCollectFeeMode, DammV2DynamicFeeMode, DammV2BaseFeeMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { readFileSync } from 'node:fs';
const snapshot = process.env.METEORA_PROFILE ? JSON.parse(readFileSync(process.env.METEORA_PROFILE, 'utf8')) : null;
export const DEPLOYMENT_SOURCE = snapshot?.sourceNetwork ?? 'OFFICIAL_TEST_FIXTURES';
export const FIXTURE_DIRECTORY = snapshot?.fixtureDirectory ?? 'output/meteora-fixtures';
export const CONFIG_FILE = snapshot?.configFile ?? 'fixtures/meteora-damm-config.json';
export const REFERENCE_COMMIT = '3a965ec0c0a527c2be3c48b8b479366705bf4926';
export const PROGRAM_FIXTURES = snapshot?.fixtures ?? [
  { file: 'dynamic_bonding_curve.so', program: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', sha256: '85f43457764052cb243060c3c6eed131861cf89419b121a2ea5a6f6009b52c7e' },
  { file: 'cp_amm.so', program: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', sha256: '586ed1f98c38db6cc4f3f03382575a2ae82671c0532a29aeddd8aa77c56924c9' }
];
export const DAMM_CONFIG = snapshot?.configAddress ?? 'Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp';
export const DAMM_CONFIG_SHA256 = snapshot?.configSha256 ?? '56d526bd28a68a2096dc195200f3e43e1a972c4973b05f4ec2daf16772517ebc';
export const CURVE_FEE_BPS = snapshot?.curveFeeBps ?? 100;
export const MIGRATED_FEE_BPS = snapshot?.migratedPoolFeeBps ?? 100;
if (PROGRAM_FIXTURES.length !== 2 || PROGRAM_FIXTURES[0].program !== 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN' || PROGRAM_FIXTURES[1].program !== 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG') throw Error('unexpected snapshot program IDs');
// Test parameters in SOL units; they are not proposed public launch economics.
export function testCurve() {
  return buildCurveWithMarketCap({
    token: { tokenType: TokenType.Token2022, tokenBaseDecimal: 6, tokenQuoteDecimal: 9, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: CURVE_FEE_BPS, endingFeeBps: CURVE_FEE_BPS, numberOfPeriod: 0, totalDuration: 0 } }, dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 0, poolCreationFee: 0, enableFirstSwapWithMinFee: false },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MIGRATED_FEE_BPS === 100 ? MigrationFeeOption.FixedBps100 : MigrationFeeOption.Customizable, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 }, ...(MIGRATED_FEE_BPS === 100 ? {} : { migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Disabled, poolFeeBps: MIGRATED_FEE_BPS, baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear } }) },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 100, creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp, initialMarketCap: 10, migrationMarketCap: 50
  });
}
