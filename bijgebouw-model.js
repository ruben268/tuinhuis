const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;

// ---- afmetingen (m) ----------------------------------------------------
const W = 4.0;            // breedte (richting van de dakhelling)
const D_CLOSED = 8.0;     // diepte gesloten volume
const REC = 1.5;          // diepte overkapping
const D = D_CLOSED + REC; // 9.5 totale diepte
const H_LOW = 2.10;       // bovenkant dak, lage zijde
const H_HIGH = 3.10;      // bovenkant dak, hoge zijde
const SLOPE = (H_HIGH - H_LOW) / W;          // 0.25
const ANG = Math.atan(SLOPE);
const ROOF_T = 0.18;                          // dakrandhoogte (schuin gemeten)
const ROOF_TV = ROOF_T / Math.cos(ANG);       // verticale dikte

const xW = -W / 2, xE = W / 2;                // west = laag, oost = hoog
const zF = -D / 2, zB = D / 2;                // front (overkapping) / achter
const zG = zF + REC;                          // glaswand, terug geschoven

const under = (x) => H_LOW + (x - xW) * SLOPE - ROOF_TV; // onderkant dak
const H_W = under(xW), H_E = under(xE);

const CORE = 0.16;   // wandkern
const SL_D = 0.028;  // latdiepte
const SL_W = 0.11;   // latbreedte
const PITCH = 0.16;  // hart-op-hart
const PLINT = 0.44;  // hoogte plintband
const REVEAL = 0.035;

// ---- materialen --------------------------------------------------------
const M = {
  gevel: new THREE.MeshStandardMaterial({ name: 'gevel_donkergrijs', color: 0x2e3134, roughness: 0.78, metalness: 0.05 }),
  kern: new THREE.MeshStandardMaterial({ name: 'gevel_diep_donkergrijs', color: 0x202326, roughness: 0.9, metalness: 0.0 }),
  dak: new THREE.MeshStandardMaterial({ name: 'dakrand_donkergrijs', color: 0x282b2e, roughness: 0.62, metalness: 0.08 }),
  hout: new THREE.MeshStandardMaterial({ name: 'hout_eik', color: 0x8a5524, roughness: 0.55, metalness: 0.0 }),
  glas: new THREE.MeshStandardMaterial({ name: 'glas', color: 0x5b6470, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.72 }),
  beton: new THREE.MeshStandardMaterial({ name: 'beton_plaat', color: 0x9b9891, roughness: 0.92, metalness: 0.0 }),
  rvs: new THREE.MeshStandardMaterial({ name: 'beslag_rvs', color: 0xb9bdc2, roughness: 0.3, metalness: 0.85 }),
  stof: new THREE.MeshStandardMaterial({ name: 'stof_zetel', color: 0x8d9a95, roughness: 0.95, metalness: 0.0 }),
  houtLicht: new THREE.MeshStandardMaterial({ name: 'hout_licht', color: 0xb98d52, roughness: 0.6, metalness: 0.0 }),
  figuur: new THREE.MeshStandardMaterial({ name: 'figuur_schaal', color: 0x6f757a, roughness: 0.85, metalness: 0.0 }),
  wit9010: new THREE.MeshStandardMaterial({ name: 'muur_ral9010', color: 0xf2efe8, roughness: 0.94, metalness: 0.0 }),
  vloer: new THREE.MeshStandardMaterial({ name: 'vloer_eik', color: 0xc09257, roughness: 0.62, metalness: 0.0 }),
  vloerNaad: new THREE.MeshStandardMaterial({ name: 'vloer_naad', color: 0x8f6a3a, roughness: 0.8, metalness: 0.0 }),
};

const model = new THREE.Group();
model.name = 'bijgebouw';

function box(name, mat, w, h, d, x, y, z, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.name = name;
  m.position.set(x, y, z);
  if (rz) m.rotation.z = rz;
  model.add(m);
  return m;
}

