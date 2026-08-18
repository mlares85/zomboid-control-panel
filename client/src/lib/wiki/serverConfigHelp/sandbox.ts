import type { FieldHelpData } from '../types'

const DEEP_DIVE = 'server-config-deep-dive'

// Field-level help for sandbox settings on the Server Configuration page.
// Keyed by sandbox `key`. A handful of keys repeat across sections (e.g.
// "Strength" is both a zombie lore stat and an XP multiplier) — those use a
// `section:key` composite key, resolved by getServerConfigHelp() in
// ../serverConfigHelp/index.ts before falling back to the plain key.
export const SANDBOX_HELP: Record<string, FieldHelpData> = {
  DayLength: {
    description: 'How long a full in-game day lasts in real time.',
    context: 'Shorter days speed up survival pressure (hunger, sleep, decay); longer days give more time to accomplish tasks per cycle.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  StartYear: {
    description: 'The in-game year the save begins in.',
    context: 'Purely cosmetic/flavor — has no effect on difficulty or mechanics.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Zombies: {
    description: 'Overall starting zombie population density.',
    context: 'Also sets the Population Multiplier under zombie population settings — changing one may implicitly change the other on next load.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  Distribution: {
    description: 'How zombies are spatially distributed across the map — clustered in urban areas or spread uniformly.',
    context: 'Urban Focused keeps rural bases safer; Uniform makes the whole map equally dangerous.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  ZombieRespawn: {
    description: 'How frequently new zombies are added to already-cleared areas over time.',
    context: 'Set to None for a world that stays cleared once you\'ve cleared it; higher settings keep pressure on established bases.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  ZombieMigrate: {
    description: 'Allows zombies to wander into cells that have been fully cleared.',
    context: 'Disabling this keeps cleared safe-zones cleared, independent of the respawn setting above.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  FoodLootNew: {
    description: 'Spawn rate multiplier for perishable food items (fresh produce, meat, etc.).',
    context: 'Lower values increase the survival challenge of finding food before it becomes scarce; higher values ease early-game hunger pressure.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  WeaponLootNew: {
    description: 'Spawn rate multiplier for melee weapons.',
    context: 'Balance against Zombies population — high weapon availability with low zombie density trivializes combat.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  RangedWeaponLootNew: {
    description: 'Spawn rate multiplier for firearms.',
    context: 'Firearms attract zombies via noise — combine with FirearmNoiseMultiplier when tuning difficulty around guns.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  AmmoLootNew: {
    description: 'Spawn rate multiplier for ammunition.',
    context: 'Keeping this scarce relative to RangedWeaponLootNew makes finding a gun exciting but not immediately game-changing.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  MedicalLootNew: {
    description: 'Spawn rate multiplier for medical supplies (bandages, first aid, medication).',
    context: 'Directly affects survivability after zombie encounters or injuries — tune alongside InjurySeverity and BoneFracture.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'MultiplierConfig:Strength': {
    description: 'XP multiplier for the Strength skill.',
    context: 'Applies to skill XP gain, not raw physical strength — 1.0 is vanilla progression speed.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Strength': {
    description: 'How strong zombies are — affects how hard they hit and how much force they exert against barricades/fences.',
    context: 'Higher settings make melee trades and base defenses riskier; pairs with ZombiesArmorFactor and ZombiesMaxDefense.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Speed': {
    description: 'Zombie movement speed category (e.g. shamblers vs. sprinters).',
    context: 'The single biggest driver of difficulty and horde-management strategy — fast zombies fundamentally change how you play.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Toughness': {
    description: 'How much damage a zombie can absorb before going down.',
    context: 'Higher toughness makes ranged and melee kills take more hits, increasing ammo/stamina consumption per kill.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Cognition': {
    description: 'How well zombies navigate obstacles and pursue players (pathing intelligence).',
    context: '"Navigate Doors" and higher tiers make barricading alone insufficient defense.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Sight': {
    description: 'How far away zombies can visually detect a player.',
    context: 'Combined with Hearing, this controls how much stealth actually matters in your world.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'ZombieLore:Hearing': {
    description: 'How easily zombies are alerted by noise (gunshots, alarms, sprinting).',
    context: 'High hearing makes firearms and vehicles much riskier to use near a horde.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  'MultiplierConfig:PopulationMultiplier': {
    description: 'Global multiplier applied to the total zombie population across the map.',
    context: 'The main lever for overall zombie count — mirrors the simple "Zombie Count" preset but lets you set an exact value.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  RespawnHours: {
    description: 'In-game hours before zombies can respawn in an area, once population has been reduced.',
    context: '0 means zombies never respawn once killed, letting players permanently clear regions.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  FarmingSpeedNew: {
    description: 'Multiplier for how quickly farming actions (planting, watering, harvesting) complete.',
    context: 'Lower values make farming a bigger time investment relative to looting for food.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  EnableVehicles: {
    description: 'Master toggle for whether vehicles exist in the world at all.',
    context: 'Disabling removes cars entirely, which also removes car-alarm zombie-attraction mechanics as a factor.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Nutrition: {
    description: 'Enables the nutrition system, where food type variety (not just calories) affects character health.',
    context: 'Adds a deeper food-management layer; disabling simplifies survival to calorie-counting only.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  StarterKit: {
    description: 'Gives every new character a small starter kit of basic supplies on spawn.',
    context: 'Useful for reducing the harshest part of the early game on high-difficulty servers.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
}
