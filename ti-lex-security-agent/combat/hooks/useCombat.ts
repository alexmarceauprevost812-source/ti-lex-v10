import { useState, useCallback } from 'react';
import { Combatant, CombatSkill } from '../types/combat';
import { CombatEngine } from '../engine/CombatEngine';

export function useCombat(initialPlayer: Combatant, initialEnemy: Combatant) {
  const [player, setPlayer] = useState<Combatant>(initialPlayer);
  const [enemy, setEnemy] = useState<Combatant>(initialEnemy);
  const [logs, setLogs] = useState<string[]>([]);
  const [turn, setTurn] = useState<number>(1);
  const [engine] = useState(() => new CombatEngine());

  const usePlayerSkill = useCallback((skill: CombatSkill) => {
    if (engine.isStunned(player)) {
      setLogs((prev) => [...prev, `${player.name} est étourdi et ne peut pas agir !`]);
      endTurn();
      return;
    }

    const result = engine.useSkill(player, enemy, skill);

    if (result.success) {
      setLogs((prev) => [
        ...prev,
        `--- Tour ${turn} ---`,
        result.message,
        ...result.log.map((l) => `${l.source} → ${l.target}: ${l.message}`),
      ]);
      setEnemy({ ...enemy });
      setPlayer({ ...player });
      endTurn();
    } else {
      setLogs((prev) => [...prev, `❌ ${result.message}`]);
    }
  }, [player, enemy, turn, engine]);

  const endTurn = useCallback(() => {
    const dotMessages = engine.processDOTs(enemy);
    engine.tickBuffs(enemy);
    engine.tickCooldowns();

    setLogs((prev) => [...prev, ...dotMessages]);
    setEnemy({ ...enemy });
    setTurn((t) => t + 1);
  }, [engine, enemy]);

  return { player, enemy, logs, turn, usePlayerSkill };
}