// verticaal prisma uit een grondvlak-polygoon, met lineair variërende onder/bovenkant
function prism(name, mat, pts, yBot, yTop, holes) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  (holes || []).forEach((hp) => {
    const p = new THREE.Path();
    hp.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
    p.closePath();
    sh.holes.push(p);
  });
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), t = p.getY(i);
    p.setY(i, yBot(x) + t * (yTop(x) - yBot(x)));
  }
  g.computeVertexNormals();
  const mm = mat.clone();
  mm.name = mat.name;
  mm.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, mm);
  m.name = name;
  model.add(m);
  return m;
}

// verticale latten langs een gevel; `place(t)` -> {x, z} voor de lathartlijn
function latten(prefix, len, topAt, place, rotY = 0) {
  const n = Math.max(1, Math.floor(len / PITCH));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + step * (i + 0.5);
    const p = place(t);
    const top = topAt(t);
    // plintband
    const plintH = PLINT - 0.02;
    const b1 = box(`${prefix}_plint_${String(i).padStart(2, '0')}`, M.gevel, SL_W, plintH, SL_D, 0, 0.02 + plintH / 2, 0);
    // hoofdveld
    const h2 = top - (PLINT + REVEAL);
    const b2 = h2 > 0.06
      ? box(`${prefix}_lat_${String(i).padStart(2, '0')}`, M.gevel, SL_W, h2, SL_D, 0, PLINT + REVEAL + h2 / 2, 0)
      : null;
    for (const b of [b1, b2]) {
      if (!b) continue;
      if (rotY) { const g = b.geometry; g.rotateY(0); }
      b.position.x += p.x; b.position.z += p.z;
      if (rotY) b.rotation.y = rotY;
    }
  }
}

// grondvlak: trapezium — overkapping steekt 1,5 m uit aan de lage (west) zijde
// en loopt schuin terug naar de gevel aan de hoge (oost) zijde
const PLAN = [[xW, zF], [xE, zG], [xE, zB], [xW, zB]];

// ---- terrasplaat -------------------------------------------------------
prism('funderingsplaat', M.beton, PLAN, () => -0.14, () => 0);

// ---- lange wanden (constante hoogte) -----------------------------------
// west loopt door tot de voorste rooilijn, oost stopt aan de gevel
const zEc = (zG + zB) / 2;
box('wand_west_kern', M.kern, CORE, H_W, D, xW + SL_D + CORE / 2, H_W / 2, 0);
box('wand_oost_kern', M.kern, CORE, H_E, D_CLOSED, xE - SL_D - CORE / 2, H_E / 2, zEc);
latten('gevel_west', D, () => H_W, (t) => ({ x: xW + SL_D / 2, z: t }));
latten('gevel_oost', D_CLOSED, () => H_E, (t) => ({ x: xE - SL_D / 2, z: t + zEc }));

