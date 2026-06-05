import React from 'react';
import { Combatant } from '../types/combat';
import { SKILL_DATABASE } from '../data/skills';
import { useCombat } from '../hooks/useCombat';

const player: Combatant = {
  id: 'p1',
  name: 'Héros',
  hp: 100,
  maxHp: 100,
  mana: 50,
  maxMana: 50,
  stats: { attack: 20, defense: 15, speed: 10, critChance: 10 },
  activeSkills: [
    SKILL_DATABASE.slash,
    SKILL_DATABASE.power_strike,
    SKILL_DATABASE.fireball,
    SKILL_DATABASE.iron_will,
    SKILL_DATABASE.first_aid,
    SKILL_DATABASE.meteor,
  ],
  buffs: [],
  debuffs: [],
};

const enemy: Combatant = {
  id: 'e1',
  name: 'Gobelin',
  hp: 80,
  maxHp: 80,
  mana: 0,
  maxMana: 0,
  stats: { attack: 15, defense: 8, speed: 12, critChance: 5 },
  activeSkills: [SKILL_DATABASE.slash],
  buffs: [],
  debuffs: [],
};

export default function CombatUI() {
  const { player, enemy, logs, turn, usePlayerSkill } = useCombat(player, enemy);

  return (
    <div className="combat-container">
      <div className="enemy-bar">
        <h3>{enemy.name} ❤️ {enemy.hp}/{enemy.maxHp}</h3>
        <div className="hp-bar">
          <div style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%`, background: 'red' }} />
        </div>
      </div>

      <div className="combat-logs">
        {logs.slice(-10).map((log, i) => (
          <div key={i} className="log-entry">{log}</div>
        ))}
      </div>

      <div className="player-bar">
        <h3>{player.name} ❤️ {player.hp}/{player.maxHp} 🔵 {player.mana}/{player.maxMana}</h3>
        <div className="hp-bar">
          <div style={{ width: `${(player.hp / player.maxHp) * 100}%`, background: 'green' }} />
        </div>
      </div>

      <div className="skill-bar">
        {player.activeSkills.map((skill) => (
          <button
            key={skill.id}
            onClick={() => usePlayerSkill(skill)}
            disabled={player.mana < skill.manaCost || player.hp <= 0}
            className={`skill-btn ${skill.type.toLowerCase()}`}
            title={`${skill.description} | Mana: ${skill.manaCost} | CD: ${skill.cooldown}`}
          >
            <span className="skill-icon">{skill.icon}</span>
            <span className="skill-name">{skill.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
