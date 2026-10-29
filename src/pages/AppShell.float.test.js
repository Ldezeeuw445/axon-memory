import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contract checks for the galaxy float shell — read source so we do not
 * mount React/R3F in vitest (no jsdom). Guarantees the no-panel direction
 * stays wired: transparent stage, float host, soft parallax, Core peek.
 */
describe('AppShell galaxy float shell (source contract)', () => {
  const shell = readFileSync(resolve('src/pages/AppShell.jsx'), 'utf8');
  const scene = readFileSync(resolve('src/pages/AppScene.jsx'), 'utf8');
  const gateway = readFileSync(resolve('src/components/CoreGateway.jsx'), 'utf8');
  const facetsCss = readFileSync(resolve('src/styles/facets.css'), 'utf8');

  it('does not wrap facets in FragmentPanel', () => {
    expect(shell).not.toMatch(/<FragmentPanel[\s>]/);
    expect(shell).toMatch(/ax-float-stage/);
    expect(shell).toMatch(/ax-facet-host--float/);
  });

  it('keeps a soft parallax map for section camera nudges', () => {
    expect(shell).toMatch(/PARALLAX\s*=/);
    expect(shell).toMatch(/parallax=\{parallax\}/);
    expect(shell).toMatch(/PARALLAX\[facet\]/);
  });

  it('keeps Core always mounted and uses FAR peek (not full dive hide)', () => {
    expect(scene).toMatch(/coreBuilt/);
    expect(scene).toMatch(/useState\(true\)/);
    expect(gateway).toMatch(/const FAR/);
    expect(gateway).toMatch(/reduceMotion/);
  });

  it('styles float cards with dark glass + iOS no-blur fallback', () => {
    expect(facetsCss).toMatch(/ax-float-stage/);
    expect(facetsCss).toMatch(/ax-facet-host--float/);
    expect(facetsCss).toMatch(/@supports not/);
    expect(facetsCss).toMatch(/rgba\(10,\s*12,\s*16/);
    expect(facetsCss).toMatch(/\.ax-float-stage\s*\{[^}]*background:\s*transparent/s);
  });
});