// ---- achterwand (schuine bovenkant) + loopdeur aan de lage zijde --------
const innerW = W - 2 * (SL_D + CORE);
const BD_W = 0.92, BD_H = 2.02;                 // loopdeur achtergevel
const bX0 = -innerW / 2 + 0.18, bX1 = bX0 + BD_W;
const BW_W = 1.40, BW_H = 1.00, BW_SILL = 1.02;  // raam achtergevel, hoge zijde
const wX1 = innerW / 2 - 0.30, wX0 = wX1 - BW_W;
const BW_T = BW_SILL + BW_H;
{
  const sh = new THREE.Shape();
  const a = -innerW / 2, b = innerW / 2;
  sh.moveTo(a, 0); sh.lineTo(b, 0); sh.lineTo(b, under(b)); sh.lineTo(a, under(a)); sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(bX0, 0); hole.lineTo(bX1, 0); hole.lineTo(bX1, BD_H); hole.lineTo(bX0, BD_H); hole.closePath();
  sh.holes.push(hole);
  const win = new THREE.Path();
  win.moveTo(wX0, BW_SILL); win.lineTo(wX1, BW_SILL); win.lineTo(wX1, BW_T); win.lineTo(wX0, BW_T); win.closePath();
  sh.holes.push(win);
  const g = new THREE.ExtrudeGeometry(sh, { depth: CORE, bevelEnabled: false });
  const m = new THREE.Mesh(g, M.kern);
  m.name = 'wand_achter_kern';
  m.position.set(0, 0, zB - SL_D - CORE);
  model.add(m);
}
{
  const len = innerW + 2 * CORE;
  const n = Math.floor(len / PITCH), step = len / n;
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + step * (i + 0.5);
    const top = under(t);
    const id = String(i).padStart(2, '0');
    if (t > bX0 - 0.02 && t < bX1 + 0.02) {
      const h = top - BD_H;
      if (h > 0.06) box(`gevel_achter_dorpel_${id}`, M.gevel, SL_W, h, SL_D, t, BD_H + h / 2, zB - SL_D / 2);
    } else if (t > wX0 - 0.02 && t < wX1 + 0.02) {
      const plintH = PLINT - 0.02;
      box(`gevel_achter_plint_${id}`, M.gevel, SL_W, plintH, SL_D, t, 0.02 + plintH / 2, zB - SL_D / 2);
      const hb = BW_SILL - (PLINT + REVEAL);
      if (hb > 0.06) box(`gevel_achter_borst_${id}`, M.gevel, SL_W, hb, SL_D, t, PLINT + REVEAL + hb / 2, zB - SL_D / 2);
      const ht = top - BW_T;
      if (ht > 0.06) box(`gevel_achter_raamdorpel_${id}`, M.gevel, SL_W, ht, SL_D, t, BW_T + ht / 2, zB - SL_D / 2);
    } else {
      const plintH = PLINT - 0.02;
      box(`gevel_achter_plint_${id}`, M.gevel, SL_W, plintH, SL_D, t, 0.02 + plintH / 2, zB - SL_D / 2);
      const h2 = top - (PLINT + REVEAL);
      if (h2 > 0.06) box(`gevel_achter_lat_${id}`, M.gevel, SL_W, h2, SL_D, t, PLINT + REVEAL + h2 / 2, zB - SL_D / 2);
    }
  }
}
// loopdeur: houten paneel met kader en klink
{
  const zD = zB - SL_D - CORE / 2;
  const cx = (bX0 + bX1) / 2, J = 0.075;
  box('achterdeur_kozijn_links', M.hout, J, BD_H, 0.09, bX0 + J / 2, BD_H / 2, zD);
  box('achterdeur_kozijn_rechts', M.hout, J, BD_H, 0.09, bX1 - J / 2, BD_H / 2, zD);
  box('achterdeur_kozijn_boven', M.hout, BD_W, J, 0.09, cx, BD_H - J / 2, zD);
  // glazen deurvleugel: houten stijlen + regels rond \u00e9\u00e9n groot glasvlak\n  const vW = BD_W - 2 * J - 0.012, vH = BD_H - J - 0.012, vY0 = 0.006;\n  const ST = 0.115, RT = 0.10, RB = 0.175;\n  box('achterdeur_stijl_links', M.hout, ST, vH, 0.055, cx - vW / 2 + ST / 2, vY0 + vH / 2, zD);\n  box('achterdeur_stijl_rechts', M.hout, ST, vH, 0.055, cx + vW / 2 - ST / 2, vY0 + vH / 2, zD);\n  box('achterdeur_regel_boven', M.hout, vW - 2 * ST, RT, 0.055, cx, vY0 + vH - RT / 2, zD);\n  box('achterdeur_regel_onder', M.hout, vW - 2 * ST, RB, 0.055, cx, vY0 + RB / 2, zD);\n  const gH = vH - RT - RB;\n  box('achterdeur_glas', M.glas, vW - 2 * ST, gH, 0.026, cx, vY0 + RB + gH / 2, zD);
  // klink aan de scharnierloze (rechter) zijde, buitenkant
  const hx = bX1 - J - 0.09, hy = 1.06, hz = zB - SL_D + 0.02;
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.05), M.rvs);
  r.name = 'achterdeur_klink_rozet'; r.position.set(hx, hy, hz); model.add(r);
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 12), M.rvs);
  g.name = 'achterdeur_klink_greep'; g.rotation.z = Math.PI / 2;
  g.position.set(hx - 0.06, hy, hz + 0.035); model.add(g);
}

