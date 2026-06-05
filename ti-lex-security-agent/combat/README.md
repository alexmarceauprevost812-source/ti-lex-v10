# ti-lex-v10 — Système de Compétences de Combat

## 📁 Structure

```
ti-lex-v10-combat/
├── types/
│   └── combat.ts          # Types & interfaces
├── data/
│   └── skills.ts          # Base de données des compétences
├── engine/
│   └── CombatEngine.ts    # Moteur de combat
├── hooks/
│   └── useCombat.ts       # Hook React
├── components/
│   └── CombatUI.tsx       # Interface utilisateur
├── styles/
│   └── combat.css         # Styles
└── README.md
```

## ⚔️ Compétences incluses

| Compétence | Type | Niveau | Mana | CD |
|---|---|---|---|---|
| Entaille | ATTACK | 1 | 0 | 0 |
| Frappe Puissante | ATTACK | 3 | 15 | 3 |
| Boule de Feu | ATTACK | 5 | 25 | 4 |
| Éclat de Glace | DEBUFF | 7 | 20 | 5 |
| Foudre | ATTACK | 10 | 35 | 6 |
| Volonté de Fer | BUFF | 4 | 20 | 8 |
| Cri de Guerre | BUFF | 8 | 30 | 10 |
| Premiers Soins | HEAL | 2 | 15 | 5 |
| Météore | ULTIMATE | 15 | 80 | 20 |
| Rage du Berserker | ULTIMATE | 12 | 50 | 18 |

## 🚀 Utilisation

1. Copier le dossier dans ton projet Next.js / React
2. Importer `CombatUI` dans une page
3. Ajouter `import '../styles/combat.css'`

```tsx
import CombatUI from './components/CombatUI';

export default function Page() {
  return <CombatUI />;
}
```

## 🧠 Fonctionnalités

- **6 types de compétences** : ATTACK, DEFENSE, BUFF, DEBUFF, HEAL, ULTIMATE
- **DOT** (Damage Over Time) : Feu, poison qui tick chaque tour
- **Buffs/Debuffs** : Durée en tours, auto-expire
- **Cooldowns** : Par compétence, tick chaque tour
- **Stun** : Empêche d'agir
- **Critique** : Basé sur `critChance`
- **Formule de dégâts** : `dégâts * (1 - defense/(defense+100))`
