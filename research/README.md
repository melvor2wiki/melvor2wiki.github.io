# Training calculations

The reader module in overrides/training-reader.js selects the greatest base XP/s at every skill level from 1 to 99 and merges adjacent identical recommendations. Cooking is recalculated at each level. Thieving adds success from level/perception, successful stages and the 2-second base stun; failures preserve stage progress.

Source hashes and six fixed-seed Monte Carlo checks are in training-models.json. The installed DLL checksum matches the original twelve-skill analysis. Monte Carlo error is below 0.45% in these checks; this measures agreement for the tested mechanics, not an error bound for every gameplay situation.

Upgrade comparisons apply one source to each modeled action at level 99, then choose the fastest supported result. Recipe context is retained. Conditional/scaled/from-context modifiers and unsupported rate modifiers are excluded from quantitative comparisons. The booster tables still show them. These are comparisons, not a globally optimized combined loadout or an assumption that a player has unlocked every source.

The empty-bank route considers only fully resolved gathering/artisan chains and assumes their source actions are unlocked. It excludes combat, shops and passive lifecycles. Hunting journal/trap failures, Agility techniques and passive Farming/Ranching lifecycles do not receive an invented sustained XP/s. Combat rates require a specified setup and target.

Verification: 25 guide renders; 1,287 all-level winner checks; 1,050 base-model and single-XP-bonus checks; mobile overflow checks; skill-page XP/Action Time categories; six stochastic comparisons.