// raam achtergevel: houten kader + glas
{
  const zW = zB - SL_D - CORE / 2, J = 0.08, cx = (wX0 + wX1) / 2, cy = BW_SILL + BW_H / 2;
  box('achterraam_stijl_links', M.hout, J, BW_H, 0.09, wX0 + J / 2, cy, zW);
  box('achterraam_stijl_rechts', M.hout, J, BW_H, 0.09, wX1 - J / 2, cy, zW);
  box('achterraam_bovendorpel', M.hout, BW_W, J, 0.09, cx, BW_T - J / 2, zW);
  box('achterraam_onderdorpel', M.hout, BW_W, J, 0.09, cx, BW_SILL + J / 2, zW);
  box('achterraam_glas', M.glas, BW_W - 2 * J, BW_H - 2 * J, 0.024, cx, cy, zW);
}

// ---- teruggeschoven glaswand (kopse kant, in de nis) -------------------
const DOOR_W = 2.90, DOOR_H = 1.95;
const dX0 = -1.25, dX1 = dX0 + DOOR_W;
{
  const sh = new THREE.Shape();
  const a = -innerW / 2, b = innerW / 2;
  sh.moveTo(a, 0); sh.lineTo(b, 0); sh.lineTo(b, under(b)); sh.lineTo(a, under(a)); sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(dX0, 0.0); hole.lineTo(dX1, 0.0); hole.lineTo(dX1, DOOR_H); hole.lineTo(dX0, DOOR_H); hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: CORE, bevelEnabled: false });
  const m = new THREE.Mesh(g, M.kern);
  m.name = 'wand_glaspui_kern';
  m.position.set(0, 0, zG);
  model.add(m);
}
// latten op de nisgevel: onder de pui vol, boven de pui alleen de bovendorpel
{
  const len = innerW + 2 * CORE;
  const n = Math.floor(len / PITCH), step = len / n;
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + step * (i + 0.5);
    const top = under(t);
    const inDoor = t > dX0 - 0.02 && t < dX1 + 0.02;
    const y0 = inDoor ? DOOR_H : 0.02;
    const h = top - y0;
    if (h < 0.06) continue;
    if (inDoor) {
      box(`gevel_nis_dorpel_${String(i).padStart(2, '0')}`, M.gevel, SL_W, h, SL_D, t, y0 + h / 2, zG - SL_D / 2);
    } else {
      const plintH = PLINT - 0.02;
      box(`gevel_nis_plint_${String(i).padStart(2, '0')}`, M.gevel, SL_W, plintH, SL_D, t, 0.02 + plintH / 2, zG - SL_D / 2);
      const h2 = top - (PLINT + REVEAL);
      if (h2 > 0.06) box(`gevel_nis_lat_${String(i).padStart(2, '0')}`, M.gevel, SL_W, h2, SL_D, t, PLINT + REVEAL + h2 / 2, zG - SL_D / 2);
    }
  }
}

