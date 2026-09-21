import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PreTrainedTokenizer } from '@huggingface/transformers';
import {
  BrowserController,
  buildLayaChoiceRequest,
  createBaselineController,
  mapChoiceLogits,
  selectCandidates,
  serializeObservation,
} from '../apps/web/src/ai';
import type { MatchObservation } from '../packages/combat-core/src/types';
import { CANDIDATE_ORDER, LAYA_CHOICE_INSTRUCTIONS } from '../apps/web/src/ai/candidates';
import { signatureActionIds } from '../packages/combat-core/src/signatures';

const observation = (overrides: Partial<MatchObservation> = {}): MatchObservation => ({
  version: 1,
  tick: 120,
  round: 1,
  phase: 'fight',
  timer: 3300,
  distanceMm: 900,
  history: ['light', 'retreat'],
  self: {
    health: 800, maxHealth: 1000, stamina: 70, maxStamina: 100, meter: 20, xMm: -450, yMm: 0, facing: 1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6550, special: 'special_veto',
  },
  opponent: {
    health: 760, maxHealth: 1000, stamina: 56, maxStamina: 100, meter: 30, xMm: 450, yMm: 0, facing: -1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6550, special: 'special_papers',
  },
  ...overrides,
});

describe('Laya typed-choice mapping', () => {
  it('maps logits to exactly the ordered legal candidates', () => {
    const result = mapChoiceLogits(new Float32Array([-3, 1, 4]), ['guard_high', 'light', 'low'], 1);
    expect(result.action).toBe('low');
    expect(Object.keys(result.scores)).toEqual(['guard_high', 'light', 'low']);
    expect(Object.values(result.scores).reduce((sum, score) => sum + score, 0)).toBeCloseTo(1, 8);
    expect(result.scores.low).toBeGreaterThan(result.scores.light);
  });

  it('rejects malformed logits and candidate counts instead of selecting an arbitrary action', () => {
    expect(() => mapChoiceLogits([1], ['light', 'low'], 1)).toThrow('returned 1 logits');
    expect(() => mapChoiceLogits([0, 1], ['light', 'low'], 0)).toThrow('temperature');
    expect(() => mapChoiceLogits([0], ['idle'], 1)).toThrow('Expected 2-16');
  });

  it('keeps neutral, guards, and basic spacing when a legal set needs pruning', () => {
    const candidates = selectCandidates([
      'light', 'body', 'heavy', 'low', 'overhead', 'anti_air', 'air_kick', 'throw', 'throw_break', 'parry',
      'special_veto', 'special_papers', 'dash_forward', 'dash_back', 'jump', 'guard_high', 'guard_low',
      'advance', 'retreat', 'crouch', 'idle',
    ]);
    expect(candidates.actions).toHaveLength(16);
    expect(candidates.actions.slice(0, 5)).toEqual(['idle', 'guard_high', 'guard_low', 'advance', 'retreat']);
    expect(candidates.pruned.length).toBe(5);
  });

  it('serializes only the allowed public observation fields', () => {
    const value = serializeObservation(observation());
    expect(value).toContain('SELF hp=80');
    expect(value).toContain('alt=0');
    expect(value).toContain('action=idle age=0 can=1');
    expect(value).toContain('sig=k=strike');
    expect(value).toContain('hist=light,retreat');
    expect(value).not.toContain('identity');
    const request = buildLayaChoiceRequest(observation(), ['idle', 'advance', 'light']);
    expect(request.question.type).toBe('choice');
    expect(request.candidates).toEqual(['idle', 'advance', 'light']);
  });

  it('maps a signature action exactly while keeping leader identifiers out of policy text', () => {
    const signature = 'signature_executive_order' as const;
    const signatureObservation = observation({
      history: [signature, 'light'],
      self: { ...observation().self, action: signature, special: signature },
      opponent: { ...observation().opponent, action: signature, special: signature },
    });
    const request = buildLayaChoiceRequest(signatureObservation, ['idle', 'light', signature]);

    expect(request.candidates).toEqual(['idle', signature, 'light']);
    expect(request.options.map((option) => option.id)).toEqual(['option_1', 'option_2', 'option_3']);
    expect(request.options.map((option) => option.action)).toEqual(request.candidates);
    expect(request.state).toContain('action=signature');
    expect(request.state).toContain('hist=signature,light');
    expect(request.state).not.toContain('executive_order');
    expect(JSON.stringify(request.question.criteria)).toContain('signature zone');
    expect(JSON.stringify(request.question.criteria)).not.toContain('executive_order');
    expect(mapChoiceLogits([0, 4, 1], request.candidates, 1).action).toBe(signature);
  });

  it('keeps every full legal request inside the 320-token graph with the shipped tokenizer', () => {
    const tokenizerRoot = new URL('../apps/web/public/models/laya/tokenizer/', import.meta.url);
    const tokenizer = new PreTrainedTokenizer(
      JSON.parse(readFileSync(new URL('tokenizer.json', tokenizerRoot), 'utf8')),
      JSON.parse(readFileSync(new URL('tokenizer_config.json', tokenizerRoot), 'utf8')),
    );
    const encode = (value: string) =>
      Array.from(tokenizer(value, { add_special_tokens: false }).input_ids.data, Number);
    const history = Array.from({ length: 8 }, () => 'dash_forward' as const);
    let largestRequest = 0;

    for (const signature of signatureActionIds) {
      const worstPublicState = observation({
        round: 3,
        timer: 3600,
        distanceMm: 8000,
        history,
        self: {
          ...observation().self,
          health: 1000, stamina: 100, meter: 100, xMm: -6500, yMm: 2000,
          grounded: false, action: signature, actionPhase: 'recovery', actionTick: 36,
          distanceToWallMm: 0, special: signature,
        },
        opponent: {
          ...observation().opponent,
          health: 1000, stamina: 100, meter: 100, xMm: 6500, yMm: 2000,
          grounded: false, action: signature, actionPhase: 'startup', actionTick: 36,
          distanceToWallMm: 0, special: signature,
        },
      });
      const request = buildLayaChoiceRequest(worstPublicState, [...CANDIDATE_ORDER, signature]);
      const optionLengths = request.options.map(({ id, criterion }) => encode(` ${id}: ${criterion}`).length);
      const prefixLength = 1
        + encode(`choice question: ${LAYA_CHOICE_INSTRUCTIONS}`).length
        + 1
        + optionLengths.reduce((sum, length) => sum + length + 1, 0)
        + 1;
      const used = prefixLength + encode(request.state).length + 1;
      largestRequest = Math.max(largestRequest, used);

      expect(request.options).toHaveLength(16);
      expect(Math.max(...optionLengths)).toBeLessThanOrEqual(48);
      expect(used).toBeLessThanOrEqual(320);
    }
    // The full graph uses 311 at the current worst case, leaving 9 tokens.
    expect(largestRequest).toBeLessThanOrEqual(311);
  });
});

describe('explicit local baseline', () => {
  it('uses public distance and visible startup rather than a fixed action', async () => {
    const controller = createBaselineController('standard');
    await controller.load(() => undefined);
    const distant = await controller.decide(observation({ distanceMm: 1500 }), ['idle', 'advance', 'dash_forward']);
    expect(distant.source).toBe('baseline');
    expect(distant.action).toBe('advance');
    expect(distant.scores).toBeUndefined();

    const threatened = observation({
      distanceMm: 500,
      opponent: { ...observation().opponent, action: 'low', actionPhase: 'startup' },
    });
    const defence = await controller.decide(threatened, ['idle', 'guard_high', 'guard_low', 'retreat']);
    expect(defence.action).toBe('guard_low');
  });
});

describe('unpublished Laya browser artifact', () => {
  it('reports unavailable instead of relabelling baseline output as Laya', async () => {
    const controller = new BrowserController({ artifact: null });
    await expect(controller.load(() => undefined)).rejects.toMatchObject({ code: 'no-browser-artifact' });
    expect(controller.source).toBe('laya');
    expect(controller.checkpoint.ready).toBe(false);
  });
});
