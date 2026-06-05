import { CombatSkill } from '../types/combat';

export const SKILL_DATABASE: Record<string, CombatSkill> = {
  slash: {
    id: 'slash',
    name: 'Entaille',
    description: "Coup d'épée rapide infligeant des dégâts physiques.",
    type: 'ATTACK',
    icon: '⚔️',
    requiredLevel: 1,
    cooldown: 0,
    manaCost: 0,
    effects: [{ type: 'DAMAGE', value: 15, damageType: 'PHYSICAL' }],
  },

  power_strike: {
    id: 'power_strike',
    name: 'Frappe Puissante',
    description: "Attaque lourde avec 25% de chance de critique.",
    type: 'ATTACK',
    icon: '🔨',
    requiredLevel: 3,
    cooldown: 3,
    manaCost: 15,
    effects: [{ type: 'DAMAGE', value: 35, damageType: 'PHYSICAL' }],
  },

  fireball: {
    id: 'fireball',
    name: 'Boule de Feu',
    description: "Projette une boule de feu. Brûle l'ennemi (DOT).",
    type: 'ATTACK',
    icon: '🔥',
    requiredLevel: 5,
    cooldown: 4,
    manaCost: 25,
    effects: [
      { type: 'DAMAGE', value: 30, damageType: 'FIRE' },
      { type: 'DOT', value: 8, duration: 3, damageType: 'FIRE' },
    ],
  },

  ice_shard: {
    id: 'ice_shard',
    name: 'Éclat de Glace',
    description: "Réduit la vitesse de l'ennemi de 30% pendant 2 tours.",
    type: 'DEBUFF',
    icon: '❄️',
    requiredLevel: 7,
    cooldown: 5,
    manaCost: 20,
    effects: [
      { type: 'DAMAGE', value: 20, damageType: 'ICE' },
      { type: 'BUFF_STAT', value: -30, duration: 2, stat: 'speed' },
    ],
  },

  thunder_strike: {
    id: 'thunder_strike',
    name: 'Foudre',
    description: "Frappe de foudre. 50% de chance d'étourdir.",
    type: 'ATTACK',
    icon: '⚡',
    requiredLevel: 10,
    cooldown: 6,
    manaCost: 35,
    effects: [
      { type: 'DAMAGE', value: 45, damageType: 'LIGHTNING' },
      { type: 'STUN', value: 1, duration: 1 },
    ],
  },

  iron_will: {
    id: 'iron_will',
    name: 'Volonté de Fer',
    description: "Augmente la défense de 50% pendant 3 tours.",
    type: 'BUFF',
    icon: '🛡️',
    requiredLevel: 4,
    cooldown: 8,
    manaCost: 20,
    effects: [{ type: 'BUFF_STAT', value: 50, duration: 3, stat: 'defense' }],
  },

  battle_cry: {
    id: 'battle_cry',
    name: 'Cri de Guerre',
    description: "Booste l'attaque de toute l'équipe de 25%.",
    type: 'BUFF',
    icon: '📢',
    requiredLevel: 8,
    cooldown: 10,
    manaCost: 30,
    effects: [{ type: 'BUFF_STAT', value: 25, duration: 4, stat: 'attack' }],
  },

  first_aid: {
    id: 'first_aid',
    name: 'Premiers Soins',
    description: "Restaure 40 PV.",
    type: 'HEAL',
    icon: '💚',
    requiredLevel: 2,
    cooldown: 5,
    manaCost: 15,
    effects: [{ type: 'HEAL', value: 40 }],
  },

  meteor: {
    id: 'meteor',
    name: 'Météore',
    description: "ULTIME : Pluie de météores. Dégâts massifs sur tous les ennemis.",
    type: 'ULTIMATE',
    icon: '☄️',
    requiredLevel: 15,
    cooldown: 20,
    manaCost: 80,
    effects: [{ type: 'DAMAGE', value: 100, damageType: 'FIRE' }],
  },

  berserker_rage: {
    id: 'berserker_rage',
    name: 'Rage du Berserker',
    description: "ULTIME : Attaque x3, défense réduite. Dure 3 tours.",
    type: 'ULTIMATE',
    icon: '😤',
    requiredLevel: 12,
    cooldown: 18,
    manaCost: 50,
    effects: [
      { type: 'BUFF_STAT', value: 200, duration: 3, stat: 'attack' },
      { type: 'BUFF_STAT', value: -50, duration: 3, stat: 'defense' },
    ],
  },
};