// ---- schuifpui: houten kader, 3 stijlen, 4 glasvlakken -----------------
{
  const zP = zG + 0.05;            // in het wandvlak
  const J = 0.09, T = 0.07, DEP = 0.075;
  const cx = (dX0 + dX1) / 2;
  box('pui_stijl_links', M.hout, J, DOOR_H, DEP, dX0 + J / 2, DOOR_H / 2, zP);
  box('pui_stijl_rechts', M.hout, J, DOOR_H, DEP, dX1 - J / 2, DOOR_H / 2, zP);
  box('pui_bovendorpel', M.hout, DOOR_W, J, DEP, cx, DOOR_H - J / 2, zP);
  box('pui_onderdorpel', M.hout, DOOR_W, J, DEP, cx, J / 2, zP);
  const paneW = (DOOR_W - 2 * J - 3 * T) / 4;
  for (let i = 0; i < 4; i++) {
    const x0 = dX0 + J + i * (paneW + T);
    box(`glas_vlak_${i + 1}`, M.glas, paneW, DOOR_H - 2 * J, 0.024, x0 + paneW / 2, DOOR_H / 2, zP + 0.001);
    if (i < 3) box(`pui_tussenstijl_${i + 1}`, M.hout, T, DOOR_H - 2 * J, DEP, x0 + paneW + T / 2, DOOR_H / 2, zP);
  }
  // vanuit buitenaanzicht het meest rechtse vak = de deur (klink links, buitenzijde)
  const d0 = dX0 + J;
  const dz = zP - 0.045;
  box('deurvleugel_stijl_sluit', M.hout, 0.055, DOOR_H - 2 * J, 0.055, d0 + paneW - 0.028, DOOR_H / 2, dz);
  box('deurvleugel_stijl_hang', M.hout, 0.055, DOOR_H - 2 * J, 0.055, d0 + 0.028, DOOR_H / 2, dz);
  box('deurvleugel_dorpel_boven', M.hout, paneW, 0.05, 0.055, d0 + paneW / 2, DOOR_H - J - 0.025, dz);
  box('deurvleugel_dorpel_onder', M.hout, paneW, 0.05, 0.055, d0 + paneW / 2, J + 0.025, dz);
  const rz = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.05), M.rvs);
  rz.name = 'deurklink_rozet'; rz.position.set(d0 + paneW - 0.028, 1.06, dz - 0.05); model.add(rz);
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 12), M.rvs);
  gr.name = 'deurklink_greep'; gr.rotation.z = Math.PI / 2;
  gr.position.set(d0 + paneW - 0.09, 1.06, dz - 0.085); model.add(gr);
  const sch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 10), M.rvs);
  sch.name = 'deurklink_scharnierpen'; sch.rotation.x = Math.PI / 2;
  sch.position.set(d0 + 0.028, 1.06, dz - 0.05); model.add(sch);
}

// ---- dak (lessenaar, vlak met de gevels) -------------------------------
// ---- dakramen: 1,2 × 1,2 m, centraal over de breedte, op 2/5 en 4/5 ----
const SKY = 1.2;
const skyPlanW = SKY * Math.cos(ANG);          // plan-breedte van 1,2 m op het dakvlak
const skyZ = [1, 3].map((k) => zG + (D_CLOSED / 5) * (k + 0.5));
const skyHoles = skyZ.map((c) => [
  [-skyPlanW / 2, c - SKY / 2], [skyPlanW / 2, c - SKY / 2],
  [skyPlanW / 2, c + SKY / 2], [-skyPlanW / 2, c + SKY / 2],
]);

prism('dak_lessenaar', M.dak, PLAN,
  (x) => H_LOW + (x - xW) * SLOPE - ROOF_TV,
  (x) => H_LOW + (x - xW) * SLOPE,
  skyHoles);

skyZ.forEach((c, i) => {
  const n = i + 1;
  const yAt = (x) => H_LOW + (x - xW) * SLOPE;
  box(`dakraam_${n}_glas`, M.glas, SKY - 0.1, 0.03, SKY - 0.1, 0, yAt(0) + 0.05, c, ANG);
  const bw = 0.075, off = SKY / 2 - bw / 2;
  box(`dakraam_${n}_rand_voor`, M.dak, SKY + 0.09, 0.11, bw, 0, yAt(0) + 0.03, c - off, ANG);
  box(`dakraam_${n}_rand_achter`, M.dak, SKY + 0.09, 0.11, bw, 0, yAt(0) + 0.03, c + off, ANG);
  const xo = off * Math.cos(ANG);
  box(`dakraam_${n}_rand_laag`, M.dak, bw, 0.11, SKY - 2 * bw, -xo, yAt(-xo) + 0.03, c, ANG);
  box(`dakraam_${n}_rand_hoog`, M.dak, bw, 0.11, SKY - 2 * bw, xo, yAt(xo) + 0.03, c, ANG);
});

