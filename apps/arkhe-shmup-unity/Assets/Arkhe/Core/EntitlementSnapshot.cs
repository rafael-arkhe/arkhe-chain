using System;

namespace Arkhe.Shmup.Core
{
    // Authenticated server snapshot, used ONLY for UI previews. No local purchase setter/service.
    public sealed class Subscription
    {
        public long ExpiresAtUnix { get; }
        public uint EnergyCapacityBonus { get; }
        public uint AdSkipsRemaining { get; }
        public Subscription(long expiresAtUnix, uint energyCapacityBonus, uint adSkipsRemaining)
        { ExpiresAtUnix = expiresAtUnix; EnergyCapacityBonus = energyCapacityBonus; AdSkipsRemaining = adSkipsRemaining; }
        public bool Active(long serverNow) => serverNow < ExpiresAtUnix;
    }

    public sealed class BattlePass
    {
        public string SeasonId { get; }
        public long StartsAtUnix { get; }
        public long EndsAtUnix { get; }
        public uint MissionXp { get; }
        public bool Premium { get; }
        public BattlePass(string seasonId, long startsAtUnix, uint missionXp, bool premium)
        {
            SeasonId = seasonId; StartsAtUnix = startsAtUnix;
            EndsAtUnix = checked(startsAtUnix + 30L * 86400);
            MissionXp = missionXp; Premium = premium;
        }
        public bool Open(long serverNow) => serverNow >= StartsAtUnix && serverNow < EndsAtUnix;
    }

    public sealed class VipState
    {
        public ulong Points { get; }
        public uint Level { get; }
        public ushort RewardBonusBps { get; }
        public ushort EnergyRegenBonusBps { get; }
        public VipState(ulong points, uint level, ushort rewardBonusBps, ushort energyRegenBonusBps)
        { Points = points; Level = level; RewardBonusBps = rewardBonusBps; EnergyRegenBonusBps = energyRegenBonusBps; }
    }

    public sealed class EntitlementSnapshot
    {
        public Subscription Subscription { get; }
        public BattlePass BattlePass { get; }
        public VipState Vip { get; }
        public EntitlementSnapshot(Subscription subscription, BattlePass battlePass, VipState vip)
        {
            Subscription = subscription ?? throw new ArgumentNullException(nameof(subscription));
            BattlePass = battlePass ?? throw new ArgumentNullException(nameof(battlePass));
            Vip = vip ?? throw new ArgumentNullException(nameof(vip));
        }
        public ulong PreviewPoints(ulong basePoints, long serverNow, bool rewardedGrant)
        {
            checked
            {
                ulong multiplier = Subscription.Active(serverNow) ? 2UL : 1UL;
                if (rewardedGrant) multiplier *= 2;
                return basePoints * multiplier * (10000UL + Vip.RewardBonusBps) / 10000;
            }
        }
    }
}
