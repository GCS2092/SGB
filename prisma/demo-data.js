require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const MODE = process.argv[2] || 'seed';
const DAY = 86400000, NOW = Date.now();
const DOMAIN = '@demo.sgb.test', DEMO_IP = '10.99.99.99', PW = 'Demo@12345';

// ---------- utilitaires (aleatoire reproductible) ----------
let seedv = 20261031;
const rnd = () => { seedv |= 0; seedv = (seedv + 0x6D2B79F5) | 0; let t = Math.imul(seedv ^ (seedv >>> 15), 1 | seedv); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad = (n, l = 4) => String(n).padStart(l, '0');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const daysAgo = (d, h) => { const x = new Date(NOW - d * DAY); x.setHours(h ?? ri(8, 19), ri(0, 59), ri(0, 59), 0); return x.getTime() > NOW ? new Date(NOW - ri(1, 3) * 3600000) : x; };
const phone = () => '77' + pad(ri(0, 9999999), 7);
const slugify = (s) => 'demo-' + s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function assertLocal() {
  const u = process.env.DATABASE_URL || '';
  if (!/@(localhost|127\.0\.0\.1|\[::1\])[:\/]/.test(u) && process.env.DEMO_FORCE !== '1')
    throw new Error('DATABASE_URL n est pas locale : arret de securite (DEMO_FORCE=1 pour forcer).');
}

// ---------- nettoyage ----------
const CLEAN_ORDER = ['creditNote', 'invoice', 'payment', 'orderStatusHistory', 'orderTracking', 'orderItem', 'stockMovement',
  'stockTransferItem', 'stockTransfer', 'inventoryLine', 'inventorySession', 'purchaseOrderItem', 'purchaseOrder', 'expense',
  'storeStock', 'order', 'product', 'category', 'supplier', 'coupon', 'userStore', 'user', 'auditLog', 'store'];
async function clean() {
  for (const m of CLEAN_ORDER) {
    const r = await prisma[m].deleteMany({ where: { id: { startsWith: 'demo_' } } });
    if (r.count) console.log(m.padEnd(20), r.count, 'supprime(s)');
  }
  console.log('Donnees de test supprimees.');
}

// ---------- catalogue ----------
const CATS = ['Céréales & farines', 'Huiles & condiments', 'Épicerie', 'Produits laitiers', 'Boissons', 'Conserves', 'Hygiène & entretien', 'Maison & papeterie'];
const SUPS = [
  ['Grands Moulins du Sahel', 'contact.gms', '+221 33 800 00 01', 'Zone industrielle, Dakar'],
  ['Sénégal Import Alimentaire', 'commandes.sia', '+221 33 800 00 02', 'Port autonome, Dakar'],
  ['Distribution Fall & Frères', 'ventes.dff', '+221 33 800 00 03', 'Marché Sandaga, Dakar'],
  ['Hygiène Plus Sénégal', 'info.hps', '+221 33 800 00 04', 'Route de Rufisque, Dakar'],
  ['Boissons du Cap-Vert', 'depot.bcv', '+221 33 800 00 05', 'Hann Bel-Air, Dakar'],
];
// nom, categorie, fournisseur, prix achat, prix vente, seuil d alerte
const P = [
  ['Riz brisé 50 kg', 0, 0, 17500, 19500, 10], ['Riz parfumé 25 kg', 0, 0, 13500, 15500, 10], ['Riz brisé 5 kg', 0, 0, 1900, 2250, 20],
  ['Farine de blé 50 kg', 0, 0, 19000, 21000, 6], ['Farine de blé 1 kg', 0, 0, 520, 650, 30], ['Mil (sac 25 kg)', 0, 0, 9500, 11000, 6],
  ['Maïs concassé 25 kg', 0, 0, 8000, 9500, 5], ['Semoule 1 kg', 0, 0, 600, 750, 20],
  ['Huile végétale 5 L', 1, 1, 6200, 7200, 12], ['Huile végétale 1 L', 1, 1, 1350, 1600, 30], ['Huile d’arachide 2 L', 1, 1, 3400, 3900, 15],
  ['Tomate concentrée 400 g', 1, 1, 750, 950, 25], ['Cubes bouillon (boîte de 100)', 1, 1, 2300, 2800, 15], ['Moutarde 200 g', 1, 1, 600, 800, 10],
  ['Mayonnaise 470 g', 1, 1, 1500, 1900, 10], ['Sel fin 1 kg', 1, 1, 150, 250, 30],
  ['Sucre cristal 50 kg', 2, 1, 26500, 29000, 6], ['Sucre cristal 1 kg', 2, 1, 600, 750, 40], ['Spaghetti 500 g', 2, 1, 350, 450, 40],
  ['Macaroni 500 g', 2, 1, 350, 450, 30], ['Thé vert 250 g', 2, 1, 900, 1200, 20], ['Café soluble 100 g', 2, 1, 1800, 2300, 10],
  ['Biscuits secs (paquet)', 2, 1, 200, 300, 50],
  ['Lait en poudre 400 g', 3, 2, 2000, 2400, 15], ['Lait en poudre 25 kg (sac)', 3, 2, 72000, 80000, 3], ['Lait concentré sucré 397 g', 3, 2, 700, 900, 20],
  ['Fromage en portions (boîte)', 3, 2, 1100, 1400, 10],
  ['Eau minérale 1,5 L (pack de 6)', 4, 4, 1400, 1800, 25], ['Jus de bissap 1 L', 4, 4, 700, 1000, 20], ['Boisson gazeuse 1,5 L', 4, 4, 550, 750, 40],
  ['Jus d’orange 1 L', 4, 4, 900, 1200, 15],
  ['Sardines à l’huile 125 g', 5, 1, 350, 500, 40], ['Thon à l’huile 160 g', 5, 1, 900, 1200, 25], ['Haricots en boîte 400 g', 5, 1, 600, 800, 12],
  ['Savon de Marseille', 6, 3, 450, 600, 40], ['Lessive en poudre 1 kg', 6, 3, 1500, 1900, 20], ['Eau de Javel 1 L', 6, 3, 500, 700, 20],
  ['Dentifrice 75 ml', 6, 3, 700, 950, 20], ['Couches bébé taille 3 (paquet)', 6, 3, 5200, 6300, 8],
  ['Papier toilette (pack de 4)', 7, 3, 800, 1100, 25], ['Piles AA (pack de 4)', 7, 3, 900, 1300, 15], ['Bougies (paquet de 6)', 7, 3, 600, 850, 15],
];
const DESTS = ['Dakar Plateau', 'Médina', 'Parcelles Assainies', 'Pikine', 'Guédiawaye', 'Rufisque', 'Almadies', 'Ouakam'];
const CUSTOMERS = [['Awa', 'Diop'], ['Cheikh', 'Fall'], ['Mariama', 'Sow'], ['Pape', 'Gueye'], ['Khady', 'Mbaye']];
const GUESTS = ['Aminata Sarr', 'Modou Faye', 'Rokhaya Thiam', 'Babacar Seck', 'Ndeye Diallo', 'Ousmane Ba', 'Seynabou Ndiaye', 'Alioune Diouf', 'Mame Cissé', 'Abdoulaye Kane'];

async function seed() {
  if (await prisma.product.count({ where: { id: { startsWith: 'demo_' } } }))
    throw new Error('Des donnees de test existent deja. Lance d abord : node prisma/demo-data.js clean');
  const main = await prisma.store.findFirst({ where: { isMain: true } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!main || !admin) throw new Error('Boutique principale ou admin introuvable (lance d abord : npm run db:seed).');
  const TH = 'demo_store_th';
  const hash = await bcrypt.hash(PW, 10);

  // ----- boutiques, utilisateurs -----
  const stores = [{ id: TH, code: 'DEMO-THIES', name: 'Thiès Centre', address: 'Avenue Léopold Sédar Senghor, Thiès', phone: '+221 33 951 00 00', isMain: false, isActive: true, currency: 'XOF' }];
  const users = [], userStores = [{ id: 'demo_us_admin', userId: admin.id, storeId: TH, role: 'MANAGER' }];
  [['Moussa', 'Ndiaye', main.id, 'MANAGER'], ['Fatou', 'Sow', main.id, 'ACCOUNTANT'], ['Ibrahima', 'Ba', TH, 'MANAGER']].forEach((d, i) => {
    users.push({ id: `demo_u_s${i + 1}`, email: `${d[0].toLowerCase()}.${d[1].toLowerCase()}${DOMAIN}`, password: hash, firstName: d[0], lastName: d[1], phone: phone(), role: 'STAFF' });
    userStores.push({ id: `demo_us_${i + 1}`, userId: `demo_u_s${i + 1}`, storeId: d[2], role: d[3] });
  });
  const custs = CUSTOMERS.map((c, i) => {
    const u = { id: `demo_u_c${i + 1}`, email: `${c[0].toLowerCase()}.${c[1].toLowerCase()}${DOMAIN}`, password: hash, firstName: c[0], lastName: c[1], phone: phone(), role: 'CUSTOMER' };
    users.push(u); return u;
  });

  // ----- categories, fournisseurs, produits -----
  const cats = CATS.map((n, i) => ({ id: `demo_c_${i + 1}`, name: n, slug: slugify(n) }));
  const sups = SUPS.map((s, i) => ({ id: `demo_s_${i + 1}`, name: s[0], email: `${s[1]}${DOMAIN}`, phone: s[2], address: s[3] }));
  const prods = P.map((r, i) => ({ i, id: `demo_p_${pad(i + 1, 3)}`, name: r[0], cat: r[1], sup: r[2], buy: r[3], sell: r[4], thr: r[5], w: 2500 / (r[4] + 500), status: 'PUBLISHED' }));
  const idx = shuffle(prods.map((p) => p.i));
  idx.forEach((k, n) => { prods[k].cls = n < 5 ? 'out' : n < 13 ? 'low' : n < 16 ? 'over' : 'ok'; });
  idx.filter((k) => prods[k].cls === 'ok').slice(0, 2).forEach((k) => { prods[k].status = 'DRAFT'; });
  prods.forEach((p) => {
    p.inTh = p.i % 10 < 7;
    p.F = p.cls === 'out' ? 0 : p.cls === 'low' ? ri(1, p.thr) : p.cls === 'over' ? p.thr * 10 + ri(3, 12) : p.thr * ri(2, 6) + ri(0, 4);
    const r = rnd();
    p.F2 = !p.inTh ? 0 : r < 0.12 ? 0 : r < 0.35 ? ri(1, p.thr) : p.thr * ri(1, 3) + ri(0, 3);
    p.S1 = 0; p.S2 = 0; p.L = 0; p.A = 0;
  });

  // ----- commandes -----
  const orders = [];
  const wpick = (pool) => { let r = rnd() * sum(pool.map((p) => p.w)); for (const p of pool) { r -= p.w; if (r <= 0) return p; } return pool[pool.length - 1]; };
  function makeOrders(storeId, key, n, maxAge) {
    const pool = prods.filter((p) => p.status !== 'DRAFT' && (key === 'main' || p.inTh));
    for (let i = 0; i < n; i++) {
      const age = ri(0, maxAge);
      const counter = rnd() < 0.6;
      const used = new Set(), items = [];
      const k = ri(1, 5);
      for (let j = 0; j < k; j++) {
        const p = wpick(pool);
        if (used.has(p.i)) continue;
        used.add(p.i);
        items.push({ p, q: p.sell < 2000 ? ri(1, 8) : p.sell < 10000 ? ri(1, 3) : ri(1, 2) });
      }
      let status;
      const r = rnd();
      if (counter) status = r < 0.05 ? 'CANCELLED' : 'DELIVERED';
      else if (age <= 2) status = r < 0.35 ? 'CONFIRMED' : r < 0.55 ? 'PROCESSING' : r < 0.75 ? 'SHIPPED' : r < 0.95 ? 'DELIVERED' : 'CANCELLED';
      else status = r < 0.88 ? 'DELIVERED' : 'CANCELLED';
      const subtotal = sum(items.map((x) => x.p.sell * x.q));
      const shipping = counter ? 0 : pick([1000, 1500, 2000]);
      const discount = rnd() < 0.1 ? Math.min(subtotal, 500 * ri(1, 4)) : 0;
      const method = counter ? (rnd() < 0.6 ? 'CASH_ON_DELIVERY' : 'MOBILE_MONEY') : (rnd() < 0.5 ? 'MOBILE_MONEY' : 'CASH_ON_DELIVERY');
      let pay;
      if (status === 'DELIVERED') pay = 'PAID';
      else if (status === 'CANCELLED') pay = pick(['REJECTED', 'PENDING']);
      else pay = method === 'MOBILE_MONEY' ? (rnd() < 0.7 ? 'PAID' : 'PARTIAL') : 'PENDING';
      const cust = !counter && rnd() < 0.4 ? pick(custs) : null;
      orders.push({
        storeId, key, age, counter, items, status, subtotal, shipping, discount, total: subtotal + shipping - discount, method, pay,
        createdAt: daysAgo(age), cust, guest: cust ? `${cust.firstName} ${cust.lastName}` : counter ? 'Client comptoir' : pick(GUESTS), guestPhone: phone(),
        dest: counter ? null : pick(DESTS),
      });
    }
  }
  makeOrders(main.id, 'main', 150, 29);
  makeOrders(TH, 'th', 50, 18);
  orders.sort((a, b) => a.createdAt - b.createdAt);
  orders.forEach((o, n) => {
    o.n = n + 1; o.id = `demo_o_${pad(n + 1)}`; o.number = `DEMO-CMD-${pad(n + 1)}`;
    if (o.status !== 'CANCELLED') o.items.forEach((x) => { if (o.key === 'main') x.p.S1 += x.q; else x.p.S2 += x.q; });
  });

  // ----- pertes, ajustements d inventaire -----
  shuffle(prods.slice()).slice(0, 11).forEach((p) => { p.L = ri(1, 3); p.lAge = ri(2, 25); });
  shuffle(prods.filter((p) => p.F >= 3 && p.status !== 'DRAFT')).slice(0, 7).forEach((p) => { p.A = pick([-3, -2, -1, -1, 1, 2]); });

  // ----- plan des entrees (reception de bons de commande) -----
  prods.forEach((p) => {
    p.T = p.inTh ? p.F2 + p.S2 : 0;
    p.IN = p.F + p.S1 + p.L + p.T - p.A;
    p.IN2 = Math.max(0, Math.min(p.F - Math.max(p.A, 0), Math.round(p.IN * 0.15)));
    p.IN1 = p.IN - p.IN2;
  });

  const movs = [];
  let mseq = 0;
  const mv = (o) => movs.push({ id: `demo_m_${pad(++mseq, 5)}`, createdBy: admin.id, ...o });
  const pos = [], poItems = [], expenses = [];
  let poSeq = 0, exSeq = 0;
  const exp = (o) => expenses.push({ id: `demo_e_${pad(++exSeq, 3)}`, createdBy: admin.id, ...o });

  [[40, 'IN1'], [6, 'IN2']].forEach(([age, key]) => {
    sups.forEach((s, si) => {
      const lines = prods.filter((p) => p.sup === si && p[key] > 0);
      if (!lines.length) return;
      const at = daysAgo(age, 10);
      const poNumber = `DEMO-BC-${pad(++poSeq, 3)}`;
      pos.push({ id: `demo_po_${poSeq}`, poNumber, storeId: main.id, supplierId: s.id, status: 'RECEIVED', notes: 'Réception complète', expectedAt: at, createdBy: admin.id, createdAt: new Date(at.getTime() - 3 * DAY) });
      lines.forEach((p) => {
        poItems.push({ id: `demo_poi_${poItems.length + 1}`, purchaseOrderId: `demo_po_${poSeq}`, productId: p.id, quantityOrdered: p[key], quantityReceived: p[key], unitCost: p.buy });
        mv({ storeId: main.id, productId: p.id, type: 'IN', quantity: p[key], unitCost: p.buy, totalCost: p.buy * p[key], reason: 'Réception bon de commande', supplierId: s.id, reference: poNumber, createdAt: at });
      });
      if (key === 'IN2') exp({ storeId: main.id, category: 'STOCK_PURCHASE', label: `Achat marchandises – ${s.name}`, amount: sum(lines.map((p) => p.buy * p.IN2)), date: at, supplierId: s.id, reference: poNumber, createdAt: at });
    });
  });

  // bons de commande a reapprovisionner : produits en stock bas ou en rupture
  const lowBy = sups.map((_, si) => prods.filter((p) => p.sup === si && (p.cls === 'low' || p.cls === 'out')));
  const bySize = sups.map((_, si) => si).sort((a, b) => lowBy[b].length - lowBy[a].length).filter((si) => lowBy[si].length);
  [['ORDERED', 2, 'Commande envoyée au fournisseur'], ['DRAFT', 0, 'Brouillon à valider'], ['CANCELLED', 1, 'Annulé : fournisseur en rupture']].forEach(([status, age, notes], k) => {
    const si = bySize[k]; if (si === undefined) return;
    const id = `demo_po_${++poSeq}`;
    pos.push({ id, poNumber: `DEMO-BC-${pad(poSeq, 3)}`, storeId: main.id, supplierId: sups[si].id, status, notes, expectedAt: new Date(NOW + 4 * DAY), createdBy: admin.id, createdAt: daysAgo(age + 1) });
    lowBy[si].slice(0, 5).forEach((p) => poItems.push({ id: `demo_poi_${poItems.length + 1}`, purchaseOrderId: id, productId: p.id, quantityOrdered: p.thr * ri(4, 8), quantityReceived: 0, unitCost: p.buy }));
  });

  // ----- ventes -----
  orders.forEach((o) => {
    if (o.status === 'CANCELLED') return;
    o.items.forEach((x) => mv({ storeId: o.storeId, productId: x.p.id, type: 'OUT_SALE', quantity: x.q, unitCost: x.p.buy, totalCost: x.p.buy * x.q, reason: 'Vente', orderId: o.id, reference: o.number, createdAt: o.createdAt }));
  });

  // ----- transferts principal -> Thies -----
  const transfers = [], trItems = [];
  const tAt = daysAgo(20, 9);
  transfers.push({ id: 'demo_tr_1', transferNumber: 'DEMO-TR-001', fromStoreId: main.id, toStoreId: TH, status: 'VALIDATED', notes: 'Approvisionnement initial de Thiès', validatedBy: admin.id, validatedAt: tAt, createdBy: admin.id, createdAt: new Date(tAt.getTime() - DAY) });
  prods.filter((p) => p.T > 0).forEach((p) => {
    trItems.push({ id: `demo_tri_${trItems.length + 1}`, transferId: 'demo_tr_1', productId: p.id, quantity: p.T });
    mv({ storeId: main.id, productId: p.id, type: 'TRANSFER_OUT', quantity: p.T, reason: 'Transfert vers Thiès', transferId: 'demo_tr_1', reference: 'DEMO-TR-001', createdAt: tAt });
    mv({ storeId: TH, productId: p.id, type: 'TRANSFER_IN', quantity: p.T, reason: 'Transfert depuis la boutique principale', transferId: 'demo_tr_1', reference: 'DEMO-TR-001', createdAt: new Date(tAt.getTime() + 60000) });
  });
  const pend = prods.filter((p) => p.F >= 6 && p.inTh).slice(0, 4);
  transfers.push({ id: 'demo_tr_2', transferNumber: 'DEMO-TR-002', fromStoreId: main.id, toStoreId: TH, status: 'PENDING', notes: 'Réassort de la semaine', createdBy: admin.id, createdAt: daysAgo(1) });
  pend.forEach((p) => trItems.push({ id: `demo_tri_${trItems.length + 1}`, transferId: 'demo_tr_2', productId: p.id, quantity: ri(2, Math.min(5, p.F)) }));
  transfers.push({ id: 'demo_tr_3', transferNumber: 'DEMO-TR-003', fromStoreId: main.id, toStoreId: TH, status: 'CANCELLED', notes: 'Annulé : erreur de saisie', createdBy: admin.id, createdAt: daysAgo(9) });
  prods.filter((p) => p.F >= 4).slice(0, 2).forEach((p) => trItems.push({ id: `demo_tri_${trItems.length + 1}`, transferId: 'demo_tr_3', productId: p.id, quantity: 3 }));

  // ----- pertes et inventaire -----
  prods.filter((p) => p.L > 0).forEach((p) => mv({ storeId: main.id, productId: p.id, type: 'OUT_LOSS', quantity: p.L, unitCost: p.buy, totalCost: p.buy * p.L, reason: pick(['Casse en rayon', 'Emballage abîmé', 'Date limite dépassée']), createdAt: daysAgo(p.lAge) }));
  const invAt = daysAgo(3, 17);
  const sessions = [
    { id: 'demo_inv_1', number: 'DEMO-INV-001', storeId: main.id, status: 'VALIDATED', notes: 'Inventaire mensuel', createdBy: admin.id, validatedBy: admin.id, validatedAt: invAt, createdAt: daysAgo(4, 9) },
    { id: 'demo_inv_2', number: 'DEMO-INV-002', storeId: main.id, status: 'OPEN', notes: 'Comptage du rayon boissons en cours', createdBy: admin.id, createdAt: daysAgo(0, 8) },
  ];
  const lines = [];
  const adj = prods.filter((p) => p.A !== 0);
  adj.concat(prods.filter((p) => p.A === 0 && p.F > 0 && p.status !== 'DRAFT').slice(0, 3)).forEach((p) => {
    lines.push({ id: `demo_il_${lines.length + 1}`, sessionId: 'demo_inv_1', productId: p.id, expectedQty: p.F - p.A, countedQty: p.F, appliedDiff: p.A });
    if (p.A !== 0) mv({ storeId: main.id, productId: p.id, type: 'ADJUSTMENT', quantity: p.A, reason: 'Inventaire DEMO-INV-001', reference: 'DEMO-INV-001', createdAt: invAt });
  });
  prods.filter((p) => p.cat === 4 && p.F > 0).slice(0, 6).forEach((p, k) => lines.push({ id: `demo_il_${lines.length + 1}`, sessionId: 'demo_inv_2', productId: p.id, expectedQty: p.F, countedQty: k < 3 ? p.F : null }));

  // ----- controle de coherence AVANT toute ecriture -----
  const sgn = { IN: 1, TRANSFER_IN: 1, RETURN_IN: 1, OUT_SALE: -1, OUT_LOSS: -1, OUT_RETURN: -1, TRANSFER_OUT: -1 };
  const delta = (m) => (m.type === 'ADJUSTMENT' ? m.quantity : sgn[m.type] * m.quantity);
  const run = new Map();
  movs.slice().sort((a, b) => a.createdAt - b.createdAt || delta(b) - delta(a)).forEach((m) => {
    const k = `${m.storeId}|${m.productId}`;
    const v = (run.get(k) || 0) + delta(m);
    if (v < 0) throw new Error(`Stock negatif simule pour ${k} le ${m.createdAt.toISOString()}`);
    run.set(k, v);
  });
  prods.forEach((p) => {
    if ((run.get(`${main.id}|${p.id}`) || 0) !== p.F) throw new Error(`Incoherence stock principal : ${p.name}`);
    if ((run.get(`${TH}|${p.id}`) || 0) !== (p.inTh ? p.F2 : 0)) throw new Error(`Incoherence stock Thies : ${p.name}`);
  });

  // ----- enregistrements commandes / paiements / factures -----
  const oRows = [], oiRows = [], hRows = [], payRows = [], invRows = [], cnRows = [];
  const CHAIN = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  let ois = 0, invSeq = 0;
  orders.forEach((o) => {
    oRows.push({
      id: o.id, orderNumber: o.number, storeId: o.storeId, userId: o.cust ? o.cust.id : null, guestName: o.cust ? null : o.guest, guestPhone: o.guestPhone,
      status: o.status, paymentMethod: o.method, paymentStatus: o.pay, subtotal: o.subtotal, shippingCost: o.shipping, discount: o.discount, total: o.total,
      destination: o.dest, shippingAddress: o.dest ? { address: `Rue ${ri(1, 80)}`, city: o.dest } : undefined,
      notes: o.counter ? 'Vente comptoir' : null, createdAt: o.createdAt, updatedAt: o.createdAt, confirmationEmailStatus: 'SENT',
    });
    o.items.forEach((x) => oiRows.push({ id: `demo_oi_${++ois}`, orderId: o.id, productId: x.p.id, productName: x.p.name, price: x.p.sell, quantity: x.q, subtotal: x.p.sell * x.q }));
    const steps = o.status === 'CANCELLED' ? ['PENDING', 'CANCELLED'] : o.counter ? ['PENDING', 'DELIVERED'] : CHAIN.slice(0, CHAIN.indexOf(o.status) + 1);
    let t = o.createdAt.getTime(), prev = null;
    steps.forEach((s, k) => {
      hRows.push({ id: `demo_h_${o.n}_${k}`, orderId: o.id, fromStatus: prev, toStatus: s, message: s === 'CANCELLED' ? 'Commande annulée' : null, reason: s === 'CANCELLED' ? 'Annulée à la demande du client' : null, changedBy: k ? admin.id : null, createdAt: new Date(Math.min(t, NOW)) });
      prev = s; t += ri(1, 6) * 3600000;
    });
    const paid = o.pay === 'PAID', part = o.pay === 'PARTIAL';
    payRows.push({
      id: `demo_pay_${o.n}`, orderId: o.id, method: o.method, status: o.pay, amount: part ? Math.round(o.total / 2) : o.total,
      merchantTransactionId: o.method === 'MOBILE_MONEY' ? `DEMO-TX-${pad(o.n)}` : null, momoNumber: o.method === 'MOBILE_MONEY' ? o.guestPhone : null,
      paidAt: paid || part ? o.createdAt : null, createdAt: o.createdAt, updatedAt: o.createdAt,
    });
    if (o.status !== 'CANCELLED') {
      o.inv = { id: `demo_inv_${o.n}`, number: `DEMO-F-${new Date(o.createdAt).getFullYear()}-${pad(++invSeq)}` };
      invRows.push({
        id: o.inv.id, invoiceNumber: o.inv.number, storeId: o.storeId, orderId: o.id, subtotal: o.subtotal, shippingCost: o.shipping, discount: o.discount, tax: 0, total: o.total,
        status: paid ? 'PAID' : 'GENERATED', issuedAt: o.createdAt, createdAt: o.createdAt, updatedAt: o.createdAt,
      });
    }
  });
  shuffle(orders.filter((o) => o.inv && o.pay === 'PAID' && o.age >= 2)).slice(0, 4).forEach((o, k) => {
    const first = o.items[0];
    cnRows.push({
      id: `demo_cn_${k + 1}`, creditNoteNumber: `DEMO-AV-${pad(k + 1, 3)}`, invoiceId: o.inv.id, storeId: o.storeId,
      amount: Math.min(o.total, first.p.sell * Math.min(first.q, 2)), reason: pick(['Retour produit endommagé', 'Erreur de facturation', 'Geste commercial']),
      status: k % 2 ? 'APPLIED' : 'ISSUED', createdBy: admin.id, createdAt: new Date(Math.min(o.createdAt.getTime() + DAY, NOW)),
    });
  });

  // ----- depenses de fonctionnement -----
  const first = new Date(); first.setDate(1); first.setHours(9, 0, 0, 0);
  [
    [main.id, 'RENT', 'Loyer du local – Dakar Plateau', 350000, first], [TH, 'RENT', 'Loyer du local – Thiès', 180000, first],
    [main.id, 'SALARY', 'Salaires du personnel', 480000, daysAgo(3, 16)], [TH, 'SALARY', 'Salaires du personnel', 260000, daysAgo(3, 16)],
    [main.id, 'UTILITIES', 'Électricité', 68000, daysAgo(12)], [TH, 'UTILITIES', 'Électricité', 41000, daysAgo(11)],
    [main.id, 'UTILITIES', 'Eau', 18000, daysAgo(14)], [main.id, 'UTILITIES', 'Internet et téléphone', 25000, daysAgo(9)],
    [main.id, 'SHIPPING', 'Carburant des livraisons', 35000, daysAgo(8)], [main.id, 'SHIPPING', 'Carburant des livraisons', 22000, daysAgo(20)],
    [main.id, 'MARKETING', 'Affiches et flyers', 30000, daysAgo(15)], [main.id, 'MARKETING', 'Publicité en ligne', 50000, daysAgo(22)],
    [main.id, 'PACKAGING', 'Sacs et emballages', 28000, daysAgo(18)], [TH, 'PACKAGING', 'Sacs et emballages', 14000, daysAgo(16)],
    [main.id, 'OTHER', 'Réparation de la balance', 15000, daysAgo(5)],
  ].forEach(([storeId, category, label, amount, date]) => exp({ storeId, category, label, amount, date, reference: 'DEMO', createdAt: date }));

  // ----- audit et coupons -----
  const audits = [];
  const au = (action, module, entityType, entityId, at, storeId) => audits.push({ id: `demo_a_${pad(audits.length + 1)}`, userId: admin.id, storeId: storeId || main.id, action, module, entityType, entityId, ip: DEMO_IP, createdAt: at });
  prods.slice(0, 3).forEach((p) => au('CREATE', 'products', 'Product', p.id, daysAgo(45)));
  pos.filter((p) => p.status === 'RECEIVED').forEach((p) => au('RECEIVE', 'purchase-orders', 'PurchaseOrder', p.id, p.expectedAt));
  au('VALIDATE', 'stock-transfers', 'StockTransfer', 'demo_tr_1', tAt);
  au('VALIDATE', 'inventory', 'InventorySession', 'demo_inv_1', invAt);
  cnRows.forEach((c) => au('CREATE', 'credit-notes', 'CreditNote', c.id, c.createdAt, c.storeId));
  orders.filter((o) => o.status === 'CANCELLED').slice(0, 3).forEach((o) => au('STATUS_CHANGE', 'orders', 'Order', o.id, o.createdAt, o.storeId));
  const coupons = [
    { id: 'demo_cp_1', code: 'DEMO-BIENVENUE', type: 'PERCENTAGE', value: 10, maxUses: 100, expiresAt: new Date(NOW + 60 * DAY) },
    { id: 'demo_cp_2', code: 'DEMO-2000', type: 'FIXED', value: 2000, minOrderAmount: 20000, maxUses: 50, expiresAt: new Date(NOW + 30 * DAY) },
  ];

  // ----- ecriture en une seule transaction -----
  const created = new Date(NOW - 45 * DAY);
  await prisma.$transaction(async (tx) => {
    const cm = async (model, data) => { for (let i = 0; i < data.length; i += 400) await tx[model].createMany({ data: data.slice(i, i + 400) }); };
    await cm('store', stores);
    await cm('user', users);
    await cm('userStore', userStores);
    await cm('category', cats);
    await cm('supplier', sups);
    await cm('product', prods.map((p) => ({
      id: p.id, name: p.name, slug: slugify(p.name), description: p.name, price: p.sell, purchasePrice: p.buy, stock: p.F + p.F2, reservedStock: 0,
      lowStockAlert: p.thr, overstockAlert: p.thr * 10, categoryId: cats[p.cat].id, supplierId: sups[p.sup].id, status: p.status, isActive: p.status !== 'DRAFT',
      sku: `DEMO-${pad(p.i + 1, 3)}`, barcode: `29000000${pad(p.i + 1, 5)}`, createdAt: created, updatedAt: created,
    })));
    await cm('storeStock', prods.map((p) => ({ id: `demo_ss_m_${p.i + 1}`, storeId: main.id, productId: p.id, quantity: p.F, reservedQuantity: 0 }))
      .concat(prods.filter((p) => p.inTh).map((p) => ({ id: `demo_ss_t_${p.i + 1}`, storeId: TH, productId: p.id, quantity: p.F2, reservedQuantity: 0 }))));
    await cm('coupon', coupons);
    await cm('purchaseOrder', pos);
    await cm('purchaseOrderItem', poItems);
    await cm('order', oRows);
    await cm('orderItem', oiRows);
    await cm('orderStatusHistory', hRows);
    await cm('payment', payRows);
    await cm('invoice', invRows);
    await cm('creditNote', cnRows);
    await cm('stockTransfer', transfers);
    await cm('stockTransferItem', trItems);
    await cm('inventorySession', sessions);
    await cm('inventoryLine', lines);
    await cm('stockMovement', movs);
    await cm('expense', expenses);
    await cm('auditLog', audits);
  }, { timeout: 180000, maxWait: 20000 });

  // ----- resume -----
  const live = orders.filter((o) => o.status !== 'CANCELLED');
  const ca = sum(live.filter((o) => o.pay === 'PAID').map((o) => o.total));
  const cogs = sum(live.map((o) => sum(o.items.map((x) => x.p.buy * x.q))));
  const opex = sum(expenses.filter((e) => e.category !== 'STOCK_PURCHASE').map((e) => e.amount));
  console.log('\n=== Donnees de test creees ===');
  console.log(`Produits ${prods.length} | categories ${cats.length} | fournisseurs ${sups.length} | boutiques +1 | utilisateurs ${users.length}`);
  console.log(`Commandes ${orders.length} (${live.length} hors annulees) | factures ${invRows.length} | avoirs ${cnRows.length} | mouvements ${movs.length}`);
  console.log(`Stock : ${prods.filter((p) => p.F === 0).length} ruptures et ${prods.filter((p) => p.F > 0 && p.F <= p.thr).length} stocks faibles (boutique principale)`);
  console.log(`Valeur du stock (achat) : ${sum(prods.map((p) => (p.F + p.F2) * p.buy)).toLocaleString('fr-FR')} FCFA`);
  console.log(`CA encaisse : ${ca.toLocaleString('fr-FR')} FCFA | cout des ventes : ${cogs.toLocaleString('fr-FR')} | charges : ${opex.toLocaleString('fr-FR')}`);
  console.log(`\nComptes de test (mot de passe ${PW}) :`);
  users.filter((u) => u.role === 'STAFF').forEach((u) => console.log('  ', u.email));
  console.log('Ton compte admin existant voit aussi la boutique « Thiès Centre ».');
}

(async () => {
  assertLocal();
  if (MODE === 'clean') await clean();
  else if (MODE === 'seed') await seed();
  else throw new Error('Usage : node prisma/demo-data.js seed | clean');
})().catch((e) => { console.error('\nERREUR :', e.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());