// ---- binnenafwerking: RAL 9010 wanden + plafond, eiken vloer -----------
const iW = xW + SL_D + CORE, iE = xE - SL_D - CORE;   // binnenwanden
const zFi = zG + CORE, zBi = zB - SL_D - CORE;        // binnen voor/achter
const dIn = zBi - zFi, zIn = (zFi + zBi) / 2;
const LIN = 0.014;

// vloer: eiken planken in de lengte
{
  const nP = 10, pw = innerW / nP, gap = 0.006;
  for (let i = 0; i < nP; i++) {
    const x = iW + pw * (i + 0.5);
    box(`vloer_plank_${String(i + 1).padStart(2, '0')}`, M.vloer, pw - gap, 0.020, dIn, x, -0.010, zIn);
    if (i < nP - 1) box(`vloer_naad_${i + 1}`, M.vloerNaad, gap + 0.002, 0.016, dIn, iW + pw * (i + 1), -0.012, zIn);
  }
}

// zijwanden
box('binnen_wand_west', M.wit9010, LIN, H_W, dIn, iW + LIN / 2, H_W / 2, zIn);
box('binnen_wand_oost', M.wit9010, LIN, H_E, dIn, iE - LIN / 2, H_E / 2, zIn);

// kopse wanden als stroken (schuine bovenlijn, met uitsparing voor deur/pui)
function kopwand(prefix, z, holes) {
  const n = 26, step = innerW / n;
  for (let i = 0; i < n; i++) {
    const x = iW + step * (i + 0.5);
    const top = under(x);
    const id = String(i).padStart(2, '0');
    const segs = [[0, top]];
    for (const [hx0, hx1, hy0, hy1] of holes) {
      if (x <= hx0 || x >= hx1) continue;
      for (let s = segs.length - 1; s >= 0; s--) {
        const [y0, y1] = segs[s];
        if (hy1 <= y0 || hy0 >= y1) continue;
        segs.splice(s, 1);
        if (hy0 > y0) segs.splice(s, 0, [y0, hy0]);
        if (hy1 < y1) segs.splice(s, 0, [hy1, y1]);
      }
    }
    segs.forEach(([y0, y1], k) => {
      const h = y1 - y0;
      if (h < 0.05) return;
      box(`${prefix}_${id}_${k}`, M.wit9010, step + 0.002, h, LIN, x, y0 + h / 2, z);
    });
  }
}
kopwand('binnen_wand_achter', zBi - LIN / 2, [[bX0, bX1, 0, BD_H], [wX0, wX1, BW_SILL, BW_T]]);
kopwand('binnen_wand_voor', zFi + LIN / 2, [[dX0, dX1, 0, DOOR_H]]);

// plafond, schuin mee met het dak, uitgespaard ter hoogte van de dakramen
{
  const plan = [[iW, zFi], [iE, zFi], [iE, zBi], [iW, zBi]];
  const holes = skyZ.map((c) => [
    [-skyPlanW / 2, c - SKY / 2], [skyPlanW / 2, c - SKY / 2],
    [skyPlanW / 2, c + SKY / 2], [-skyPlanW / 2, c + SKY / 2],
  ]);
  prism('binnen_plafond', M.wit9010, plan, (x) => under(x) - LIN, (x) => under(x), holes);
  // koker rond elk dakraam
  // koker = verticale dagkanten tussen plafondvlak en dakvlak (dikte ROOF_TV)
  skyZ.forEach((c, i) => {
    const n = i + 1;
    const yMid = (x) => under(x) + ROOF_TV / 2 - LIN / 2;   // halfweg plafond en dakbovenkant
    const hK = ROOF_TV + LIN;
    const xo = skyPlanW / 2;
    // dagkanten evenwijdig met de nok: volgen de helling, dus meedraaien
    box(`dakraam_${n}_koker_voor`, M.wit9010, skyPlanW, hK, LIN, 0, yMid(0), c - SKY / 2, ANG);
    box(`dakraam_${n}_koker_achter`, M.wit9010, skyPlanW, hK, LIN, 0, yMid(0), c + SKY / 2, ANG);
    // dagkanten haaks daarop: verticaal, elk op eigen hoogte
    box(`dakraam_${n}_koker_laag`, M.wit9010, LIN, hK, SKY, -xo + LIN / 2, yMid(-xo), c);
    box(`dakraam_${n}_koker_hoog`, M.wit9010, LIN, hK, SKY, xo - LIN / 2, yMid(xo), c);
  });
}

