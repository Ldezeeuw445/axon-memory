import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshTransmissionMaterial, Float } from '@react-three/drei';

// Blue is a signal, not a surface. It exists for the moment a connection lands
// and decays straight back to these neutral resting tones.
const PULSE_BLUE = new THREE.Color('#1f7cff');
const REST_EMISSIVE = new THREE.Color('#6d7f96');
const REST_LIGHT = new THREE.Color('#c8d4e2');
const REST_WIRE = new THREE.Color('#6f93c4');

export default function AxonCore({ stage = 2, injectionPulseTime = 0, experiencePulseTime = 0, opening = false, apertureRef = null }) {
  const groupRef = useRef();
  const mountTime = useRef(null);
  const innerCoreMaterialRef = useRef();
  const innerSkinMaterialRef = useRef();
  const wiresMaterialRef = useRef();
  const lightRef = useRef();
  const cavityWireMaterialRef = useRef();
  const cavitySolidMaterialRef = useRef();
  const goldLightMaterialRef = useRef();
  const occluderRef = useRef();
  const flashTime = useRef(0);
  const flashStart = useRef(0);
  const extractionTime = useRef(0);
  
  // Track animation progress (0 = closed/far, 1 = open/near)
  const currentProgress = useRef(0);
  const currentZ = useRef(-40);

  // Pre-calculate the perfectly closed state (base) and the open/fractured state (target)
  const { 
    outerGeometry, innerDataGeometry, wiresGeometry,
    cavityGeometry, goldLightGeometry, panelSideGeometry,
    basePositions, targetPositions,
    baseInnerPositions, targetInnerPositions,
    wireLinks, hatchCentroids, count, aperturePlates
  } = useMemo(() => {
    // Detail 2 -> 3: ~4x the faces, reads as a genuinely faceted crystal up
    // close instead of a low-poly ball with a few dozen visible triangles.
    const baseGeo = new THREE.IcosahedronGeometry(2, 3);
    const nonIndexedGeo = baseGeo.toNonIndexed();
    
    const positions = nonIndexedGeo.attributes.position.array;
    const count = nonIndexedGeo.attributes.position.count;
    
    const basePositionsArr = new Float32Array(count * 3);
    const targetPositionsArr = new Float32Array(count * 3);
    
    const baseInnerPositionsArr = new Float32Array(count * 3);
    const targetInnerPositionsArr = new Float32Array(count * 3);
    
    const links = [];

    for (let i = 0; i < count; i += 3) {
      const v1 = new THREE.Vector3().fromArray(positions, i * 3);
      const v2 = new THREE.Vector3().fromArray(positions, (i+1) * 3);
      const v3 = new THREE.Vector3().fromArray(positions, (i+2) * 3);
      
      v1.toArray(basePositionsArr, i * 3);
      v2.toArray(basePositionsArr, (i+1) * 3);
      v3.toArray(basePositionsArr, (i+2) * 3);

      // The inner face is both deeper and slightly smaller, so the flank leans
      // inward the way a cut facet does rather than standing straight up like
      // an extrusion.
      const inset = 0.972;
      const taper = 0.93;
      const faceC = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);
      v1.clone().lerp(faceC, 1 - taper).multiplyScalar(inset).toArray(baseInnerPositionsArr, i * 3);
      v2.clone().lerp(faceC, 1 - taper).multiplyScalar(inset).toArray(baseInnerPositionsArr, (i+1) * 3);
      v3.clone().lerp(faceC, 1 - taper).multiplyScalar(inset).toArray(baseInnerPositionsArr, (i+2) * 3);

      const centroid = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);

      // No per-region factor here on purpose: this used to shrink every face
      // on the back half (centroid.z < -1) to 0.85, which is a big share of
      // the shell, not an opening — it read as a caved-in patch that rotated
      // into view every time the Core turned, breaking the round silhouette.
      // The three actual openings are built explicitly below (cavityPosArr,
      // faces 1-3 only); every other face is meant to simply rise evenly.
      const factor = 1;

      // Was +/-12.5% per face, which let one side of the shell gape while
      // another barely parted. A narrow spread keeps the lift even, so the
      // three cavities are the only real openings and everything else simply
      // rises.
      const LIFT = 1.13;   // how far every panel travels outward
      const SPREAD = 0.05; // how much that varies between neighbours
      const noise = LIFT + (Math.random() - 0.5) * SPREAD; 
      const finalCentroid = centroid.clone().multiplyScalar(noise * factor);
      const offset = finalCentroid.clone().sub(centroid);
      
      const shrinkFactor = 0.96; 
      const t1 = v1.clone().lerp(centroid, 1 - shrinkFactor).add(offset);
      const t2 = v2.clone().lerp(centroid, 1 - shrinkFactor).add(offset);
      const t3 = v3.clone().lerp(centroid, 1 - shrinkFactor).add(offset);
      
      const tiltAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      const tiltAngle = (Math.random() - 0.5) * 0.08; 
      
      t1.sub(finalCentroid).applyAxisAngle(tiltAxis, tiltAngle).add(finalCentroid);
      t2.sub(finalCentroid).applyAxisAngle(tiltAxis, tiltAngle).add(finalCentroid);
      t3.sub(finalCentroid).applyAxisAngle(tiltAxis, tiltAngle).add(finalCentroid);

      t1.toArray(targetPositionsArr, i * 3);
      t2.toArray(targetPositionsArr, (i+1) * 3);
      t3.toArray(targetPositionsArr, (i+2) * 3);
      
      t1.clone().multiplyScalar(inset).toArray(targetInnerPositionsArr, i * 3);
      t2.clone().multiplyScalar(inset).toArray(targetInnerPositionsArr, (i+1) * 3);
      t3.clone().multiplyScalar(inset).toArray(targetInnerPositionsArr, (i+2) * 3);

      if (noise * factor > 1.06) {
        const coreAttach1 = v1.clone().normalize().multiplyScalar(1.8);
        const coreAttach2 = v2.clone().normalize().multiplyScalar(1.8);
        const coreAttach3 = v3.clone().normalize().multiplyScalar(1.8);
        
        // Tether only the faces that actually move: the extracted shard (0)
        // and the three sliding plates (1-3). Previously a wire was added to
        // roughly four out of five faces on the entire shell at random, so the
        // strands read as decoration that happened to land well rather than as
        // the thing holding a moving plate to the core.
        if (i < 12) {
          links.push({ plateVertexIndex: i, corePoint: coreAttach1 });
          links.push({ plateVertexIndex: i + 1, corePoint: coreAttach2 });
          links.push({ plateVertexIndex: i + 2, corePoint: coreAttach3 });
        }
      }
    }
    
    // The six plates that open the passage.
    //
    // They are not new geometry — they are the six existing faces whose
    // centroids sit closest to local +Z, which is the side the camera looks at.
    // Choosing them by direction rather than by index means the opening is a
    // contiguous patch of the shell, so when they leave, what remains reads as
    // a hole in the Core rather than six unrelated triangles going missing.
    const plateCount = Math.floor(count / 3);
    const axis = new THREE.Vector3(0, 0, 1);
    const byAlignment = [];
    for (let plate = 0; plate < plateCount; plate++) {
      const i = plate * 3;
      const c = new THREE.Vector3(
        (basePositionsArr[i * 3] + basePositionsArr[(i + 1) * 3] + basePositionsArr[(i + 2) * 3]) / 3,
        (basePositionsArr[i * 3 + 1] + basePositionsArr[(i + 1) * 3 + 1] + basePositionsArr[(i + 2) * 3 + 1]) / 3,
        (basePositionsArr[i * 3 + 2] + basePositionsArr[(i + 1) * 3 + 2] + basePositionsArr[(i + 2) * 3 + 2]) / 3,
      );
      byAlignment.push({ plate, dot: c.clone().normalize().dot(axis), centroid: c });
    }
    byAlignment.sort((a, b) => b.dot - a.dot);

    // Order is deliberately not the same as adjacency: the release reads as
    // mechanical rather than as a ripple because neighbours do not follow each
    // other in sequence.
    const chosen = byAlignment.slice(0, 6);
    const releaseOrder = [0, 3, 1, 5, 2, 4];
    const apertureMap = new Map();
    chosen.forEach((c, n) => {
      apertureMap.set(c.plate, {
        order: releaseOrder[n],
        dir: c.centroid.clone().normalize(),
        centroid: c.centroid,
        spin: (n % 2 === 0 ? 1 : -1) * (0.10 + (n % 3) * 0.045),
      });
    });

    const outGeo = new THREE.BufferGeometry();
    outGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(basePositionsArr), 3));
    
    const inGeo = new THREE.BufferGeometry();
    inGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(baseInnerPositionsArr), 3));
    
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(links.length * 6), 3));
    
    // Calculate centroids for plates 1, 2, 3 to shrink them later
    const centroids = [];
    for (let i = 0; i < 4; i++) centroids.push(new THREE.Vector3());
    for (let p = 1; p < 4; p++) {
      let idx = p * 9;
      let cx = (basePositionsArr[idx] + basePositionsArr[idx+3] + basePositionsArr[idx+6]) / 3;
      let cy = (basePositionsArr[idx+1] + basePositionsArr[idx+4] + basePositionsArr[idx+7]) / 3;
      let cz = (basePositionsArr[idx+2] + basePositionsArr[idx+5] + basePositionsArr[idx+8]) / 3;
      centroids[p].set(cx, cy, cz);
    }
    // 3D Cavity Geometry (walls for the holes of plates 1, 2, 3)
    //
    // Each cavity used to be three flat triangles running to a single needle
    // point — a funnel, which is why the holes read as simple cut-outs. A real
    // recess has a chamfer where it breaks the surface, walls that step inward,
    // and a floor. Building it as concentric rings gives the light something to
    // catch at every depth instead of one uninterrupted slope.
    const cavityPosArr = [];

    // Each ring: how far its vertices are pulled toward the face centroid, and
    // how deep it sits. The first band is deliberately narrow — that tight
    // chamfer at the rim is what reads as a cut edge rather than a hole.
    const RINGS = [
      { inset: 0.0,  depth: 1.0   },
      { inset: 0.13, depth: 0.965 },
      { inset: 0.42, depth: 0.9   },
      { inset: 0.66, depth: 0.82  },
      { inset: 0.82, depth: 0.765 },
    ];

    for (let p = 1; p < 4; p++) {
      let idx = p * 9;
      const v = [
        new THREE.Vector3(basePositionsArr[idx], basePositionsArr[idx+1], basePositionsArr[idx+2]),
        new THREE.Vector3(basePositionsArr[idx+3], basePositionsArr[idx+4], basePositionsArr[idx+5]),
        new THREE.Vector3(basePositionsArr[idx+6], basePositionsArr[idx+7], basePositionsArr[idx+8]),
      ];
      const c = new THREE.Vector3().addVectors(v[0], v[1]).add(v[2]).divideScalar(3);

      const ringVerts = RINGS.map(({ inset, depth }) =>
        v.map((corner) => c.clone().lerp(corner, 1 - inset).multiplyScalar(depth))
      );

      // Wall bands between consecutive rings, two triangles per side.
      for (let r = 0; r < ringVerts.length - 1; r++) {
        const a = ringVerts[r];
        const b = ringVerts[r + 1];
        for (let e = 0; e < 3; e++) {
          const n = (e + 1) % 3;
          cavityPosArr.push(a[e].x, a[e].y, a[e].z, a[n].x, a[n].y, a[n].z, b[e].x, b[e].y, b[e].z);
          cavityPosArr.push(a[n].x, a[n].y, a[n].z, b[n].x, b[n].y, b[n].z, b[e].x, b[e].y, b[e].z);
        }
      }

      // Flat floor, so the cavity bottoms out instead of tapering to a point.
      const f = ringVerts[ringVerts.length - 1];
      cavityPosArr.push(f[0].x, f[0].y, f[0].z, f[1].x, f[1].y, f[1].z, f[2].x, f[2].y, f[2].z);
    }
    const cavGeo = new THREE.BufferGeometry();
    cavGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cavityPosArr), 3));
    cavGeo.computeVertexNormals();

    // Gold light panel (only plate 1) at the bottom of its cavity
    const lightPosArr = [];
    {
      let idx = 9; // Plate 1
      let v0 = new THREE.Vector3(basePositionsArr[idx], basePositionsArr[idx+1], basePositionsArr[idx+2]);
      let v1 = new THREE.Vector3(basePositionsArr[idx+3], basePositionsArr[idx+4], basePositionsArr[idx+5]);
      let v2 = new THREE.Vector3(basePositionsArr[idx+6], basePositionsArr[idx+7], basePositionsArr[idx+8]);
      let c = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
      
      // A tiny triangle at the bottom of the cavity
      let d = c.clone().multiplyScalar(0.74); // Slightly deeper than cavity floor
      let shrinkV0 = d.clone().add(v0.clone().sub(d).multiplyScalar(0.2));
      let shrinkV1 = d.clone().add(v1.clone().sub(d).multiplyScalar(0.2));
      let shrinkV2 = d.clone().add(v2.clone().sub(d).multiplyScalar(0.2));
      
      lightPosArr.push(shrinkV0.x, shrinkV0.y, shrinkV0.z, shrinkV1.x, shrinkV1.y, shrinkV1.z, shrinkV2.x, shrinkV2.y, shrinkV2.z);
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lightPosArr), 3));
    lGeo.computeVertexNormals();

    // Side walls for the three sliding plates. A plate is a single face of the
    // outer shell, so as it travels outward it shows its own zero thickness —
    // a triangle cut from paper. These quads bridge each plate edge back to the
    // opening it left behind, so the plate reads as a milled block being pushed
    // out of the body rather than a decal sliding across it.
    // Filled per frame in the morph loop; three plates, three edges, two
    // triangles each.
    // Sides for every panel, not just the three that open into cavities.
    //
    // The whole shell lifts outward as the Core approaches, but each panel was
    // a single triangle — so the widening gaps showed nothing behind them, and
    // 180 paper-thin shards drifting apart reads as floating rather than as
    // something being pushed out. Each panel already has an inner face at 0.98
    // that travels with it; these quads close the edge between the two, so a
    // panel becomes a slab with a visible flank.
    const sideVerts = (count / 3) * 3 * 2 * 3;
    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sideVerts * 3), 3));
    
    return { 
      outerGeometry: outGeo, 
      innerDataGeometry: inGeo, 
      wiresGeometry: wGeo,
      cavityGeometry: cavGeo,
      panelSideGeometry: sideGeo,
      goldLightGeometry: lGeo,
      basePositions: basePositionsArr, 
      targetPositions: targetPositionsArr,
      baseInnerPositions: baseInnerPositionsArr, 
      targetInnerPositions: targetInnerPositionsArr,
      wireLinks: links,
      aperturePlates: apertureMap,
      hatchCentroids: centroids,
      count
    };
  }, []);

  useFrame((state, delta) => {
    // Read per frame from a ref rather than taken as a prop: this changes every
    // frame of the release, and as state it re-rendered the whole scene tree
    // sixty times a second.
    const aperture = apertureRef?.current ?? 0;
    if (mountTime.current === null) mountTime.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - mountTime.current;
    
    // Wacht tot de tekst klaar is (rond 4.5 seconden) voordat de beweging start
    const movementElapsed = Math.max(0, elapsed - 4.5);
    
    // De beweging vooruit duurt nu 8 seconden (volledig rustig)
    const timeline = Math.min(movementElapsed / 8.0, 1.0);
    
    // 1. Z-positie: easeInOutCubic curve
    // Dit zorgt ervoor dat hij begint met een snelheid van 0 (geen plotselinge schok), 
    // versnelt in het midden, en weer zachtjes afremt tot 0 aan het einde.
    const easeZ = timeline < 0.5 
      ? 4 * timeline * timeline * timeline 
      : 1 - Math.pow(-2 * timeline + 2, 3) / 2;
      
    groupRef.current.position.z = THREE.MathUtils.lerp(-30, 0, easeZ);
    
    // 2. Open Progress: Platen beginnen pas open te schuiven als hij al flink onderweg is
    const openTimeline = Math.max(0, (timeline - 0.4) * (1 / 0.6)); 
    const progress = 1 - Math.pow(1 - openTimeline, 3); // easeOutCubic

    // Update Cavity Opacity based on progress
    if (cavityWireMaterialRef.current) cavityWireMaterialRef.current.opacity = progress * 0.32;
    if (cavitySolidMaterialRef.current) cavitySolidMaterialRef.current.opacity = progress;
    if (goldLightMaterialRef.current) goldLightMaterialRef.current.opacity = progress * 0.9;

    if (groupRef.current) {
      // Frozen while a facet is opening: CorePortal turns the outer shell so
      // the release point faces the camera, and this inner ambient spin
      // would otherwise keep carrying that point away from camera again
      // right after, fighting the very turn CorePortal just made.
      if (!opening && aperture <= 0) {
        groupRef.current.rotation.y += 0.0008;
        groupRef.current.rotation.x += 0.0004;
      } else if (aperture > 0) {
        // The plates were chosen around local +Z, so returning the shell to its
        // unrotated orientation is what turns the opening to face the camera.
        // Eased per-frame rather than set: a massive object settling, not a
        // value snapping. The drift it has accumulated since load is exactly
        // what it now has to undo, so the turn is different every time.
        const k = 1 - Math.pow(0.06, delta);
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, k);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, k);
        groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, k);
      }

      if (occluderRef.current) {
        // Held at full size until the plates are well clear, then pulled in
        // over the stretch where the camera is actually approaching.
        const open = THREE.MathUtils.clamp((aperture - 0.55) / 0.45, 0, 1);
        const shrink = 1 - open * 0.995;
        occluderRef.current.scale.setScalar(shrink);
      }

      if (timeline >= 1.0) {
        const breath = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.015;
        groupRef.current.scale.set(breath, breath, breath);
      }
    }
    
    // Core Pulse on Connection — driven by the Experience AXON press.
    if (experiencePulseTime > 0 && innerCoreMaterialRef.current && lightRef.current) {
      if (flashTime.current !== experiencePulseTime) {
        flashTime.current = experiencePulseTime;
        flashStart.current = state.clock.elapsedTime;
      }
      const flashElapsed = state.clock.elapsedTime - flashStart.current;
      const flashProgress = Math.min(flashElapsed / 2.0, 1.0);
      
      innerCoreMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(9.0, 0.5, Math.pow(flashProgress, 0.5));
      lightRef.current.intensity = THREE.MathUtils.lerp(34.0, 3.0, Math.pow(flashProgress, 0.5));

      // Blue belongs here and nowhere else. Desaturating the Core to stop it
      // reading as blue plastic also drained this flash, which is the one
      // moment the colour is supposed to appear — it fires on connection,
      // reflects through the glass and briefly tints the drifting particles.
      // So the pulse starts saturated and decays back to the neutral resting
      // tone rather than living there.
      innerCoreMaterialRef.current.emissive.copy(PULSE_BLUE).lerp(REST_EMISSIVE, Math.pow(flashProgress, 1.15));
      lightRef.current.color.copy(PULSE_BLUE).lerp(REST_LIGHT, Math.pow(flashProgress, 1.15));

      if (wiresMaterialRef.current) {
        wiresMaterialRef.current.color.copy(PULSE_BLUE).lerp(REST_WIRE, Math.pow(flashProgress, 1.15));
      }
      if (wiresMaterialRef.current) {
        wiresMaterialRef.current.opacity = THREE.MathUtils.lerp(1.0, 0.4, Math.pow(flashProgress, 0.5));
      }
      if (innerSkinMaterialRef.current) {
        innerSkinMaterialRef.current.opacity = THREE.MathUtils.lerp(0.8, 0.15, Math.pow(flashProgress, 0.5));
      }
    }

    // Shockwave Pulse on Injection
    if (injectionPulseTime > 0 && wiresMaterialRef.current && innerCoreMaterialRef.current && lightRef.current) {
      const pElapsed = state.clock.elapsedTime - injectionPulseTime;
      // It takes about 0.2s for the shockwave to hit the core from the UI
      if (pElapsed > 0.2 && pElapsed < 1.5) {
        const pProgress = (pElapsed - 0.2) / 1.3;
        // Flash gold (opacity up to 1, then down to 0.4)
        const peak = 1 - Math.pow(Math.abs((pProgress * 2) - 1), 3); 
        wiresMaterialRef.current.opacity = 0.4 + (peak * 0.8);
        wiresMaterialRef.current.color.setHex(0xC4D63C); // Gold/Yellow
        innerCoreMaterialRef.current.emissive.setHex(0xC4D63C);
        lightRef.current.color.setHex(0xC4D63C);
        lightRef.current.intensity = 3 + (peak * 20);
      } else {
        wiresMaterialRef.current.opacity = 0.4;
        wiresMaterialRef.current.color.setHex(0x6f93c4);
        innerCoreMaterialRef.current.emissive.setHex(0x4d7ab8);
        if (lightRef.current) {
          lightRef.current.color.setHex(0x00aaff);
          lightRef.current.intensity = stage >= 2 ? 3 : 0;
        }
      }
    }

    // Extraction Shard Logic (Stage 4)
    let shardEase = 0;
    if (stage >= 4) {
      if (extractionTime.current === 0) extractionTime.current = state.clock.elapsedTime;
      const exElapsed = state.clock.elapsedTime - extractionTime.current;
      const shardProgress = Math.min(exElapsed / 1.5, 1.0);
      shardEase = 1 - Math.pow(1 - shardProgress, 3); // easeOutCubic
    }

    const outPos = outerGeometry.attributes.position.array;
    const inPos = innerDataGeometry.attributes.position.array;
    
    // Calculate centroid of face 0 for the shard movement
    const cX = (targetPositions[0] + targetPositions[3] + targetPositions[6]) / 3;
    const cY = (targetPositions[1] + targetPositions[4] + targetPositions[7]) / 3;
    const cZ = (targetPositions[2] + targetPositions[5] + targetPositions[8]) / 3;
    
    // Target position for the shard (towards right side of screen)
    const destX = 3.5;
    const destY = 0;
    const destZ = 8.5; // very close to camera
    
    const moveX = (destX - cX) * shardEase;
    const moveY = (destY - cY) * shardEase;
    const moveZ = (destZ - cZ) * shardEase;
    const scaleShard = 1 + (shardEase * 2.5); // Grow 3.5x as it approaches
    
    for (let i = 0; i < count * 3; i++) {
      let bP = basePositions[i];
      let tP = targetPositions[i];
      let biP = baseInnerPositions[i];
      let tiP = targetInnerPositions[i];
      
      let p = THREE.MathUtils.lerp(bP, tP, progress);
      let pIn = THREE.MathUtils.lerp(biP, tiP, progress);
      
      let plateIdx = Math.floor(i / 9);

      // Plates 1, 2, 3 slide open as 3D cavities during the landing animation (progress 0 -> 1)
      if (plateIdx >= 1 && plateIdx <= 3) {
        let isX = i % 3 === 0;
        let isY = i % 3 === 1;
        let isZ = i % 3 === 2;
        let cVal = isX ? hatchCentroids[plateIdx].x : (isY ? hatchCentroids[plateIdx].y : hatchCentroids[plateIdx].z);
        
        // As progress goes 0 -> 1, the plates shrink and sink to form the 3D cavity
        // Neither a fifth left hanging nor gone altogether. The plate keeps
        // almost its full size and is pressed down into the recess, so it is
        // still there to see just below the rim — a panel pushed inward, lit
        // from the same studio as everything else and falling into shadow as
        // it goes. That is what closes the black hole: something is in it.
        let shrink = 1.0 - (progress * 0.12); // 1.0 -> 0.88, stays a real plate
        let sinkFactor = 1.0 - (progress * 0.12); // 1.0 -> 0.88, seated near the rim
        let targetC = cVal * sinkFactor;
        
        p = targetC + (p - cVal) * shrink;
        pIn = targetC + (pIn - cVal) * shrink;
      }

      // Aperture release. Each plate has its own start time inside the shared
      // 0..1, so they unlock one after another instead of the whole patch
      // letting go at once — the difference between a structure opening and a
      // panel falling off.
      if (aperture > 0) {
        const plate = aperturePlates.get(plateIdx);
        if (plate) {
          // Six overlapping windows across the release: plate n starts at
          // n * 0.11 and takes 0.45 to travel, so the last one is still moving
          // when the first has settled.
          const local = THREE.MathUtils.clamp((aperture - plate.order * 0.11) / 0.45, 0, 1);
          // easeInOutCubic: leaves slowly (it has mass), arrives slowly.
          const e = local < 0.5 ? 4 * local * local * local : 1 - Math.pow(-2 * local + 2, 3) / 2;

          const axisComp = i % 3 === 0 ? plate.dir.x : (i % 3 === 1 ? plate.dir.y : plate.dir.z);
          const cComp = i % 3 === 0 ? plate.centroid.x : (i % 3 === 1 ? plate.centroid.y : plate.centroid.z);

          // A few centimetres of unlock first, then a long drift outward and
          // past the camera, so the plate leaves frame at the edge rather than
          // vanishing.
          const travel = e * e * 26 + e * 0.22;
          const push = axisComp * travel;

          // Slight independent turn about the plate's own centre.
          const spun = 1 + Math.sin(e * Math.PI) * plate.spin;
          p = cComp + (p - cComp) * spun + push;
          pIn = cComp + (pIn - cComp) * spun + push;
        }
      }

      // If this is the first face (indices 0..8), detach it!
      if (i < 9 && stage >= 4) {
        const isX = i % 3 === 0;
        const isY = i % 3 === 1;
        const isZ = i % 3 === 2;
        
        let c = isX ? cX : (isY ? cY : cZ);
        let move = isX ? moveX : (isY ? moveY : moveZ);
        
        // Scale out from centroid, then move
        p = c + (p - c) * scaleShard + move;
        pIn = c + (pIn - c) * scaleShard + move;
        
        // Flatten Z to face the camera to look like a 2D glass card
        if (isZ) {
          p = THREE.MathUtils.lerp(p, destZ, shardEase);
          pIn = THREE.MathUtils.lerp(pIn, destZ, shardEase);
        }
      }
      
      outPos[i] = p;
      inPos[i] = pIn;
    }
    outerGeometry.attributes.position.needsUpdate = true;

    // Close the edge of every panel, so each reads as a slab being pushed out
    // rather than a shard floating free.
    {
      const sidePos = panelSideGeometry.attributes.position.array;
      let w = 0;
      for (let f = 0; f < count; f += 3) {
        const b = f * 3;
        for (let e = 0; e < 3; e++) {
          const n = (e + 1) % 3;
          const oe = b + e * 3, on = b + n * 3;

          const ax = outPos[oe], ay = outPos[oe + 1], az = outPos[oe + 2];
          const bx = outPos[on], by = outPos[on + 1], bz = outPos[on + 2];
          const cx = inPos[oe],  cy = inPos[oe + 1],  cz = inPos[oe + 2];
          const dx = inPos[on],  dy = inPos[on + 1],  dz = inPos[on + 2];

          sidePos[w++] = ax; sidePos[w++] = ay; sidePos[w++] = az;
          sidePos[w++] = bx; sidePos[w++] = by; sidePos[w++] = bz;
          sidePos[w++] = cx; sidePos[w++] = cy; sidePos[w++] = cz;

          sidePos[w++] = bx; sidePos[w++] = by; sidePos[w++] = bz;
          sidePos[w++] = dx; sidePos[w++] = dy; sidePos[w++] = dz;
          sidePos[w++] = cx; sidePos[w++] = cy; sidePos[w++] = cz;
        }
      }
      panelSideGeometry.attributes.position.needsUpdate = true;
      panelSideGeometry.computeVertexNormals();
    }

    innerDataGeometry.attributes.position.needsUpdate = true;
    innerDataGeometry.computeVertexNormals();

    const wPos = wiresGeometry.attributes.position.array;
    let wIdx = 0;
    for (let i = 0; i < wireLinks.length; i++) {
      const link = wireLinks[i];
      // Hide wires for the extracted shard (first plate)
      if (stage >= 4 && link.plateVertexIndex < 3) {
        wPos[wIdx++] = link.corePoint.x;
        wPos[wIdx++] = link.corePoint.y;
        wPos[wIdx++] = link.corePoint.z;
        wPos[wIdx++] = link.corePoint.x;
        wPos[wIdx++] = link.corePoint.y;
        wPos[wIdx++] = link.corePoint.z;
      } else {
        wPos[wIdx++] = outPos[link.plateVertexIndex * 3];
        wPos[wIdx++] = outPos[link.plateVertexIndex * 3 + 1];
        wPos[wIdx++] = outPos[link.plateVertexIndex * 3 + 2];
        wPos[wIdx++] = link.corePoint.x;
        wPos[wIdx++] = link.corePoint.y;
        wPos[wIdx++] = link.corePoint.z;
      }
    }
    wiresGeometry.attributes.position.needsUpdate = true;
  });

  return (
    <Float speed={0.5} rotationIntensity={0.1} floatIntensity={0.2}>
      <group ref={groupRef}>
        
        {/* INNER CORE */}
        <mesh>
          <icosahedronGeometry args={[1.8, 2]} />
          <meshStandardMaterial 
            ref={innerCoreMaterialRef}
            color="#010205" 
            emissive="#6d7f96" 
            emissiveIntensity={0.5}
            wireframe={true}
            transparent
            opacity={0.8}
          />
        </mesh>
        
        {/* The occluder that makes the shell read as solid. It has to give way
            for the passage to be a passage — otherwise the plates open onto a
            black wall. It contracts rather than fades, so the Core stays solid
            right up to the rim of the opening. */}
        <mesh ref={occluderRef}>
          <sphereGeometry args={[1.75, 32, 32]} />
          <meshBasicMaterial color="#000000" />
        </mesh>

        {/* DATA WIRES (Tethers for lifted plates) */}
        {/* Scaled down slightly to prevent clipping through the outer shell */}
        <lineSegments geometry={wiresGeometry} scale={0.97}>
          <lineBasicMaterial ref={wiresMaterialRef} color="#0044ff" transparent opacity={0.4} />
        </lineSegments>

        {/* INNER PLATE SKIN (Living data on the underside of plates) */}
        <mesh geometry={innerDataGeometry} scale={0.98}>
          <meshBasicMaterial 
            ref={innerSkinMaterialRef}
            color="#7e8ea6" 
            wireframe={true} 
            transparent 
            opacity={0.15} 
            side={THREE.DoubleSide} 
          />
        </mesh>

        {/* Flanks of every panel — their thickness. */}
        <mesh geometry={panelSideGeometry}>
          <meshPhysicalMaterial
            color="#2b2d33"
            roughness={0.34}
            metalness={0.78}
            clearcoat={0.5}
            clearcoatRoughness={0.28}
            envMapIntensity={2.1}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* 3D Cavity Walls (Plates 1, 2, 3) */}
        <mesh geometry={cavityGeometry} visible={false}>
          <meshPhysicalMaterial 
            ref={cavityWireMaterialRef}
            color="#123a7a" 
            emissive="#1b4fa0"
            emissiveIntensity={0.35}
            roughness={0.6}
            metalness={0.5}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            wireframe={true}
          />
        </mesh>
        <mesh geometry={cavityGeometry}>
          <meshPhysicalMaterial 
            ref={cavitySolidMaterialRef}
            color="#050c1c" 
            roughness={0.28}
            metalness={0.55}
            clearcoat={0.6}
            clearcoatRoughness={0.25}
            envMapIntensity={1.8}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* GOLD INJECTION FORESHADOWING LIGHT (Only in 1 hole) */}
        <mesh geometry={goldLightGeometry}>
          <meshStandardMaterial 
            ref={goldLightMaterialRef}
            color="#C4D63C" 
            emissive="#C4D63C"
            emissiveIntensity={2}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* OUTER SHELL */}
        <mesh geometry={outerGeometry}>
          {/*
            Now that there is a real environment to bend (see the studio in
            Landing.jsx), these can be tuned like an actual mineral rather than
            compensating for an empty surround.

            Lower roughness so the facets stay polished and the highlight
            strips read as sharp lines; higher ior and chromatic aberration for
            visible dispersion at the edges; a clearcoat for the thin specular
            skin every cut stone has. Distortion is dialled back — it was
            hiding facet structure that is worth seeing.
          */}
          <MeshTransmissionMaterial 
            backside
            samples={20}
            resolution={1024}
            backsideResolution={512}
            transmission={0.97}
            roughness={0.12}
            thickness={2.4} 
            ior={1.74}
            chromaticAberration={0.09}
            anisotropy={0.22}
            distortion={0.04}
            distortionScale={0.15}
            temporalDistortion={0.02}
            clearcoat={1}
            clearcoatRoughness={0.06}
            color="#c3cbd8"
            attenuationDistance={2.6}
            attenuationColor="#e8f0ff"
          />
        </mesh>
        
        <pointLight 
          ref={lightRef}
          position={[0, 0, 0]} 
          intensity={stage >= 2 ? 3 : 0} 
          distance={6} 
          color="#c8d4e2" 
        />
      </group>
    </Float>
  );
}
