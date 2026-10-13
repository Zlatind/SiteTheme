// Block and item registry.
'use strict';

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANKS: 5, LOG: 6, LEAVES: 7, SAND: 8,
  WATER: 9, GLASS: 10, BRICKS: 11, BEDROCK: 12, GRAVEL: 13, COAL_ORE: 14, IRON_ORE: 15,
  GOLD_ORE: 16, DIAMOND_ORE: 17, TABLE: 18, WOOL_WHITE: 19, WOOL_RED: 20, GLOWSTONE: 21,
  TNT: 22, STONE_BRICKS: 23, OBSIDIAN: 24, SNOW_GRASS: 25, BOOKSHELF: 26, WOOL_BLUE: 27,
  WOOL_YELLOW: 28, CACTUS: 29, PUMPKIN: 30, MOSSY_COBBLE: 31, CLAY: 32, SNOW: 33,
};

const ITEM = { APPLE: 100, BREAD: 101 };

// tex: [px, nx, py, ny, pz, nz]
function allSides(t) { return [t, t, t, t, t, t]; }
function column(side, top, bottom = top) { return [side, side, top, bottom, side, side]; }

const BLOCKS = {
  [B.GRASS]: { name: 'Grass Block', tex: [TEX.grass_side, TEX.grass_side, TEX.grass_top, TEX.dirt, TEX.grass_side, TEX.grass_side], hardness: 0.9, drop: B.DIRT, sound: 'grass' },
  [B.DIRT]: { name: 'Dirt', tex: allSides(TEX.dirt), hardness: 0.75, sound: 'grass' },
  [B.STONE]: { name: 'Stone', tex: allSides(TEX.stone), hardness: 2.2, drop: B.COBBLE, sound: 'stone' },
  [B.COBBLE]: { name: 'Cobblestone', tex: allSides(TEX.cobblestone), hardness: 2.4, sound: 'stone' },
  [B.PLANKS]: { name: 'Oak Planks', tex: allSides(TEX.planks), hardness: 1.5, sound: 'wood' },
  [B.LOG]: { name: 'Oak Log', tex: column(TEX.log_side, TEX.log_top), hardness: 1.8, sound: 'wood' },
  [B.LEAVES]: { name: 'Oak Leaves', tex: allSides(TEX.leaves), hardness: 0.3, transparent: true, drop: 'leaves', sound: 'grass' },
  [B.SAND]: { name: 'Sand', tex: allSides(TEX.sand), hardness: 0.75, sound: 'sand' },
  [B.WATER]: { name: 'Water', tex: allSides(TEX.water), hardness: Infinity, transparent: true, liquid: true, solid: false },
  [B.GLASS]: { name: 'Glass', tex: allSides(TEX.glass), hardness: 0.4, transparent: true, drop: null, sound: 'glass' },
  [B.BRICKS]: { name: 'Bricks', tex: allSides(TEX.bricks), hardness: 2.4, sound: 'stone' },
  [B.BEDROCK]: { name: 'Bedrock', tex: allSides(TEX.bedrock), hardness: Infinity, sound: 'stone' },
  [B.GRAVEL]: { name: 'Gravel', tex: allSides(TEX.gravel), hardness: 0.8, sound: 'sand' },
  [B.COAL_ORE]: { name: 'Coal Ore', tex: allSides(TEX.coal_ore), hardness: 3, sound: 'stone' },
  [B.IRON_ORE]: { name: 'Iron Ore', tex: allSides(TEX.iron_ore), hardness: 3.2, sound: 'stone' },
  [B.GOLD_ORE]: { name: 'Gold Ore', tex: allSides(TEX.gold_ore), hardness: 3.2, sound: 'stone' },
  [B.DIAMOND_ORE]: { name: 'Diamond Ore', tex: allSides(TEX.diamond_ore), hardness: 3.6, sound: 'stone' },
  [B.TABLE]: { name: 'Crafting Table', tex: [TEX.table_side, TEX.table_side, TEX.table_top, TEX.planks, TEX.table_front, TEX.table_front], hardness: 1.8, sound: 'wood' },
  [B.WOOL_WHITE]: { name: 'White Wool', tex: allSides(TEX.wool_white), hardness: 0.6, sound: 'wool' },
  [B.WOOL_RED]: { name: 'Red Wool', tex: allSides(TEX.wool_red), hardness: 0.6, sound: 'wool' },
  [B.WOOL_BLUE]: { name: 'Blue Wool', tex: allSides(TEX.wool_blue), hardness: 0.6, sound: 'wool' },
  [B.WOOL_YELLOW]: { name: 'Yellow Wool', tex: allSides(TEX.wool_yellow), hardness: 0.6, sound: 'wool' },
  [B.GLOWSTONE]: { name: 'Glowstone', tex: allSides(TEX.glowstone), hardness: 0.5, sound: 'glass', glow: true },
  [B.TNT]: { name: 'TNT', tex: [TEX.tnt_side, TEX.tnt_side, TEX.tnt_top, TEX.tnt_bottom, TEX.tnt_side, TEX.tnt_side], hardness: 0.1, sound: 'grass' },
  [B.STONE_BRICKS]: { name: 'Stone Bricks', tex: allSides(TEX.stone_bricks), hardness: 2.4, sound: 'stone' },
  [B.OBSIDIAN]: { name: 'Obsidian', tex: allSides(TEX.obsidian), hardness: 8, sound: 'stone' },
  [B.SNOW_GRASS]: { name: 'Snowy Grass', tex: [TEX.grass_side_snow, TEX.grass_side_snow, TEX.snow, TEX.dirt, TEX.grass_side_snow, TEX.grass_side_snow], hardness: 0.9, drop: B.DIRT, sound: 'snow' },
  [B.BOOKSHELF]: { name: 'Bookshelf', tex: column(TEX.bookshelf, TEX.planks), hardness: 1.5, sound: 'wood' },
  [B.CACTUS]: { name: 'Cactus', tex: column(TEX.cactus_side, TEX.cactus_top), hardness: 0.4, transparent: true, sound: 'wool' },
  [B.PUMPKIN]: { name: 'Pumpkin', tex: [TEX.pumpkin_side, TEX.pumpkin_side, TEX.pumpkin_top, TEX.pumpkin_top, TEX.pumpkin_face, TEX.pumpkin_side], hardness: 1, sound: 'wood' },
  [B.MOSSY_COBBLE]: { name: 'Mossy Cobblestone', tex: allSides(TEX.mossy_cobble), hardness: 2.4, sound: 'stone' },
  [B.CLAY]: { name: 'Clay', tex: allSides(TEX.clay), hardness: 0.6, sound: 'sand' },
  [B.SNOW]: { name: 'Snow Block', tex: allSides(TEX.snow), hardness: 0.3, sound: 'snow' },
};

