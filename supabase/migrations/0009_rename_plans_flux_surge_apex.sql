-- Rename standard plans Starter/Pro/Industriel -> FLUX/SURGE/APEX
-- The old CHECK constraints rejected the new plan names, which silently
-- blocked the Stripe webhook from writing profiles.plan = 'flux'/'surge'/'apex'
-- (root cause of the persistent "Aucun forfait" after a successful checkout).

-- 1. Drop the old CHECK constraints that reject the new plan names
ALTER TABLE profiles    DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;

-- 2. Migrate existing data to the new plan names
UPDATE profiles SET plan = CASE plan
  WHEN 'starter'    THEN 'flux'
  WHEN 'pro'        THEN 'surge'
  WHEN 'industriel' THEN 'apex'
  WHEN 'ultra'      THEN 'apex'
  ELSE plan
END
WHERE plan IN ('starter','pro','industriel','ultra');

UPDATE plan_limits SET plan = CASE plan
  WHEN 'starter'    THEN 'flux'
  WHEN 'pro'        THEN 'surge'
  WHEN 'industriel' THEN 'apex'
  ELSE plan
END
WHERE plan IN ('starter','pro','industriel');

-- 3. Re-add the constraints allowing the new names (FLUX/SURGE/APEX)
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan = ANY (ARRAY[
    'free','flux','surge','apex',
    'cyber_shield','cyber_guardian','cyber_sentinel','cyber_fortress'
  ]));

ALTER TABLE plan_limits ADD CONSTRAINT plan_limits_plan_check
  CHECK (plan = ANY (ARRAY[
    'free','flux','surge','apex',
    'cyber_shield','cyber_guardian','cyber_sentinel','cyber_fortress'
  ]));