// ---- interieur: schaalelementen ----------------------------------------

// groot rek tegen de hoge (oost) zijde
{
  const dep = 0.40, len = 3.0, h = 2.40, zc = 1.7, x0 = iE - dep / 2;
  for (let i = 0; i < 4; i++) {
    const z = zc - len / 2 + (len / 3) * i;
    box(`rek_staander_${i + 1}`, M.houtLicht, dep, h, 0.045, x0, h / 2, z);
  }
  for (let i = 0; i < 5; i++) {
    const y = 0.30 + i * 0.5;
    box(`rek_plank_${i + 1}`, M.houtLicht, dep, 0.035, len, x0, y, zc);
  }
}

// tweepersoonszetel tegen de lage (west) zijde, kijkend naar het glas
{
  const zc = -1.55, x0 = iW;
  box('zetel_zit', M.stof, 0.86, 0.30, 1.60, x0 + 0.52, 0.27, zc);
  box('zetel_rug', M.stof, 0.18, 0.78, 1.60, x0 + 0.09, 0.39, zc);
  box('zetel_arm_voor', M.stof, 0.86, 0.56, 0.16, x0 + 0.52, 0.28, zc - 0.72);
  box('zetel_arm_achter', M.stof, 0.86, 0.56, 0.16, x0 + 0.52, 0.28, zc + 0.72);
  box('zetel_kussen_links', M.stof, 0.74, 0.14, 0.66, x0 + 0.56, 0.49, zc - 0.36);
  box('zetel_kussen_rechts', M.stof, 0.74, 0.14, 0.66, x0 + 0.56, 0.49, zc + 0.36);
}

// salontafel
{
  const cx = 0.05, zc = -1.55, w = 0.60, l = 1.05, h = 0.38;
  box('salontafel_blad', M.houtLicht, w, 0.04, l, cx, h - 0.02, zc);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    box(`salontafel_poot_${i + 1}`, M.houtLicht, 0.05, h - 0.04, 0.05,
      cx + sx * (w / 2 - 0.07), (h - 0.04) / 2, zc + sz * (l / 2 - 0.07));
  });
}

// schaalfiguur 1,85 m
{
  const px = 0.75, pz = 0.55;
  const cyl = (name, r, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), M.figuur);
    m.name = name; m.position.set(x, y, z); model.add(m); return m;
  };
  cyl('figuur_been_links', 0.075, 0.88, px, 0.44, pz - 0.10);
  cyl('figuur_been_rechts', 0.075, 0.88, px, 0.44, pz + 0.10);
  box('figuur_romp', M.figuur, 0.24, 0.66, 0.44, px, 1.21, pz);
  cyl('figuur_arm_links', 0.055, 0.62, px, 1.20, pz - 0.27);
  cyl('figuur_arm_rechts', 0.055, 0.62, px, 1.20, pz + 0.27);
  cyl('figuur_nek', 0.05, 0.08, px, 1.58, pz);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), M.figuur);
  head.name = 'figuur_hoofd'; head.position.set(px, 1.73, pz); model.add(head);
}

// ---- oriëntatielabels op het maaiveld ----------------------------------
function grondLabel(name, text, z, flip) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3d40';
  ctx.font = '300 118px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '28px';
  ctx.fillText(text, 512 + 14, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ name: `label_${name}`, map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 * 192 / 1024), mat);
  m.name = `label_${name}`;
  m.rotation.set(-Math.PI / 2, 0, flip ? Math.PI : 0);
  m.position.set(0, -0.14 + 0.01, z);
  m.renderOrder = 10;
  model.add(m);
}
grondLabel('voorkant', 'VOORKANT', zF - 1.0, true);
grondLabel('achterkant', 'ACHTERKANT', zB + 1.0, false);

model.position.y = 0.14; // onderkant plaat op y = 0
stage.setObject(model);
