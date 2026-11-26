export type GameStatus = "Supported" | "Discontinued" | "Not listed";

export interface GameEntry {
  /** Roblox place ID (the number in roblox.com/games/<placeId>). Used for launching. */
  placeId: string;
  /** Roblox universe (experience) ID. Used for game icons and details. */
  universeId: string;
  name: string;
  category: string;
  description: string;
  status: GameStatus;
}

export const SEISEN_LOADER_SCRIPT = `loadstring(game:HttpGet("https://api.junkie-development.de/api/v1/luascripts/public/8ac2e97282ac0718aeeb3bb3856a2821d71dc9e57553690ab508ebdb0d1569da/download"))()`;

export const CATALOG: GameEntry[] = [
  { placeId: "74193805629461", universeId: "10178802449", name: "+1 Mine Per Click",           category: "Simulator", status: "Not listed",    description: "Mine blocks with every click, upgrade your pickaxe and explore deeper underground." },
  { placeId: "102072869879193", universeId: "10502841145", name: "Anime Astral Simulator", category: "Anime", status: "Supported", description: "Train anime fighters, roll for powerful units and progress through astral worlds." },
  { placeId: "113290951185459", universeId: "10708913337", name: "Anime Dice", category: "Anime", status: "Supported", description: "Roll dice to summon anime characters, build your team and win battles." },
  { placeId: "90462358603255", universeId: "7882829745",  name: "Anime Eternal",           category: "Anime",     status: "Not listed",    description: "Train your anime character, unlock powerful abilities and dominate battles." },
  { placeId: "84515722934860", universeId: "7613921865",  name: "Anime Expedition",        category: "Anime",     status: "Not listed",    description: "Embark on an anime expedition, recruit allies, defeat bosses and explore worlds." },
  { placeId: "123638582555543", universeId: "8469926548",  name: "Anime Fight",              category: "Anime",     status: "Not listed",    description: "PvP anime fighting game with iconic characters, skills and special combos." },
  { placeId: "111446873000464", universeId: "9774981774",  name: "Anime Re:Rangers X",       category: "Anime",     status: "Not listed",    description: "Ranger-style anime game with team battles, synergy skills and special moves." },
  { placeId: "87039211657390", universeId: "7074860883",  name: "Arise Crossover",          category: "Anime",     status: "Discontinued", description: "Solo Leveling inspired dungeon progression with powerful hunter skills." },
  { placeId: "286090429", universeId: "111958650",   name: "Arsenal",                  category: "Shooter",   status: "Not listed",    description: "Fast-paced FPS gun game. Kill with every weapon to win the round." },
  { placeId: "81535567274521", universeId: "8220767002",  name: "Bee Garden",               category: "Simulator", status: "Not listed",    description: "Collect and manage bees, expand your garden and produce honey for profit." },
  { placeId: "2753915549", universeId: "994732206", name: "Blox Fruits", category: "RPG", status: "Supported", description: "Sail the seas, eat Devil Fruits and become the strongest swordsman or fruit user." },
  { placeId: "16893821047", universeId: "5803093656",  name: "Blue Heater 2",            category: "Shooter",   status: "Supported",    description: "Military combat game with strategic objectives and intense firefights." },
  { placeId: "107646426076756", universeId: "10039338037", name: "Build a Ring Farm",        category: "Simulator", status: "Not listed",    description: "Build and expand your ring farm, growing crops and unlocking new structures." },
  { placeId: "82524183928567", universeId: "10265803948", name: "Build a Soccer Team",      category: "Simulator", status: "Not listed",    description: "Recruit players, train skills and build the ultimate championship soccer club." },
  { placeId: "105555311806207", universeId: "8066283370",  name: "Build a Zoo",              category: "Tycoon",    status: "Not listed",    description: "Design and manage a thriving zoo with exotic animals and visitor attractions." },
  { placeId: "101949297449238", universeId: "7541395924",  name: "Build An Island",          category: "Simulator", status: "Not listed",    description: "Build and customize your own island paradise from scratch with friends." },
  { placeId: "95885904866309", universeId: "8820222330",  name: "Dig and Hatch a Brainrot", category: "Simulator", status: "Discontinued", description: "Dig for eggs, hatch rare brainrot pets and grow your collection." },
  { placeId: "81440632616906", universeId: "7468338447",  name: "Dig to Earth's CORE",      category: "Simulator", status: "Not listed",    description: "Mine your way to the earth's core discovering rare ores and hidden treasures." },
  { placeId: "94845773826960", universeId: "7546582051",  name: "Dungeon Heroes",           category: "RPG",       status: "Supported",    description: "Dungeon crawling RPG with heroes, epic bosses and deep loot progression." },
  { placeId: "134381727982611", universeId: "9826885587",  name: "Evomon",                   category: "Anime",     status: "Not listed",    description: "Catch, evolve and battle powerful monster companions in an open-world adventure." },
  { placeId: "126010536233512", universeId: "8328640632",  name: "Farm It",                  category: "Simulator", status: "Not listed",    description: "Plant, grow and harvest crops to build the ultimate farming empire." },
  { placeId: "121864768012064", universeId: "6701277882",  name: "Fish It",                  category: "Simulator", status: "Supported"   , description: "Cast your line and reel in rare fish from exotic locations around the world." },
  { placeId: "130594398886540", universeId: "9509842868",  name: "Garden Horizons",          category: "Simulator", status: "Not listed",    description: "Relaxing gardening simulation with seasonal events and creative decoration." },
  { placeId: "97598239454123", universeId: "10200395747", name: "Grow a Garden 2",          category: "Simulator", status: "Not listed",    description: "Plant, water and harvest in this relaxing sequel to the hit gardening game." },
  { placeId: "17516596118", universeId: "5995470825",  name: "Hypershot",                category: "Shooter",   status: "Discontinued", description: "Hyper-fast shooting game with rapid-fire mechanics and intense competitive action." },
  { placeId: "74848159470277", universeId: "9529182643",  name: "Levelbound",               category: "RPG",       status: "Not listed",    description: "Level up your character through quests, monster hunting and skill mastery." },
  { placeId: "142823291", universeId: "66654135", name: "Murder Mystery 2", category: "Other", status: "Supported", description: "Find the murderer as an innocent or sheriff, or eliminate everyone as the murderer." },
  { placeId: "8737899170", universeId: "3317771874", name: "Pet Simulator 99", category: "Simulator", status: "Supported", description: "Collect and hatch pets, break coins and unlock new worlds." },
  { placeId: "127742093697776", universeId: "8316902627",  name: "Plants Vs Brainrots",      category: "Strategy",  status: "Not listed",    description: "Tower defense: place plants to fend off endless waves of invading brainrots." },
  { placeId: "16205713724", universeId: "5595353122", name: "Project Slayers 2", category: "RPG", status: "Supported", description: "Demon-slaying action RPG with breathing styles, bosses and progression." },
  { placeId: "74256669508761", universeId: "8662243497",  name: "Raft 101 Survival",        category: "Simulator", status: "Supported",    description: "Survive on a raft in the open ocean, gather resources and expand your base." },
  { placeId: "73066215063285", universeId: "6867859535",  name: "RE:XL",                    category: "RPG",       status: "Discontinued", description: "Action RPG with fast combat, deep skill trees and brutal boss encounters." },
  { placeId: "119048529960596", universeId: "7094518649",  name: "Restaurant Tycoon 3",      category: "Tycoon",    status: "Supported",    description: "Build and manage your restaurant empire from street food stall to 5-star dining." },
  { placeId: "17625359962", universeId: "6035872082",  name: "Rivals",                   category: "Shooter",   status: "Not listed",    description: "Competitive 1v1 and 2v2 tactical FPS shooter with custom loadouts and rank progression." },
  { placeId: "77843161404023", universeId: "9970645639",  name: "Run a Restaurant",         category: "Tycoon",    status: "Supported",    description: "Manage staff, cook meals and expand your restaurant business into a global brand." },
  { placeId: "92416421522960", universeId: "9792947201",  name: "Slime RNG",                category: "Simulator", status: "Not listed",    description: "Roll for rare slimes, build your collection and discover legendary variants." },
  { placeId: "99046552174353", universeId: "9073775318",  name: "Slime Seas",               category: "Simulator", status: "Not listed",    description: "Sail the slime seas, discover islands and collect rare oceanic slimes." },
  { placeId: "117381420723145", universeId: "9802644580",  name: "Summon Heroes",            category: "RPG",       status: "Not listed",    description: "Summon powerful heroes, build the ultimate team and conquer dungeons." },
  { placeId: "11523257493", universeId: "4093155512",  name: "Swordburst 3",             category: "RPG",       status: "Not listed",    description: "Sword-based MMO RPG with floor-clearing dungeons and rare equipment drops." },
  { placeId: "72858262610964", universeId: "10629695169", name: "Tap Simulator Reborn", category: "Simulator", status: "Supported", description: "Tap to earn, rebirth for multipliers and hatch pets to tap faster." },
  { placeId: "76558904092080", universeId: "7671049560",  name: "The Forge",                category: "Simulator", status: "Supported",    description: "Craft and upgrade powerful weapons in a deep blacksmithing adventure." },
  { placeId: "120219252362013", universeId: "10766972131", name: "Throw Food For Animals", category: "Simulator", status: "Supported", description: "Throw food to feed animals, earn coins and unlock new areas and creatures." },
  { placeId: "118821269826806", universeId: "10006104044", name: "Wizard Alchemy",           category: "Simulator", status: "Not listed",    description: "Master the art of alchemy by combining ingredients to craft powerful potions." },
  { placeId: "2727067538", universeId: "985731078",   name: "World Zero",               category: "RPG",       status: "Supported",    description: "Massive anime MMORPG with classes, dungeons, pets, bosses and open-world exploration." },
];

/**
 * Older app versions stored a catalog game's universe ID where its place ID belongs.
 * Returns the correct place ID if `id` is one of those universe IDs, otherwise null.
 */
export function placeIdForCatalogUniverse(id: string): string | null {
  if (CATALOG.some(g => g.placeId === id)) return null;
  return CATALOG.find(g => g.universeId === id)?.placeId ?? null;
}
