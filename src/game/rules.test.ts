import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialInventory,
  rollThreePowerUpChoices,
  applyPowerUpChoice,
  getUpgradesUsedCount,
  canDraftUpgrade,
  MAX_UPGRADES_PER_ROUND,
  getWaveConfig,
  getBossEncounterForWave,
  getXpRequiredForLevel,
  stepVectorizedEntitiesSoA,
  getInfiniteSectorCoords,
  POWER_UP_CATALOG,
} from './rules';

test('Round starts with 1 initial power-up and enforces a maximum of 5 upgrades per round', () => {
  let inv = createInitialInventory('pulse_cannon');
  assert.equal(getUpgradesUsedCount(inv), 0);
  assert.equal(canDraftUpgrade(inv), true);

  // Apply 5 upgrades sequentially
  inv = applyPowerUpChoice(inv, 'pulse_cannon'); // upgrade 1 (Lv.2)
  inv = applyPowerUpChoice(inv, 'orbital_blades'); // upgrade 2 (Lv.1)
  inv = applyPowerUpChoice(inv, 'chain_arc'); // upgrade 3 (Lv.1)
  inv = applyPowerUpChoice(inv, 'overclock_core'); // upgrade 4 (Lv.1)
  inv = applyPowerUpChoice(inv, 'reactive_hull'); // upgrade 5 (Lv.1)

  assert.equal(getUpgradesUsedCount(inv), MAX_UPGRADES_PER_ROUND);
  assert.equal(canDraftUpgrade(inv), false);

  // Attempting a 6th upgrade is blocked and rollThreePowerUpChoices returns empty
  const afterSixth = applyPowerUpChoice(inv, 'kinetic_thrusters');
  assert.equal(getUpgradesUsedCount(afterSixth), 5);
  assert.equal(rollThreePowerUpChoices(afterSixth).length, 0);
});

test('Level-up offers 3 distinct random power-up choices and identifies owned upgrades', () => {
  const inv = createInitialInventory('pulse_cannon');
  let seed = 0.1;
  const deterministicRng = () => {
    seed = (seed + 0.23) % 1;
    return seed;
  };

  const choices = rollThreePowerUpChoices(inv, deterministicRng);
  assert.equal(choices.length, 3);
  const uniqueIds = new Set(choices.map((c) => c.id));
  assert.equal(uniqueIds.size, 3);

  const allChoicesWithPulse = rollThreePowerUpChoices(inv, () => 0);
  const pulseChoice = allChoicesWithPulse.find((c) => c.id === 'pulse_cannon');
  assert.ok(pulseChoice, 'First choice with 0 rng should include pulse_cannon');
  assert.equal(pulseChoice.isUpgrade, true);
  assert.equal(pulseChoice.currentLevel, 1);
  assert.equal(pulseChoice.nextLevel, 2);
  assert.ok(pulseChoice.nextStats.damage > (pulseChoice.currentStats?.damage ?? 0));
});

test('Choosing an existing power-up upgrades its level and increases effectiveness stats', () => {
  let inv = createInitialInventory('orbital_blades');
  const statsLv1 = POWER_UP_CATALOG.orbital_blades.computeStats(inv.orbital_blades!);

  inv = applyPowerUpChoice(inv, 'orbital_blades');
  assert.equal(inv.orbital_blades, 2);

  const statsLv2 = POWER_UP_CATALOG.orbital_blades.computeStats(inv.orbital_blades!);
  assert.ok(statsLv2.damage > statsLv1.damage);
  assert.ok(statsLv2.radius > statsLv1.radius);
  assert.ok(statsLv2.cooldown <= statsLv1.cooldown);
});

test('Every 5th wave unlocks a new enemy type and every 10th wave triggers a Boss Fight', () => {
  const wave1 = getWaveConfig(1);
  const wave5 = getWaveConfig(5);
  const wave10 = getWaveConfig(10);
  const wave15 = getWaveConfig(15);
  const wave20 = getWaveConfig(20);
  const wave30 = getWaveConfig(30);

  assert.equal(wave1.isFifthWaveMilestone, false);
  assert.equal(wave1.isBossWave, false);
  assert.equal(wave1.bossEncounter, null);

  // Wave 5 unlocks Phase Sentinel, not a 10th-wave boss
  assert.equal(wave5.isFifthWaveMilestone, true);
  assert.equal(wave5.isBossWave, false);
  assert.equal(wave5.newlyUnlockedEnemy?.id, 'orbiter');

  // Wave 10 is BOTH a 5th-wave unlock AND a 10th-wave Boss Fight
  assert.equal(wave10.isFifthWaveMilestone, true);
  assert.equal(wave10.isBossWave, true);
  assert.ok(wave10.bossEncounter);
  assert.equal(wave10.bossEncounter?.name, 'Omega Aegis Colossus');

  // Wave 15 is a 5th-wave unlock, not a 10th-wave boss
  assert.equal(wave15.isFifthWaveMilestone, true);
  assert.equal(wave15.isBossWave, false);
  assert.equal(wave15.newlyUnlockedEnemy?.id, 'weaver');

  // Wave 20 and Wave 30 are 10th-wave Boss Fights with scaling HP
  assert.equal(wave20.isBossWave, true);
  assert.equal(wave20.bossEncounter?.name, 'Apex Void Dreadnought');
  assert.equal(wave30.isBossWave, true);
  assert.ok((wave30.bossEncounter?.maxHp ?? 0) > (wave20.bossEncounter?.maxHp ?? 0));
  assert.equal(getBossEncounterForWave(7), null);
});

test('Vectorized SoA step clamps dt and computes squared distances accurately', () => {
  const posX = new Float32Array([0, 10]);
  const posY = new Float32Array([0, 20]);
  const velX = new Float32Array([100, -50]);
  const velY = new Float32Array([0, 100]);
  const distSq = new Float32Array(2);

  stepVectorizedEntitiesSoA(posX, posY, velX, velY, distSq, 5, 0, 0.05, 2);
  assert.equal(posX[0], 5);
  assert.equal(posY[0], 0);
  assert.equal(distSq[0], 0);
});

test('Infinite map sector coordinates wrap cleanly for positive and negative world coordinates', () => {
  const s1 = getInfiniteSectorCoords(250, -300, 1000);
  assert.equal(s1.sectorX, 0);
  assert.equal(s1.sectorY, -1);
  assert.equal(s1.localX, 250);
  assert.equal(s1.localY, 700);
});

test('XP threshold scales upward per level', () => {
  assert.ok(getXpRequiredForLevel(2) > getXpRequiredForLevel(1));
  assert.ok(getXpRequiredForLevel(10) > getXpRequiredForLevel(5));
});