const ITEMS = {
  [ITEM.APPLE]: { name: 'Apple', food: 4 },
  [ITEM.BREAD]: { name: 'Pumpkin Pie', food: 8 },
};

// Fast lookup tables indexed by block id
const IS_SOLID = new Uint8Array(256);       // collides with player
const IS_OPAQUE = new Uint8Array(256);      // hides neighbouring faces / casts AO
const IS_TRANSPARENT = new Uint8Array(256);
for (const id in BLOCKS) {
  const b = BLOCKS[id];
  IS_SOLID[id] = b.solid === false ? 0 : 1;
  IS_TRANSPARENT[id] = b.transparent ? 1 : 0;
  IS_OPAQUE[id] = b.transparent ? 0 : 1;
}

function itemName(id) {
  return (BLOCKS[id] || ITEMS[id] || { name: '?' }).name;
}
function isBlock(id) { return id > 0 && id < 100; }

// Order shown in the creative inventory, grouped like the in-game tabs
const CREATIVE_TABS = [
  { name: 'Construction', icon: B.BRICKS, items: [B.PLANKS, B.COBBLE, B.MOSSY_COBBLE, B.STONE, B.STONE_BRICKS, B.BRICKS, B.GLASS, B.WOOL_WHITE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW, B.OBSIDIAN, B.SNOW, B.CLAY] },
  { name: 'Nature', icon: B.GRASS, items: [B.GRASS, B.SNOW_GRASS, B.DIRT, B.SAND, B.GRAVEL, B.LOG, B.LEAVES, B.CACTUS, B.PUMPKIN, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.BEDROCK] },
  { name: 'Equipment', icon: B.TNT, items: [B.TABLE, B.BOOKSHELF, B.GLOWSTONE, B.TNT] },
  { name: 'Items', icon: ITEM.APPLE, items: [ITEM.APPLE, ITEM.BREAD] },
];

// Simple shapeless recipes for the survival crafting list
const RECIPES = [
  { out: [B.PLANKS, 4], ing: [[B.LOG, 1]] },
  { out: [B.TABLE, 1], ing: [[B.PLANKS, 4]] },
  { out: [B.STONE_BRICKS, 4], ing: [[B.COBBLE, 4]] },
  { out: [B.GLASS, 1], ing: [[B.SAND, 1]] },
  { out: [B.BOOKSHELF, 1], ing: [[B.PLANKS, 6]] },
  { out: [B.BRICKS, 1], ing: [[B.CLAY, 1]] },
  { out: [B.TNT, 1], ing: [[B.SAND, 4], [B.GRAVEL, 5]] },
  { out: [ITEM.BREAD, 1], ing: [[B.PUMPKIN, 1]] },
];
