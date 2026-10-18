/* Bubble TT: poses on top of Kit.people.pose. Exposes BT.pose(p, phase, mode, k, opts).
   Extra modes: 'stand' (arms relaxed, breathing), 'blow' (leaning in, hands at the mouth: blowing a bubble),
   'dizzy' (flopped on his back, arms and legs waggling), 'cheer' (both fists up), 'kick' (trapped in a bubble:
   arms and legs paddling). Standing signature moves ('peace', 'wave', 'give') keep their legs still. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const People = Kit.people;
  const STILL_LEGS = { peace: 1, wave: 1, give: 1 };
  const ease = (o, prop, v, k) => { o[prop] += (v - o[prop]) * k; };

  BT.pose = function (p, ph, mode, k, opts = {}) {
    if (mode === 'stand') {
      People.pose(p, ph, 'idle', k);
      const b = Math.sin(ph * 0.5) * 0.05;
      ease(p.armL.rotation, 'z', -0.1 - b, k);
      ease(p.armR.rotation, 'z', 0.1 + b, k);
      p.hips.position.y = p.hipY + Math.sin(ph * 0.5) * 0.012;
      return;
    }
    if (mode === 'blow') {
      People.pose(p, ph, 'idle', k);
      ease(p.armL.rotation, 'x', 2.3, k);
      ease(p.armR.rotation, 'x', 2.3, k);
      ease(p.armL.rotation, 'z', 0.45, k);
      ease(p.armR.rotation, 'z', -0.45, k);
      ease(p.hips.rotation, 'x', -0.25, k);
      ease(p.head.rotation, 'x', 0.1, k);
      return;
    }
    if (mode === 'dizzy') {
      People.pose(p, ph, 'fall', k);
      ease(p.armL.rotation, 'z', -2.2 + Math.sin(ph * 3) * 0.4, k);
      ease(p.armR.rotation, 'z', 2.2 - Math.sin(ph * 3 + 1) * 0.4, k);
      ease(p.legL.rotation, 'x', 0.9 + Math.sin(ph * 2.5) * 0.4, k);
      ease(p.legR.rotation, 'x', 0.9 - Math.sin(ph * 2.5) * 0.4, k);
      return;
    }
    if (mode === 'kick') {
      People.pose(p, ph * 1.6, 'run', k);
      ease(p.armL.rotation, 'z', -0.9 + Math.sin(ph * 4) * 0.4, k);
      ease(p.armR.rotation, 'z', 0.9 - Math.sin(ph * 4) * 0.4, k);
      return;
    }
    if (mode === 'cheer') {
      People.pose(p, ph, 'jump', k);
      ease(p.armL.rotation, 'x', 2.9, k);
      ease(p.armR.rotation, 'x', 2.9, k);
      ease(p.armL.rotation, 'z', -0.35, k);
      ease(p.armR.rotation, 'z', 0.35, k);
      ease(p.legL.rotation, 'x', 0, k);
      ease(p.legR.rotation, 'x', 0, k);
      return;
    }
    People.pose(p, ph, mode, k);
    if (STILL_LEGS[mode] && !opts.moving) {
      p.legL.rotation.x *= 0.25;
      p.legR.rotation.x *= 0.25;
      p.hips.position.y = p.hipY + Math.abs(Math.sin(ph)) * 0.03;
    }
  };
})();
