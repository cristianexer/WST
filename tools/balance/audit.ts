/** Run with esbuild --bundle --platform=node, then node; no browser/model required. */
import { createMatch, fighterProfiles, getObservation, legalActions, moves, signatureForCharacter, stepMatch } from '../../packages/combat-core/src';
import type { ActionId, MatchState } from '../../packages/combat-core/src';
import { CombatDirector } from '../../apps/web/src/ai/combat-director';

const ids = Object.keys(fighterProfiles);
const results = Object.fromEntries(ids.map(id => [id, { games: 0, wins: 0, draws: 0, remainingHealth: 0 }]));
const scenarios = ['ordinary', 'signatures'] as const;
const reports: unknown[] = [];
for (const scenario of scenarios) {
  for (const row of Object.values(results)) Object.assign(row, { games: 0, wins: 0, draws: 0, remainingHealth: 0 });
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    for (let swapped = 0; swapped < 2; swapped++) {
      const fighters: [string, string] = swapped ? [ids[b], ids[a]] : [ids[a], ids[b]];
      const seed = 0x57435444 + a * 29 + b;
      let state = createMatch({ seed, fighters, specials: scenario === 'signatures'
        ? [signatureForCharacter(fighters[0]).id, signatureForCharacter(fighters[1]).id]
        : ['special_papers', 'special_papers'] });
      while (state.phase === 'ready') state = stepMatch(state, ['idle', 'idle']);
      const brains = [new CombatDirector('standard', seed), new CombatDirector('standard', seed)] as const;
      const snapshots: MatchState[] = [state];
      const inputs: [ActionId, ActionId] = ['idle', 'idle'];
      // A bounded exchange isolates pressure, durability and resource trade-offs.
      for (let tick = 0; tick < 720 && state.phase === 'fight'; tick++) {
        const delayed = snapshots.at(-13);
        if (tick % 4 === 0 && delayed && !state.hitstop) {
          for (const i of [0, 1] as const) {
            const legal = legalActions(delayed, i).filter(action => legalActions(state, i).includes(action));
            if (legal.length > 1) inputs[i] = brains[i].choose(getObservation(delayed, i), legal).action;
          }
        }
        state = stepMatch(state, inputs);
        for (const i of [0, 1] as const) if (!moves[inputs[i]].held) inputs[i] = 'idle';
        snapshots.push(state); if (snapshots.length > 16) snapshots.shift();
      }
      const health = state.fighters.map(fighter => fighter.health / fighter.maxHealth);
      const draw = Math.abs(health[0] - health[1]) < .01;
      for (const i of [0, 1] as const) {
        const row = results[fighters[i]];
        row.games++; row.remainingHealth += health[i];
        if (draw) row.draws++; else if (health[i] > health[1 - i]) row.wins++;
      }
    }
  }
  reports.push({ scenario, fighters: Object.entries(results).map(([id, row]) => ({ id, games: row.games, wins: row.wins, draws: row.draws,
    winShare: +((row.wins + row.draws / 2) / row.games).toFixed(3), meanHealth: +(row.remainingHealth / row.games).toFixed(3) })) });
}
console.log(JSON.stringify({ scope: 'Side-swapped 12-second public-state controller exchanges. Diagnostic, not proof of competitive balance.', reports }, null, 2));
