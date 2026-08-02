import { describe, it, expect } from 'vitest';
import { parseAbilityDescription, parseAbilityDescriptionWithReport } from '@/creature-builder/logic/abilityScaling';

const report = (html: string, level = 8) => parseAbilityDescriptionWithReport(html, level);

describe('accounting for every inline element', () => {
  it('maps scaled values back to the macro they came from', () => {
    const { scalableValues, inlines } = report(
      '<p>Deals @Damage[2d6[fire],1d4[persistent,fire]] damage with a @Check[reflex|dc:24|basic] save.</p>'
    );
    expect(inlines).toHaveLength(2);
    const [damage, check] = inlines;
    expect(damage).toMatchObject({ kind: 'damage', disposition: 'scaled', leftover: [] });
    expect(damage.values.map((i) => scalableValues[i].type)).toEqual(['damage', 'persistent']);
    expect(check).toMatchObject({
      kind: 'check', disposition: 'scaled', statistic: 'reflex', dc: 24, basic: true
    });
    expect(check.values.map((i) => scalableValues[i].originalValue)).toEqual(['24']);
  });

  it('reports entries in description order', () => {
    const { inlines } = report(
      '<p>@Check[will|dc:20] then @Damage[2d6[fire]] then @Check[flat|dc:5].</p>'
    );
    expect(inlines.map((e) => e.kind)).toEqual(['check', 'damage', 'check']);
  });

  it('ties prose-parsed values to no inline entry', () => {
    const { scalableValues, inlines } = report('<p>Deals an additional 1d6 fire damage.</p>');
    expect(scalableValues).toHaveLength(1);
    expect(inlines).toHaveLength(0);
  });
});

describe('deliberate skips carry their reason', () => {
  it('flat checks', () => {
    const [entry] = report('<p>@Check[flat|dc:11]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'skipped', reason: 'flat-check', statistic: 'flat', dc: 11 });
  });

  it('derived DCs', () => {
    const [entry] = report('<p>@Check[hurl-net|against:ac]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'skipped', reason: 'derived-dc', statistic: 'hurl-net' });
    expect(entry.dc).toBeUndefined();
  });

  it('externally-supplied DCs', () => {
    const [entry] = report('<p>@Check[will|dc:0]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'skipped', reason: 'external-dc', dc: 0 });
  });

  it('self-scaling @-expression damage', () => {
    const [entry] = report('<p>@Damage[(@item.badge.value)d6[fire]]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'skipped', reason: 'self-scaling' });
    expect(entry.leftover).toHaveLength(1);
  });

  it('compound sums the extractor refuses to mangle', () => {
    const [entry] = report('<p>@Damage[(2d6 + 4 + (2d6[precision]))[slashing]]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'skipped', reason: 'compound-formula' });
    expect(entry.leftover).toHaveLength(1);
  });

  it('a partially-scaled macro is scaled, with the leftovers listed', () => {
    const { scalableValues, inlines } = report('<p>@Damage[2d6[fire],(1d4 + (1d4[precision]))[void]]</p>');
    const [entry] = inlines;
    expect(entry.disposition).toBe('scaled');
    expect(entry.values.map((i) => scalableValues[i].originalValue)).toEqual(['2d6']);
    expect(entry.leftover).toHaveLength(1);
  });

  it('an evaluated level-derived count is scaled, not skipped', () => {
    const { scalableValues, inlines } = report('<p>@Damage[(floor(1 + @actor.level/2))d6[void]]</p>', 8);
    const [entry] = inlines;
    expect(entry.disposition).toBe('scaled');
    expect(scalableValues[entry.values[0]].originalValue).toBe('5d6');
  });
});

describe('malformed elements are data defects, verbatim', () => {
  it('a non-flat check with no DC source', () => {
    const [entry] = report('<p>@Check[reflex|basic]</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'malformed', reason: 'no-dc', statistic: 'reflex', basic: true });
  });

  it('a macro with no payload', () => {
    const { inlines } = report('<p>Deals @Damage damage.</p>');
    expect(inlines).toEqual([
      expect.objectContaining({ kind: 'damage', disposition: 'malformed', reason: 'missing-payload' })
    ]);
  });

  it('an empty payload', () => {
    const kinds = report('<p>@Damage[] and @Check[]</p>').inlines;
    expect(kinds.map((e) => [e.kind, e.disposition, e.reason])).toEqual([
      ['damage', 'malformed', 'missing-payload'],
      ['check', 'malformed', 'missing-payload']
    ]);
  });

  it('an unclosed bracket', () => {
    const [entry] = report('<p>@Damage[2d6[fire] damage.</p>').inlines;
    expect(entry).toMatchObject({ disposition: 'malformed', reason: 'unclosed-bracket' });
  });

  it('never double-reports a healthy macro', () => {
    const { inlines } = report('<p>@Damage[2d6[fire]] and @Damage[2d6[cold]]</p>');
    expect(inlines).toHaveLength(2);
    expect(inlines.every((e) => e.disposition === 'scaled')).toBe(true);
  });
});

describe('the report does not perturb parsing', () => {
  it('returns the same template and values as the plain parse', () => {
    const html = '<p>The troop deals @Damage[2d6[fire],1d4[persistent,fire]] damage '
      + '(@Check[reflex|dc:24|basic] save) plus 1d6 sonic damage, DC 22.</p>';
    const plain = parseAbilityDescriptionWithReport(html, 8);
    const bare = parseAbilityDescription(html, 8);
    expect(plain.template).toBe(bare.template);
    expect(plain.scalableValues).toEqual(bare.scalableValues);
  });
});
