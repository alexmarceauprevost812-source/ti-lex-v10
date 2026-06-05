import { CombatSkill, Combatant, SkillEffect, ActiveEffect, CombatLog } from '../types/combat';

export class CombatEngine {
  private cooldowns: Map<string, Map<string, number>> = new Map();

  useSkill(
    caster: Combatant,
    target: Combatant,
    skill: CombatSkill
  ): { success: boolean; message: string; log: CombatLog[] } {
    const logs: CombatLog[] = [];

    if (caster.mana < skill.manaCost) {
      return { success: false, message: 'Pas assez de mana !', log: logs };
    }

    const casterCooldowns = this.cooldowns.get(caster.id) || new Map();
    if ((casterCooldowns.get(skill.id) || 0) > 0) {
      return { success: false, message: `Compétence en recharge (${casterCooldowns.get(skill.id)}s)`, log: logs };
    }

    caster.mana -= skill.manaCost;
    this.setCooldown(caster.id, skill.id, skill.cooldown);

    for (const effect of skill.effects) {
      const result = this.applyEffect(caster, target, effect);
      logs.push({
        type: effect.type,
        source: caster.name,
        target: target.name,
        value: result.value,
        message: result.message,
      });
    }

    return {
      success: true,
      message: `${caster.name} utilise ${skill.name} !`,
      log: logs,
    };
  }

  private applyEffect(
    caster: Combatant,
    target: Combatant,
    effect: SkillEffect
  ): { value: number; message: string } {
    switch (effect.type) {
      case 'DAMAGE': {
        const damage = this.calculateDamage(caster, target, effect);
        target.hp = Math.max(0, target.hp - damage);
        return { value: damage, message: `${damage} dégâts ${effect.damageType}` };
      }

      case 'HEAL': {
        const heal = Math.min(effect.value, target.maxHp - target.hp);
        target.hp += heal;
        return { value: heal, message: `+${heal} PV` };
      }

      case 'BUFF_STAT': {
        if (effect.stat) {
          const active: ActiveEffect = {
            skillId: 'buff',
            effect,
            remainingDuration: effect.duration || 1,
            sourceId: caster.id,
          };
          target.buffs.push(active);
          const sign = effect.value > 0 ? '+' : '';
          return { value: effect.value, message: `${sign}${effect.value}% ${effect.stat}` };
        }
        return { value: 0, message: 'Stat invalide' };
      }

      case 'DOT': {
        const dot: ActiveEffect = {
          skillId: 'dot',
          effect,
          remainingDuration: effect.duration || 1,
          sourceId: caster.id,
        };
        target.debuffs.push(dot);
        return { value: effect.value, message: `Brûlure appliquée (${effect.value}/tour)` };
      }

      case 'STUN': {
        const stun: ActiveEffect = {
          skillId: 'stun',
          effect,
          remainingDuration: effect.duration || 1,
          sourceId: caster.id,
        };
        target.debuffs.push(stun);
        return { value: 1, message: 'Étourdi !' };
      }

      case 'SHIELD': {
        return { value: effect.value, message: `Bouclier +${effect.value}` };
      }

      default:
        return { value: 0, message: 'Effet inconnu' };
    }
  }

  private calculateDamage(caster: Combatant, target: Combatant, effect: SkillEffect): number {
    let baseDamage = effect.value;
    const attackBonus = this.getStatWithBuffs(caster, 'attack');
    baseDamage += baseDamage * (attackBonus / 100);

    const defense = this.getStatWithBuffs(target, 'defense');
    const reduction = defense / (defense + 100);
    const finalDamage = Math.floor(baseDamage * (1 - reduction));

    const critRoll = Math.random();
    const critChance = this.getStatWithBuffs(caster, 'critChance') / 100;
    if (critRoll < critChance) {
      return Math.floor(finalDamage * 1.5);
    }

    return Math.max(1, finalDamage);
  }

  private getStatWithBuffs(combatant: Combatant, stat: 'attack' | 'defense' | 'speed' | 'critChance'): number {
    let base = combatant.stats[stat];
    for (const buff of combatant.buffs) {
      if (buff.effect.stat === stat && buff.effect.type === 'BUFF_STAT') {
        base += base * (buff.effect.value / 100);
      }
    }
    for (const debuff of combatant.debuffs) {
      if (debuff.effect.stat === stat && debuff.effect.type === 'BUFF_STAT') {
        base += base * (debuff.effect.value / 100);
      }
    }
    return Math.floor(base);
  }

  private setCooldown(casterId: string, skillId: string, duration: number) {
    if (!this.cooldowns.has(casterId)) {
      this.cooldowns.set(casterId, new Map());
    }
    this.cooldowns.get(casterId)!.set(skillId, duration);
  }

  tickCooldowns() {
    for (const [casterId, skills] of this.cooldowns) {
      for (const [skillId, remaining] of skills) {
        if (remaining > 0) {
          skills.set(skillId, remaining - 1);
        }
      }
    }
  }

  processDOTs(combatant: Combatant): string[] {
    const messages: string[] = [];
    combatant.debuffs = combatant.debuffs.filter((debuff) => {
      if (debuff.effect.type === 'DOT') {
        const damage = debuff.effect.value;
        combatant.hp = Math.max(0, combatant.hp - damage);
        messages.push(`${combatant.name} subit ${damage} dégâts de ${debuff.effect.damageType}`);
        debuff.remainingDuration--;
        return debuff.remainingDuration > 0;
      }
      return true;
    });
    return messages;
  }

  isStunned(combatant: Combatant): boolean {
    return combatant.debuffs.some((d) => d.effect.type === 'STUN' && d.remainingDuration > 0);
  }

  tickBuffs(combatant: Combatant) {
    combatant.buffs = combatant.buffs.filter((b) => {
      b.remainingDuration--;
      return b.remainingDuration > 0;
    });
    combatant.debuffs = combatant.debuffs.filter((d) => {
      if (d.effect.type !== 'DOT') {
        d.remainingDuration--;
        return d.remainingDuration > 0;
      }
      return true;
    });
  }
}
