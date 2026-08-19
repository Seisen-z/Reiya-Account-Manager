export type GameStatus = "Supported" | "Discontinued";

export interface GameEntry {
  placeId: string;
  name: string;
  category: string;
  description: string;
  status: GameStatus;
}

export const SEISEN_LOADER_SCRIPT = `loadstring(game:HttpGet("https://api.junkie-development.de/api/v1/luascripts/public/8ac2e97282ac0718aeeb3bb3856a2821d71dc9e57553690ab508ebdb0d1569da/download"))()`;

export const CATALOG: GameEntry[] = [
  { placeId: "10178802449", name: "+1 Mine Per Click",           category: "Simulator", status: "Supported",    description: "Mine blocks with every click, upgrade your pickaxe and explore deeper underground." },
  { placeId: "7882829745",  name: "Anime Eternal",           category: "Anime",     status: "Supported",    description: "Train your anime character, unlock powerful abilities and dominate battles." },
  { placeId: "7613921865",  name: "Anime Expedition",        category: "Anime",     status: "Supported",    description: "Embark on an anime expedition, recruit allies, defeat bosses and explore worlds." },
  { placeId: "8469926548",  name: "Anime Fight",              category: "Anime",     status: "Supported",    description: "PvP anime fighting game with iconic characters, skills and special combos." },
  { placeId: "9774981774",  name: "Anime Re:Rangers X",       category: "Anime",     status: "Supported",    description: "Ranger-style anime game with team battles, synergy skills and special moves." },
  { placeId: "7074860883",  name: "Arise Crossover",          category: "Anime",     status: "Discontinued", description: "Solo Leveling inspired dungeon progression with powerful hunter skills." },
  { placeId: "111958650",   name: "Arsenal",                  category: "Shooter",   status: "Supported",    description: "Fast-paced FPS gun game. Kill with every weapon to win the round." },
  { placeId: "8220767002",  name: "Bee Garden",               category: "Simulator", status: "Supported",    description: "Collect and manage bees, expand your garden and produce honey for profit." },
  { placeId: "5803093656",  name: "Blue Heater 2",            category: "Shooter",   status: "Supported",    description: "Military combat game with strategic objectives and intense firefights." },
  { placeId: "10039338037", name: "Build a Ring Farm",        category: "Simulator", status: "Supported",    description: "Build and expand your ring farm, growing crops and unlocking new structures." },
  { placeId: "10265803948", name: "Build a Soccer Team",      category: "Simulator", status: "Supported",    description: "Recruit players, train skills and build the ultimate championship soccer club." },
  { placeId: "8066283370",  name: "Build a Zoo",              category: "Tycoon",    status: "Supported",    description: "Design and manage a thriving zoo with exotic animals and visitor attractions." },
  { placeId: "7541395924",  name: "Build An Island",          category: "Simulator", status: "Supported",    description: "Build and customize your own island paradise from scratch with friends." },
  { placeId: "8820222330",  name: "Dig and Hatch a Brainrot", category: "Simulator", status: "Discontinued", description: "Dig for eggs, hatch rare brainrot pets and grow your collection." },
  { placeId: "7468338447",  name: "Dig to Earth's CORE",      category: "Simulator", status: "Supported",    description: "Mine your way to the earth's core discovering rare ores and hidden treasures." },
  { placeId: "7546582051",  name: "Dungeon Heroes",           category: "RPG",       status: "Supported",    description: "Dungeon crawling RPG with heroes, epic bosses and deep loot progression." },
  { placeId: "9826885587",  name: "Evomon",                   category: "Anime",     status: "Supported",    description: "Catch, evolve and battle powerful monster companions in an open-world adventure." },
  { placeId: "8328640632",  name: "Farm It",                  category: "Simulator", status: "Supported",    description: "Plant, grow and harvest crops to build the ultimate farming empire." },
  { placeId: "6701277882",  name: "Fish It",                  category: "Simulator", status: "Discontinued", description: "Cast your line and reel in rare fish from exotic locations around the world." },
  { placeId: "9509842868",  name: "Garden Horizons",          category: "Simulator", status: "Supported",    description: "Relaxing gardening simulation with seasonal events and creative decoration." },
  { placeId: "10200395747", name: "Grow a Garden 2",          category: "Simulator", status: "Supported",    description: "Plant, water and harvest in this relaxing sequel to the hit gardening game." },
  { placeId: "5995470825",  name: "Hypershot",                category: "Shooter",   status: "Discontinued", description: "Hyper-fast shooting game with rapid-fire mechanics and intense competitive action." },
  { placeId: "9529182643",  name: "Levelbound",               category: "RPG",       status: "Supported",    description: "Level up your character through quests, monster hunting and skill mastery." },
  { placeId: "8316902627",  name: "Plants Vs Brainrots",      category: "Strategy",  status: "Supported",    description: "Tower defense: place plants to fend off endless waves of invading brainrots." },
  { placeId: "8662243497",  name: "Raft 101 Survival",        category: "Simulator", status: "Supported",    description: "Survive on a raft in the open ocean, gather resources and expand your base." },
  { placeId: "6867859535",  name: "RE:XL",                    category: "RPG",       status: "Discontinued", description: "Action RPG with fast combat, deep skill trees and brutal boss encounters." },
  { placeId: "7094518649",  name: "Restaurant Tycoon 3",      category: "Tycoon",    status: "Supported",    description: "Build and manage your restaurant empire from street food stall to 5-star dining." },
  { placeId: "6035872082",  name: "Rivals",                   category: "Shooter",   status: "Supported",    description: "Competitive 1v1 and 2v2 tactical FPS shooter with custom loadouts and rank progression." },
  { placeId: "9970645639",  name: "Run a Restaurant",         category: "Tycoon",    status: "Supported",    description: "Manage staff, cook meals and expand your restaurant business into a global brand." },
  { placeId: "9792947201",  name: "Slime RNG",                category: "Simulator", status: "Supported",    description: "Roll for rare slimes, build your collection and discover legendary variants." },
  { placeId: "9073775318",  name: "Slime Seas",               category: "Simulator", status: "Supported",    description: "Sail the slime seas, discover islands and collect rare oceanic slimes." },
  { placeId: "9802644580",  name: "Summon Heroes",            category: "RPG",       status: "Supported",    description: "Summon powerful heroes, build the ultimate team and conquer dungeons." },
  { placeId: "4093155512",  name: "Swordburst 3",             category: "RPG",       status: "Supported",    description: "Sword-based MMO RPG with floor-clearing dungeons and rare equipment drops." },
  { placeId: "7671049560",  name: "The Forge",                category: "Simulator", status: "Supported",    description: "Craft and upgrade powerful weapons in a deep blacksmithing adventure." },
  { placeId: "10006104044", name: "Wizard Alchemy",           category: "Simulator", status: "Supported",    description: "Master the art of alchemy by combining ingredients to craft powerful potions." },
  { placeId: "985731078",   name: "World Zero",               category: "RPG",       status: "Supported",    description: "Massive anime MMORPG with classes, dungeons, pets, bosses and open-world exploration." },
];
