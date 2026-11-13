// ZOT DUERP Terrain : saisie des situations de travail sur le terrain (photos + texte dicté), hors connexion.
// Les données restent dans ce téléphone ; la fiche est envoyée à l'ordinateur sous forme de fichier .collecte.json.
import { RISQUES } from './risques.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');

// ---------- stockage (IndexedDB)
let bd;
function ouvrirBd() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('duerp-terrain', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('visites')) r.result.createObjectStore('visites', { keyPath: 'id' });
      if (!r.result.objectStoreNames.contains('clients')) r.result.createObjectStore('clients', { keyPath: 'cle' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
const tx = (mode, f, magasin = 'visites') => new Promise((ok, ko) => { const t = bd.transaction(magasin, mode); const q = f(t.objectStore(magasin)); t.oncomplete = () => ok(q && q.result); t.onerror = () => ko(t.error); });
const toutes = () => tx('readonly', (s) => s.getAll()).then((l) => (l || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
const lire = (id) => tx('readonly', (s) => s.get(id));
const ecrire = (v) => tx('readwrite', (s) => s.put(v));
const effacer = (id) => tx('readwrite', (s) => s.delete(id));
const cleClient = (nom) => String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clients = () => tx('readonly', (s) => s.getAll(), 'clients').then((l) => (l || []).sort((a, b) => a.client.localeCompare(b.client, 'fr')));
const ecrireClient = (c) => tx('readwrite', (s) => s.put(c), 'clients');
const effacerClient = (cle) => tx('readwrite', (s) => s.delete(cle), 'clients');
const contexteVersClient = (c) => ({ cle: cleClient(c.cle || c.client), client: c.client || '', periode: c.periode || '', uts: (c.uts || []).map((u) => ({ ...u, lignes: u.lignes || [] })), recuLe: new Date().toISOString() });

// ---------- utilitaires
function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); }
async function compresser(fichier) {
  const bmp = await createImageBitmap(fichier);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL('image/jpeg', 0.72);
}
const nomFichier = (v) => `Collecte_${String(v.client || 'client').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}_${v.date}.collecte.json`;

// ---------- vues
let visite = null; // visite ouverte
let fiche = null; // fiche en cours d'édition
let utCourante = null; // UT affichée (pour l'édition des UT créées sur le téléphone)
let formUt = false; // formulaire « Nouvelle UT » ouvert

function entete(titre, retour) { $('#titre').textContent = titre; $('#retour').hidden = !retour; $('#retour').dataset.vers = retour || ''; }

async function vueAccueil() {
  entete('ZOT DUERP Terrain', '');
  const l = await toutes();
  const cl = await clients();
  $('#main').innerHTML = `
  <div class="avert">Les données restent <b>uniquement sur ce téléphone</b> jusqu'à l'envoi de la fiche. Évitez de photographier des visages et de noter des noms de personnes.</div>
  <button class="principal large" data-act="nouvelle-visite">+ Nouvelle visite</button>
  <label class="bouton large" style="display:block;text-align:center;margin:0 0 14px;font-weight:400">Importer mes clients ou un contexte (.json)<input type="file" id="f-contexte" accept=".json,.txt,application/json,text/plain" hidden></label>
  ${cl.length ? `<h2>Mes clients (${cl.length})</h2>${cl.length > 5 ? '<input id="c-filtre" type="search" placeholder="Rechercher un client…" autocomplete="off" style="margin-bottom:10px">' : ''}
  <div id="liste-clients">${cl.map((c) => `<div class="carte cliquable carte-client" data-nom="${esc(cleClient(c.client))}" data-act="visite-client" data-cle="${esc(c.cle)}"><div class="ligne"><b>${esc(c.client)}</b><span class="espace"></span><button class="mini" data-act="retirer-client" data-cle="${esc(c.cle)}" aria-label="Retirer ce client du téléphone">Retirer</button></div><div class="doux">${esc(c.periode)}${c.periode ? ' · ' : ''}${c.uts.length} UT · toucher pour démarrer une visite</div></div>`).join('')}</div>` : ''}
  ${l.length ? '<h2>Visites</h2>' : ''}
  ${l.length ? l.map((v) => `<div class="carte cliquable" data-act="ouvrir-visite" data-id="${v.id}"><b>${esc(v.client || 'Sans nom')}</b><div class="doux">${dateFr(v.date)}${v.lieu ? ' · ' + esc(v.lieu) : ''}</div><div>${v.situations.length} situation(s) ${v.envoyeeLe ? '<span class="pastille ok">envoyée</span>' : '<span class="pastille">à envoyer</span>'}</div></div>`).join('') : '<p class="doux">Aucune visite pour le moment.</p>'}
  <div class="signature">ZOT DUERP Terrain<br>Réalisé par <b>Florian ROBERT</b></div>`;
}

async function creerVisite(base = {}) {
  const v = { id: uid('v'), client: base.client || '', periode: base.periode || '', date: aujourdhui(), lieu: '', uts: JSON.parse(JSON.stringify(base.uts || [])), situations: [], envoyeeLe: '' };
  await ecrire(v); location.hash = '#v/' + v.id;
}

async function vueVisite(id) {
  visite = await lire(id);
  if (!visite) { location.hash = ''; return; }
  entete(visite.client || 'Visite', '#');
  $('#main').innerHTML = `
  <div class="carte">
    <label for="v-client" style="margin-top:0">Client / établissement</label><input id="v-client" data-champ="client" value="${esc(visite.client)}" autocomplete="off">
    <div class="ligne"><div style="flex:1"><label for="v-date">Date</label><input id="v-date" data-champ="date" type="date" value="${esc(visite.date)}"></div><div style="flex:1"><label for="v-lieu">Lieu</label><input id="v-lieu" data-champ="lieu" value="${esc(visite.lieu)}" autocomplete="off"></div></div>
    <p class="doux" style="margin-bottom:0">Une visite se compose d'<b>unités de travail (UT)</b> ; chaque UT contient ses <b>situations de travail</b>.</p>
  </div>
  <h2>Unités de travail (${visite.uts.length})</h2>
  ${visite.uts.map((u) => { const n = visite.situations.filter((x) => x.utId === u.id).length; const prep = (u.lignes || []).length; const obs = (u.lignes || []).filter((l) => (visite.observees || []).includes(l.id)).length; return `<div class="carte cliquable" data-act="ouvrir-ut" data-id="${esc(u.id)}"><div class="ligne"><b>${esc(u.nom)}</b><span class="espace"></span>${u.nouvelle ? '<span class="pastille">créée sur le terrain</span>' : ''}</div><div class="doux">${u.effectif ? u.effectif + ' salarié(s) · ' : ''}${n} situation(s) saisie(s)${prep ? ' · ' + obs + '/' + prep + ' préparée(s) observée(s)' : ''}</div></div>`; }).join('') || '<p class="doux">Aucune UT : créez-en une ou importez le contexte d\'un dossier.</p>'}
  ${formUt ? `<div class="carte"><label for="nu-nom" style="margin-top:0">Nom de la nouvelle UT</label><input id="nu-nom" placeholder="Ex. : Buanderie, Aide à domicile…" autocomplete="off"><div class="ligne" style="margin-top:10px"><button class="principal espace" data-act="creer-ut">Créer l'UT</button><button data-act="ut-annuler">Annuler</button></div></div>` : '<button class="principal large" data-act="ut-form">+ Nouvelle UT</button>'}
  <h2>Situations saisies (${visite.situations.length})</h2>
  ${visite.situations.map((s, i) => `<div class="carte cliquable" data-act="ouvrir-fiche" data-id="${s.id}">
    <div class="ligne"><b>${i + 1}. ${esc((visite.uts.find((u) => u.id === s.utId) || {}).nom || s.ut || 'UT non précisée')}</b><span class="espace"></span>${s.risque ? '<span class="pastille">' + esc(s.risque.replace(/^\d+\.\s*/, '').slice(0, 28)) + '</span>' : ''}</div>
    <div class="doux" style="margin:4px 0">${esc((s.texte || '(sans texte)').slice(0, 140))}</div>
    <div>${(s.photos || []).slice(0, 4).map((p) => `<img class="miniature" src="${p}" alt="">`).join('')}</div></div>`).join('')}
  ${visite.situations.length ? '<button class="principal large" data-act="envoyer">Envoyer à l\'ordinateur</button>' : ''}
  <button class="danger large" data-act="suppr-visite">Supprimer cette visite</button>`;
}

async function vueUt(vid, uid_) {
  visite = await lire(vid);
  const u = visite && visite.uts.find((x) => x.id === uid_);
  if (!u) { location.hash = '#v/' + vid; return; }
  fiche = null; utCourante = u;
  entete(u.nom, '#v/' + vid);
  const obs = visite.observees || [];
  const saisies = visite.situations.filter((x) => x.utId === u.id && !x.ligneId);
  $('#main').innerHTML = `
  <div class="carte">${u.nouvelle
    ? `<label for="u-nom" style="margin-top:0">Nom de l'UT</label><input id="u-nom" data-utchamp="nom" value="${esc(u.nom)}" autocomplete="off">
       <label for="u-act">Activités (facultatif)</label><textarea id="u-act" data-utchamp="activites" style="min-height:90px" placeholder="Ce que font les salariés de cette UT…">${esc(u.activites)}</textarea>
       <label for="u-eff">Effectif (facultatif)</label><input id="u-eff" data-utchamp="effectif" type="number" inputmode="numeric" value="${esc(u.effectif ?? '')}">`
    : `${u.effectif ? `<div><b>Effectif :</b> ${esc(u.effectif)}</div>` : ''}
    <div><b>Activités :</b> ${esc(u.activites) || '<span class="doux">non renseignées</span>'}</div>
    <div style="margin-top:6px"><b>Outils / équipements :</b> ${esc(u.outils) || '<span class="doux">non renseignés</span>'}</div>`}</div>
  <button class="principal large" data-act="nouvelle-fiche" data-ut="${esc(u.id)}">+ Nouvelle situation de travail dans cette UT</button>
  <h2>Situations saisies dans cette UT (${saisies.length})</h2>
  ${saisies.map((x, i) => `<div class="carte cliquable" data-act="ouvrir-fiche" data-id="${x.id}"><div class="ligne"><b>${i + 1}.</b><span class="doux espace">${esc((x.texte || '(sans texte)').slice(0, 120))}</span>${x.risque ? '<span class="pastille">' + esc(x.risque.replace(/^\d+\.\s*/, '').slice(0, 24)) + '</span>' : ''}</div><div>${(x.photos || []).slice(0, 4).map((p) => `<img class="miniature" src="${p}" alt="">`).join('')}</div></div>`).join('') || '<p class="doux">Aucune situation saisie pour le moment.</p>'}
  ${(u.lignes || []).length || !u.nouvelle ? `<h2>Situations préparées (${(u.lignes || []).length})</h2>` : ''}
  ${(u.lignes || []).length ? u.lignes.map((l) => { const n = visite.situations.filter((x) => x.ligneId === l.id).length; return `<div class="carte">
    <div class="ligne"><b>${esc((l.risque || '').replace(/^\d+\.\s*/, ''))}</b></div>
    <div class="doux" style="margin:4px 0;white-space:pre-wrap">${esc(l.situation || '(sans description)')}</div>
    <label class="ligne" style="font-weight:400;margin:6px 0"><input type="checkbox" data-obs="${esc(l.id)}" ${obs.includes(l.id) ? 'checked' : ''} style="width:24px;height:24px"> Observée sur le terrain</label>
    <button data-act="fiche-ligne" data-l="${esc(l.id)}" data-ut="${esc(u.id)}">📷 ${n ? 'Voir / compléter (' + n + ')' : 'Ajouter photo / précision'}</button></div>`; }).join('') : (u.nouvelle ? '' : '<p class="doux">Aucune situation préparée pour cette UT.</p>')}`;
}

async function vueFiche(vid, sid) {
  finDictee();
  visite = await lire(vid);
  fiche = visite && visite.situations.find((s) => s.id === sid);
  if (!fiche) { location.hash = '#v/' + vid; return; }
  entete('Situation', fiche.utId ? `#v/${vid}/ut/${fiche.utId}` : '#v/' + vid);
  const ligneRef = fiche.ligneId ? visite.uts.flatMap((u) => u.lignes || []).find((l) => l.id === fiche.ligneId) : null;
  const utsOpt = visite.uts.length ? `<select id="f-ut" data-champ="utId"><option value="">— choisir l'UT —</option>${visite.uts.map((u) => `<option value="${esc(u.id)}" ${fiche.utId === u.id ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}</select>` : `<input id="f-ut" data-champ="ut" value="${esc(fiche.ut)}" placeholder="Unité de travail" autocomplete="off">`;
  $('#main').innerHTML = `
  <div class="carte">
    ${ligneRef ? `<div class="avert" style="margin-bottom:0">Complète la situation préparée : <b>${esc(ligneRef.situation || ligneRef.risque)}</b></div>` : ''}
    <label for="f-ut" style="margin-top:12px">Unité de travail</label>${utsOpt}
    <label for="f-texte">Situation observée</label>
    <textarea id="f-texte" data-champ="texte" placeholder="Décrivez la situation : qui fait quoi, où, comment, ce qui peut causer un accident ou une atteinte à la santé…">${esc(fiche.texte)}</textarea>
    <div class="ligne" style="margin-top:8px"><button data-act="dicter" data-cible="texte" id="b-dicter">🎤 Dicter</button><span class="doux espace" id="aide-dictee">Sinon, touchez le micro de votre clavier.</span></div>
    <label for="f-moyens">Moyens de prévention existants (facultatif)</label>
    ${ligneRef && ligneRef.moyens ? `<div class="doux" style="margin-bottom:4px;white-space:pre-wrap">Déjà noté : ${esc(ligneRef.moyens)}</div>` : ''}
    <textarea id="f-moyens" data-champ="moyens" style="min-height:80px" placeholder="Ce qui existe déjà : matériel, organisation, formation, consignes…">${esc(fiche.moyens)}</textarea>
    <div class="ligne" style="margin-top:8px"><button data-act="dicter" data-cible="moyens" id="b-dicter-moyens">🎤 Dicter</button><span class="doux espace" id="aide-dictee-moyens"></span></div>
    <label for="f-idees">Idées d'amélioration (facultatif)</label>
    ${ligneRef && ligneRef.idees ? `<div class="doux" style="margin-bottom:4px;white-space:pre-wrap">Déjà noté : ${esc(ligneRef.idees)}</div>` : ''}
    <textarea id="f-idees" data-champ="idees" style="min-height:80px" placeholder="Ce qui pourrait être mis en place pour réduire le risque…">${esc(fiche.idees)}</textarea>
    <div class="ligne" style="margin-top:8px"><button data-act="dicter" data-cible="idees" id="b-dicter-idees">🎤 Dicter</button><span class="doux espace" id="aide-dictee-idees"></span></div>
    <label>Photos</label>
    <div class="photos" id="photos">${(fiche.photos || []).map((p, i) => `<div class="photo"><img src="${p}" alt="Photo ${i + 1}"><button data-act="suppr-photo" data-i="${i}" aria-label="Supprimer la photo">×</button></div>`).join('')}</div>
    <label class="bouton principal" style="display:block;text-align:center;font-weight:400">📷 Prendre une photo<input type="file" id="f-photo" accept="image/*" capture="environment" hidden></label>
    <label class="bouton" style="display:block;text-align:center;font-weight:400;margin-top:8px">🖼 Choisir dans la galerie<input type="file" id="f-galerie" accept="image/*" multiple hidden></label>
    <label for="f-risque">Risque (facultatif)</label>
    <select id="f-risque" data-champ="risque"><option value="">— laisser l'ordinateur proposer —</option>${RISQUES.map((r) => `<option ${fiche.risque === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
  </div>
  <button class="principal large" data-act="fiche-ok">Enregistrer et revenir</button>
  <button class="danger large" data-act="suppr-fiche">Supprimer cette situation</button>`;
}

async function route() {
  const h = location.hash.replace(/^#/, '');
  const [k, a, b] = h.split('/');
  const c = h.split('/')[3];
  if (k === 'v' && a && b === 'ut' && c) return vueUt(a, c);
  if (k === 'v' && a && b) return vueFiche(a, b);
  if (k === 'v' && a) return vueVisite(a);
  return vueAccueil();
}

// ---------- actions
let sauvegardeEnCours = 0;
async function sauver() { if (visite) { sauvegardeEnCours++; try { await ecrire(visite); } finally { sauvegardeEnCours--; } } }

const ACTIONS = {
  'nouvelle-visite': () => creerVisite(),
  'visite-client': async (el) => { const c = (await clients()).find((x) => x.cle === el.dataset.cle); if (c) creerVisite(c); },
  'retirer-client': async (el) => {
    if (!confirm('Retirer ce client de la liste du téléphone ? (Ses visites déjà créées sont conservées.)')) return;
    await effacerClient(el.dataset.cle); vueAccueil();
  },
  'ouvrir-visite': (el) => { location.hash = '#v/' + el.dataset.id; },
  'ut-form': () => { formUt = true; vueVisite(visite.id).then(() => { const i = $('#nu-nom'); if (i) i.focus(); }); },
  'ut-annuler': () => { formUt = false; vueVisite(visite.id); },
  'creer-ut': async () => {
    const nom = ($('#nu-nom').value || '').trim();
    if (!nom) { toast("Donnez un nom à l'UT."); return; }
    const u = { id: uid('ut'), nom, effectif: null, activites: '', outils: '', lignes: [], nouvelle: true };
    visite.uts.push(u); formUt = false; await sauver(); location.hash = `#v/${visite.id}/ut/${u.id}`;
  },
  'ouvrir-ut': (el) => { location.hash = `#v/${visite.id}/ut/${el.dataset.id}`; },
  'nouvelle-fiche': async (el) => {
    const u = el && el.dataset && el.dataset.ut ? visite.uts.find((x) => x.id === el.dataset.ut) : null;
    const f = { id: uid('s'), ut: u ? u.nom : '', utId: u ? u.id : '', texte: '', moyens: '', idees: '', risque: '', photos: [], le: new Date().toISOString() };
    visite.situations.push(f); await sauver(); location.hash = `#v/${visite.id}/${f.id}`;
  },
  'fiche-ligne': async (el) => {
    const u = visite.uts.find((x) => x.id === el.dataset.ut); const l = u && (u.lignes || []).find((x) => x.id === el.dataset.l);
    let f = visite.situations.find((x) => x.ligneId === el.dataset.l);
    if (!f) {
      f = { id: uid('s'), ut: u ? u.nom : '', utId: u ? u.id : '', ligneId: el.dataset.l, texte: '', moyens: '', idees: '', risque: (l && l.risque) || '', photos: [], le: new Date().toISOString() };
      visite.situations.push(f); await sauver();
    }
    location.hash = `#v/${visite.id}/${f.id}`;
  },
  'ouvrir-fiche': (el) => { location.hash = `#v/${visite.id}/${el.dataset.id}`; },
  'fiche-ok': async () => { await sauver(); location.hash = fiche && fiche.utId ? `#v/${visite.id}/ut/${fiche.utId}` : '#v/' + visite.id; },
  'suppr-fiche': async () => {
    if (!confirm('Supprimer cette situation et ses photos ?')) return;
    const retour = fiche.utId ? `#v/${visite.id}/ut/${fiche.utId}` : '#v/' + visite.id;
    visite.situations = visite.situations.filter((s) => s.id !== fiche.id); await sauver(); location.hash = retour;
  },
  'suppr-photo': async (el) => { fiche.photos.splice(Number(el.dataset.i), 1); await sauver(); vueFiche(visite.id, fiche.id); },
  'suppr-visite': async () => {
    if (!confirm('Supprimer toute la visite (situations et photos) de ce téléphone ?')) return;
    await effacer(visite.id); location.hash = '';
  },
  'envoyer': async () => {
    const contenu = {
      format: 'duerp-collecte', version: 1, cree: new Date().toISOString(), client: visite.client, periode: visite.periode,
      visite: { date: visite.date, lieu: visite.lieu },
      observees: visite.observees || [],
      utsNouvelles: visite.uts.filter((u) => u.nouvelle).map((u) => ({ id: u.id, nom: u.nom, activites: u.activites || '', effectif: u.effectif || null })),
      situations: visite.situations.map((s) => ({ id: s.id, ut: s.utId ? (visite.uts.find((u) => u.id === s.utId) || {}).nom || '' : s.ut, utId: s.utId || '', ligneId: s.ligneId || '', nouvelleUt: !!(visite.uts.find((u) => u.id === s.utId) || {}).nouvelle, texte: s.texte, moyens: s.moyens || '', idees: s.idees || '', risque: s.risque, photos: s.photos, le: s.le })),
    };
    const nom = nomFichier(visite);
    const texte = JSON.stringify(contenu);
    // Le partage Android refuse parfois le type « application/json » : on essaie aussi « text/plain », puis le téléchargement.
    // Chrome Android n'accepte de partager que certains types : on envoie d'abord un fichier .txt (accepté partout), lu aussi par le logiciel.
    let partage = false;
    for (const [type, n] of [['text/plain', nom.replace(/\.json$/, '.txt')], ['application/json', nom]]) {
      const fichier = new File([texte], n, { type });
      if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        try { await navigator.share({ files: [fichier], title: n }); partage = true; break; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    if (!partage) {
      const fichier = new File([texte], nom, { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(fichier); a.download = nom; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      toast('Fichier enregistré dans Téléchargements : ouvrez « Mes fichiers », appuyez longuement sur ' + nom + ' puis « Partager ».', 9000);
    }
    visite.envoyeeLe = new Date().toISOString(); await sauver();
  },
  'dicter': (el) => dicter((el && el.dataset && el.dataset.cible) || 'texte'),
};

function finDictee(msg) {
  const r = dicter.r, cible = dicter.cible || 'texte'; dicter.r = null;
  clearTimeout(dicter.t);
  if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch { /* déjà arrêtée */ } }
  document.querySelectorAll('[data-act="dicter"]').forEach((b) => { b.textContent = '🎤 Dicter'; });
  const aide = $('#aide-dictee' + (cible === 'texte' ? '' : '-' + cible));
  if (aide && msg !== undefined) aide.textContent = msg;
}
function dicter(cible = 'texte') {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const suffixe = cible === 'texte' ? '' : '-' + cible;
  const aide = $('#aide-dictee' + suffixe), bouton = $('#b-dicter' + (cible === 'texte' ? '' : suffixe));
  if (!SR) { aide.textContent = 'Dictée indisponible ici : touchez le micro de votre clavier.'; return; }
  if (dicter.r) { finDictee('Dictée arrêtée.'); return; }
  const r = new SR(); dicter.r = r; dicter.cible = cible;
  r.lang = 'fr-FR'; r.interimResults = false; r.continuous = false; r.maxAlternatives = 1;
  bouton.textContent = '⏹ Arrêter'; aide.textContent = 'Parlez maintenant…';
  let recu = false;
  r.onresult = (e) => {
    const t = Array.from(e.results).map((x) => x[0].transcript.trim()).join(' ').trim();
    if (!t) return;
    recu = true;
    const zone = $('#f-' + cible); zone.value = (zone.value ? zone.value.replace(/\s*$/, ' ') : '') + t;
    fiche[cible] = zone.value; sauver();
    finDictee('Texte ajouté. Touchez « Dicter » pour continuer.');
  };
  r.onerror = (e) => {
    const m = { 'network': 'La dictée du navigateur demande Internet. Utilisez le micro de votre clavier (hors ligne).',
      'service-not-allowed': 'Dictée refusée par le téléphone. Utilisez le micro du clavier.',
      'not-allowed': 'Micro non autorisé : autorisez-le dans les réglages du site, ou utilisez le micro du clavier.',
      'no-speech': 'Rien entendu. Réessayez, ou utilisez le micro du clavier.',
      'audio-capture': 'Micro introuvable. Utilisez le micro du clavier.' };
    finDictee(m[e.error] || 'Dictée impossible (' + e.error + '). Utilisez le micro du clavier.');
  };
  r.onend = () => { if (dicter.r === r) finDictee(recu ? 'Texte ajouté.' : 'Rien enregistré. Utilisez le micro du clavier si besoin.'); };
  dicter.t = setTimeout(() => { if (dicter.r === r) finDictee('Temps écoulé. Utilisez le micro du clavier si besoin.'); }, 20000);
  try { r.start(); } catch { finDictee('Dictée impossible. Utilisez le micro du clavier.'); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) { e.preventDefault(); ACTIONS[el.dataset.act](el); return; }
  if (e.target.closest('#retour')) location.hash = $('#retour').dataset.vers || '';
});
let minuterie;
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.utchamp && utCourante) {
    const k = e.target.dataset.utchamp;
    utCourante[k] = k === 'effectif' ? (Number(e.target.value) || null) : e.target.value;
    if (k === 'nom') $('#titre').textContent = e.target.value || 'UT';
    clearTimeout(minuterie); minuterie = setTimeout(sauver, 350); return;
  }
  const c = e.target.dataset && e.target.dataset.champ;
  if (!c) return;
  const cible = e.target.closest('#main') && fiche && $('#f-texte') ? fiche : visite;
  if (!cible) return;
  cible[c] = e.target.value;
  if (c === 'utId' && fiche) fiche.ut = (visite.uts.find((u) => u.id === e.target.value) || {}).nom || '';
  if (c === 'client') $('#titre').textContent = e.target.value || 'Visite';
  clearTimeout(minuterie); minuterie = setTimeout(sauver, 350);
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'c-filtre') return;
  const q = cleClient(e.target.value);
  document.querySelectorAll('.carte-client').forEach((c) => { c.hidden = !!q && !c.dataset.nom.includes(q); });
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'f-photo' || e.target.id === 'f-galerie') {
    const fichiers = Array.from(e.target.files || []); e.target.value = '';
    for (const f of fichiers) { try { fiche.photos.push(await compresser(f)); } catch { toast("Photo illisible : essayez à nouveau."); } }
    await sauver(); vueFiche(visite.id, fiche.id);
  } else if (e.target.id === 'f-contexte') {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      if (c.format === 'duerp-clients' && Array.isArray(c.clients)) {
        let n = 0;
        for (const x of c.clients) if (x && x.client) { await ecrireClient(contexteVersClient(x)); n++; }
        toast(n + ' client(s) importé(s) sur le téléphone.', 3500); vueAccueil(); return;
      }
      if (c.format !== 'duerp-contexte') throw new Error('format');
      if (c.client) await ecrireClient(contexteVersClient(c));
      await creerVisite({ client: c.client, periode: c.periode, uts: (c.uts || []).map((u) => ({ ...u, lignes: u.lignes || [] })) });
    } catch { toast("Ce fichier n'est pas un fichier ZOT DUERP (clients ou contexte).", 3500); }
  } else if (e.target.dataset && e.target.dataset.obs) {
    const id = e.target.dataset.obs; visite.observees = (visite.observees || []).filter((x) => x !== id);
    if (e.target.checked) visite.observees.push(id);
    sauver();
  } else if (e.target.dataset && e.target.dataset.champ && e.target.tagName === 'SELECT') {
    const c = e.target.dataset.champ; const cible = fiche && $('#f-texte') ? fiche : visite;
    cible[c] = e.target.value; if (c === 'utId' && fiche) fiche.ut = (visite.uts.find((u) => u.id === e.target.value) || {}).nom || ''; sauver();
  }
});
window.addEventListener('hashchange', () => { finDictee(); route(); });

bd = await ouvrirBd();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
window.__terrain = { etat: () => ({ visite, fiche }), toutes };
route();
