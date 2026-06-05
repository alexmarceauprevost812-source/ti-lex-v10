export type SkillType = 'ATTACK' | 'DEFENSE' | 'BUFF' | 'DEBUFF' | 'HEAL' | 'ULTIMATE';
export type DamageType = 'PHYSICAL' | 'MAGIC' | 'FIRE' | 'ICE' | 'LIGHTNING' | 'POISON';

export interface SkillEffect {
  type: 'DAMAGE' | 'HEAL' | 'BUFF_STAT' | 'DOT' | 'STUN' | 'SHIELD';
  value: number;
  duration?: number;
  stat?: 'attack' | 'defense' | 'speed' | 'critChance';
  damageType?: DamageType;
}

export interface CombatSkill {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  icon: string;
  requiredLevel: number;
  cooldown: number;
  manaCost: number;
  effects: SkillEffect[];
  unlockCondition?: string;
  animation?: string;
}

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  stats: {
    attack: number;
    defense: number;
    speed: number;
    critChance: number;
  };
  activeSkills: CombatSkill[];
  buffs: ActiveEffect[];
  debuffs: ActiveEffect[];
}

export interface ActiveEffect {
  skillId: string;
  effect: SkillEffect;
  remainingDuration: number;
  sourceId: string;
}

export interface CombatLog {
  type: string;
  source: string;
  target: string;
  value: number;
  message: string;
}
