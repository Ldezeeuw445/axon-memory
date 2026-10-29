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

  it('renders multi-layer stars + nebula veil with mobile DPR cap', () => {
    expect(scene).toMatch(/NebulaVeil/);
    expect(scene).toMatch(/Stars radius=\{140\}/);
    expect(scene).toMatch(/Stars radius=\{95\}/);
    expect(scene).toMatch(/Stars radius=\{55\}/);
    expect(scene).toMatch(/mobileCap\s*=\s*1\.15/);
    expect(scene).toMatch(/isMobile \? mobileCap/);
  });

  it('keeps rim/key lights around the Core sphere', () => {
    expect(scene).toMatch(/spotLight/);
    expect(scene).toMatch(/pointLight/);
    expect(scene).toMatch(/#dfe9ff|#a8c4ff|#ffc878/);
  });

  it('styles idle float + brand tiles + depth shadows', () => {
    expect(facetsCss).toMatch(/ax-float-card--idle/);
    expect(facetsCss).toMatch(/@keyframes ax-card-float/);
    expect(facetsCss).toMatch(/ax-brand-tile/);
    expect(facetsCss).toMatch(/--float-i/);
  });

  it('FloatCard arms drag after long-press or horizontal move and snaps back', () => {
    const float = readFileSync(resolve('src/components/FloatCard.jsx'), 'utf8');
    expect(float).toMatch(/dragSnapToOrigin/);
    expect(float).toMatch(/armDrag/);
    expect(float).toMatch(/240/);
    expect(float).toMatch(/dragListener=\{false\}/);
    expect(float).toMatch(/ax-float-card--idle/);
  });

  it('ConnectFacet uses FloatCard + brand tiles when floatLayout', () => {
    const connect = readFileSync(resolve('src/pages/facets/ConnectFacet.jsx'), 'utf8');
    expect(connect).toMatch(/import FloatCard/);
    expect(connect).toMatch(/ax-brand-tile/);
    expect(connect).toMatch(/draggable:\s*true/);
    expect(connect).toMatch(/data-no-drag/);
  });

  it('terrain stage crossfades with soft scale/blur', () => {
    expect(shell).toMatch(/ax-terrain-stage/);
    expect(shell).toMatch(/blur\(6px\)/);
    expect(shell).toMatch(/scale\(1\.035\)/);
  });
});
