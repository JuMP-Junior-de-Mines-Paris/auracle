# scripts/archive_old_ces.py
"""Range les anciennes conventions d'étude du dossier `ce/` dans les archives.

Chaque convention devient une mission archivée (catégorie « convention_etude »)
plus une ligne de ce_documents qui porte son contenu (contexte, existant,
résumé du CDC, CDC, phases), prêt pour l'indexation RAG. Les contrats qui ne
sont pas des conventions (sous-traitance, SOW) deviennent de simples missions
archivées de catégorie « mission ».

Aucun modèle d'IA : les conventions suivent toutes le même gabarit, on les lit
par leurs titres. Une convention dont la lecture échoue est signalée, jamais
devinée. Emails et téléphones ne sont pas conservés.

Source de chaque fichier : le PDF, sinon le .md voisin quand le PDF est un
scan sans texte, ou quand le .md est le seul exemplaire lisible.

    # Aperçu, sans écrire en base
    python -m scripts.archive_old_ces ../ce --dry-run

    # Écriture ; --created-by = profil qui figurera comme auteur
    python -m scripts.archive_old_ces ../ce --created-by <uuid>

Idempotent : la référence identifie la convention, relancer met à jour.
Dépendance hors requirements : `pip install pypdf` (usage ponctuel).
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

MOIS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}

# Pieds de page répétés dans les PDF ; ils coupent les phrases d'une page à l'autre.
_PIED = re.compile(
    r"^(Convention d.Etude\s*[–-]\s*JuMP|Association régie par la loi|60, ?boulevard Saint-Michel|"
    r"Numéro SIRET|Docusign Envelope|DocuSign Envelope|.*Tous droits de reproduction réservés|\d+\s*/\s*\d+$)",
    re.IGNORECASE)

H_CONTEXTE = r"CONTEXTE ET OBJECTIFS DE L.\s?ÉTUDE"
H_DEF = r"DÉFINITION DE L.\s?ÉTUDE"
H_CDC = r"CAHIER DES CHARGES"
H_METH = r"MÉTHODOLOGIE"
H_ECH = r"ÉCHÉANCIER PRÉVISIONNEL"
H_BUDGET = r"BUDGET"
H_EQUIPE = r"PRÉSENTATION DE L.\s?ÉQUIPE"
H_CGV = r"CONDITIONS G[ÉE]N[ÉE]RALES DE L.\s?[ÉE]TUDE"
H_CONCLUSION = r"CONCLUSION"
_FIN = [H_CONTEXTE, H_DEF, H_CDC, H_METH, H_ECH, H_BUDGET, H_EQUIPE, H_CGV, H_CONCLUSION]

_SOUS_TITRES = (
    r"Étude de l.existant|Liste des compétences.*|Résumé du Cahier des Charges proposé|"
    r"Résumé de la Méthodologie proposée|Détail du Cahier des Charges proposé"
)


@dataclass
class Ce:
    fichier: str
    ref_ce: str = ""
    client: str = ""
    contact: str = ""
    projet: str = ""
    valable_jusqu_au: date | None = None
    contexte: str = ""
    existant: str = ""
    resume_cdc: str = ""
    cdc: str = ""
    phases: list[dict] = field(default_factory=list)
    total_ht: float | None = None
    frais_structure: float | None = None
    total_ttc: float | None = None
    anomalies: list[str] = field(default_factory=list)


# ─── Lecture des fichiers ────────────────────────────────────────────────

def lire_pdf(chemin: Path) -> str:
    try:
        import pypdf
    except ImportError:
        sys.exit("pypdf manquant : pip install pypdf")
    lecteur = pypdf.PdfReader(str(chemin))
    if lecteur.is_encrypted:
        lecteur.decrypt("")
    return "\n".join((p.extract_text() or "") for p in lecteur.pages)


def _nettoyer_md(texte: str) -> str:
    sortie = []
    for ligne in texte.splitlines():
        ligne = ligne.replace("**", "").replace("*(", "(").rstrip()
        ligne = re.sub(r"^#{1,6}\s*", "", ligne)
        ligne = re.sub(r"^\*\s+", "- ", ligne)
        if re.fullmatch(r"-{3,}", ligne.strip()):
            continue
        sortie.append(ligne)
    return "\n".join(sortie)


def _nettoyer_pdf(texte: str) -> str:
    return "\n".join(
        ligne.rstrip() for ligne in texte.splitlines() if not _PIED.match(ligne.strip())
    )


def _espaces(texte: str) -> str:
    return texte.replace(" ", " ").replace(" ", " ")


def charger(pdf: Path | None, md: Path | None) -> tuple[str, str]:
    """(texte nettoyé, 'pdf'|'md'). Le PDF prime ; le .md prend le relais s'il est vide ou s'il manque."""
    if pdf is not None:
        brut = lire_pdf(pdf)
        if len(brut.strip()) > 2000:
            return _espaces(_nettoyer_pdf(brut)), "pdf"
    if md is not None:
        texte = md.read_text(encoding="utf-8")
        if "n'était pas accessible" not in texte:
            return _espaces(_nettoyer_md(texte)), "md"
    raise ValueError("aucun exemplaire lisible")


# ─── Découpage ───────────────────────────────────────────────────────────

def _est_titre(ligne: str, motif: str) -> bool:
    # Certains PDF doublent les espaces dans les titres : « CONTEXTE  ET OBJECTIFS  DE L’ ÉTUDE ».
    return re.fullmatch(motif, re.sub(r"\s+", " ", ligne).strip()) is not None


def bloc(lignes: list[str], debut: str, apres: list[str] | None = None) -> list[str]:
    """Lignes sous le dernier titre `debut` (le sommaire en a un aussi, sans corps), jusqu'au titre suivant."""
    idx = [i for i, l in enumerate(lignes) if _est_titre(l, debut)]
    if not idx:
        return []
    depart = idx[-1]
    fins = apres if apres is not None else [t for t in _FIN if t != debut]
    for j in range(depart + 1, len(lignes)):
        if any(_est_titre(lignes[j], f) for f in fins):
            return lignes[depart + 1:j]
    return lignes[depart + 1:]


def paragraphes(lignes: list[str]) -> str:
    """Recolle les lignes d'un PDF coupées à la largeur de la page ; garde les puces et les fins de paragraphe."""
    morceaux: list[str] = []
    courant = ""
    prec_len = 0
    for brut in lignes:
        ligne = brut.strip()
        if not ligne:
            if courant:
                morceaux.append(courant)
                courant = ""
            continue
        puce = re.match(r"^([-•–▪]||||)\s*", ligne)
        if puce and puce.group(0):
            if courant:
                morceaux.append(courant)
            courant = "- " + ligne[puce.end():]
        elif courant and not (courant.endswith((".", ":", ";", "!", "?")) and prec_len < 75):
            courant += " " + ligne
        else:
            if courant:
                morceaux.append(courant)
            courant = ligne
        prec_len = len(ligne)
    if courant:
        morceaux.append(courant)
    # Les puces se suivent à la ligne, les paragraphes sont séparés d'une ligne vide.
    sortie, prec_puce = [], False
    for m in morceaux:
        est_puce = m.startswith("- ")
        if sortie:
            sortie.append("\n" if (est_puce and prec_puce) else "\n\n")
        sortie.append(m)
        prec_puce = est_puce
    return "".join(sortie).strip()


def _sous_section(lignes: list[str], titre: str) -> list[str]:
    idx = [i for i, l in enumerate(lignes) if _est_titre(l, titre)]
    if not idx:
        return []
    for j in range(idx[-1] + 1, len(lignes)):
        if _est_titre(lignes[j], _SOUS_TITRES):
            return lignes[idx[-1] + 1:j]
    return lignes[idx[-1] + 1:]


# ─── Champs ──────────────────────────────────────────────────────────────

def _date(texte: str) -> date | None:
    texte = texte.strip().lower()
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", texte)
    if m:
        j, mo, a = int(m[1]), int(m[2]), int(m[3])
        return date(a + 2000 if a < 100 else a, mo, j)
    m = re.search(r"(\d{1,2})(?:er)?\s+([a-zéûè]+)\s+(\d{4})", texte)
    if m and m[2] in MOIS:
        return date(int(m[3]), MOIS[m[2]], int(m[1]))
    return None


def _nombre(texte: str) -> float | None:
    texte = re.sub(r"[^\d,.]", "", texte.replace(" ", ""))
    if not texte:
        return None
    return float(texte.replace(",", "."))


def _premier(texte: str, motif: str) -> str:
    # Les motifs restent sur leur ligne : « \s* » avalerait le retour à la ligne et la ligne suivante.
    m = re.search(motif, texte, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _titre_civil(nom: str) -> str:
    return re.sub(r"^(Monsieur|Madame|Mme|M\.|Mr)\s+", "", nom.strip(), flags=re.IGNORECASE)


def _entete(texte: str, genre: str, ce: Ce) -> None:
    tete = "\n".join(texte.splitlines()[:40])
    ce.ref_ce = re.sub(r"\s+", "", _premier(tete, r"Référence[ \t]*:[ \t]*(\S.*)$"))
    ce.valable_jusqu_au = _date(_premier(tete, r"Valable jusqu.au[ \t]*:?[ \t]*(.+)$"))
    ce.contact = _titre_civil(_premier(tete, r"À l.attention de[ \t]*:?[ \t]*(.+)$"))
    if genre == "md":
        ce.client = _premier(tete, r"^Client[ \t]*:[ \t]*(.+)$")
        ce.projet = _premier(tete, r"^Projet[ \t]*:[ \t]*(.+)$")
    else:
        lignes = [l.strip() for l in tete.splitlines() if l.strip()]
        for i, l in enumerate(lignes):
            if re.fullmatch(r"Convention d.Etude", l):
                # Un nom de client long passe sur plusieurs lignes ; la dernière avant « Site web » est le nom du dossier.
                fin = next((j for j in range(i + 1, len(lignes))
                            if lignes[j].lower().startswith(("site web", "mail", "adresse"))), None)
                if fin is not None and fin - i >= 3:
                    ce.client, ce.projet = " ".join(lignes[i + 1:fin - 1]), lignes[fin - 1]
                elif fin is not None and fin - i == 2:        # pas de nom de dossier sous le client
                    ce.client = lignes[i + 1]
                break


_NOM_JEH = re.compile(r"\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*JEHs?\s*$", re.IGNORECASE)
# .md : | Phase 1: nom | 2 | 400 | 800 |
_LIGNE_TABLE = re.compile(
    r"^\|?\s*Phase\s*(\d+)[^|]*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*€?\s*\|\s*([\d.,]+)\s*€?\s*\|?\s*$", re.IGNORECASE)
# Début d'une phase dans la méthodologie : « Phase 2 : … » ou « 2. Titre (3 JEHs à 330€/JEH) : 1 semaine »
_MARQUEUR = re.compile(r"^(?:Phase\s*(\d+)\s*[:.]|(\d+)\.\s+\S.*JEHs?\b)", re.IGNORECASE)


def _nu(ligne: str) -> str:
    """La ligne sans ses puces (• ou glyphes de police) ni espaces de tête."""
    return re.sub(r"^[\s•▪\-–\uf0b7\uf0a7\uf02d\uf0d8]+", "", ligne)


def _regroupements(jetons: list[str]):
    """Les lectures possibles d'une suite de nombres : « 3 500 » peut être 3500 ou 3 puis 500."""
    if not jetons:
        yield []
        return
    tete, reste = jetons[0], jetons[1:]
    for suite in _regroupements(reste):
        yield [tete] + suite
    if tete.isdigit():
        fusion = tete
        for k, autre in enumerate(reste):
            if not (autre.isdigit() and len(autre) == 3):
                break
            fusion += autre
            for suite in _regroupements(reste[k + 1:]):
                yield [fusion] + suite


def _jeh_prix_total(texte: str) -> tuple[float | None, float | None, float | None]:
    """(JEH, prix, total) d'une ligne de budget ; None pour ce qui n'est pas lisible avec certitude.

    Les montants s'écrivent « 3 500€ » ou « 3500 » selon l'année : on retient la lecture
    où JEH × prix = total.
    """
    jetons = re.findall(r"\d+(?:[.,]\d+)?", texte.replace("€", " "))
    for lecture in _regroupements(jetons):
        nombres = [_nombre(x) for x in lecture]
        for k in range(len(nombres) - 2):
            j, p, t = nombres[k:k + 3]
            if j and p and j <= p and abs(j * p - t) < 0.01:
                return j, p, t
    nombres = [_nombre(x) for x in jetons]
    if len(nombres) == 2:
        return nombres[0], (nombres[1] / nombres[0] if nombres[0] else None), nombres[1]
    if len(nombres) == 1:
        return None, None, nombres[0]
    return None, None, None


def _phases_par_intervenant(budget: list[str]) -> list[dict]:
    """« Intervenant 2, Phase 1 : nom » : la numérotation repart à 1 pour chaque intervenant."""
    phases: list[dict] = []
    en_cours: dict | None = None
    for l in budget:
        s = l.strip()
        m = re.match(r"^(Intervenant\s*\d+)\s*,\s*Phase\s*\d+\s*:\s*(.*)$", s, re.IGNORECASE)
        if m:
            en_cours = {"nom": f"{m[1]} : {m[2]}".strip(), "jeh": None, "prix_jeh": None, "total_ht": None, "description": ""}
            phases.append(en_cours)
        elif en_cours is not None and (t := re.match(r"^Total phase[^\d]*\d+[^\d]*(?:\d+[^\d]*)?(.*)$", s, re.IGNORECASE)):
            ligne = re.sub(r"^Total phase\s*\d+\s*,?\s*(?:intervenant\s*\d+)?", "", s, flags=re.IGNORECASE)
            en_cours["jeh"], en_cours["prix_jeh"], en_cours["total_ht"] = _jeh_prix_total(ligne)
            en_cours = None
        elif en_cours is not None and not s.startswith(("JEH", "Total")):
            en_cours["nom"] += " " + s
    return phases


def _phases(definition: list[str], meth: list[str], budget: list[str]) -> list[dict]:
    """Nom, JEH et montant de chaque phase, puis sa description.

    Les gabarits ont changé d'une année à l'autre : on prend ce que chacun donne
    et on laisse à None ce qui n'est pas lisible, sans le deviner.
    """
    noms: dict[int, str] = {}
    jeh: dict[int, float | None] = {}
    prix: dict[int, float | None] = {}
    totaux: dict[int, float | None] = {}
    precedente: dict[int, str] = {}       # ligne « JEH … » qui précède le « Total phase »

    for l in definition + meth:
        l = _nu(l)
        m = re.match(r"^Phase\s*(\d+)\s*[:.]\s*(.+?)\s*$", l, re.IGNORECASE)
        if m:
            nom = m[2]
            mj = _NOM_JEH.search(nom)
            if mj:
                jeh.setdefault(int(m[1]), _nombre(mj[1]))
                nom = nom[:mj.start()]
            if nom.strip(" :"):
                noms.setdefault(int(m[1]), nom.strip(" :"))
        m = re.match(r"^(\d+)\.\s+(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*JEHs?\s*à\s*([\d.,]+)\s*€", l, re.IGNORECASE)
        if m:
            n = int(m[1])
            noms.setdefault(n, m[2].strip(" :"))
            jeh.setdefault(n, _nombre(m[3]))
            prix.setdefault(n, _nombre(m[4]))

    courant: int | None = None      # dernière « Phase N » vue : un « Total phase » s'y rattache même si son numéro est faux
    for l in budget:
        s = l.strip()
        m = _LIGNE_TABLE.match(s)
        if m:
            n = int(m[1])
            jeh[n], prix[n], totaux[n] = _nombre(m[2]), _nombre(m[3]), _nombre(m[4])
            continue
        m = re.match(r"^Phase\s*(\d+)\b(?:\s*[:.]\s*(.+))?", s, re.IGNORECASE)
        if m:
            courant = int(m[1])
            if m[2]:
                noms.setdefault(courant, m[2].strip(" :"))      # le budget nomme parfois seul les phases
            continue
        m = re.match(r"^Total phase\s*(\d+)\s+(.*)$", s, re.IGNORECASE)
        if m:
            n = courant if courant is not None else int(m[1])
            j_, p_, t_ = _jeh_prix_total(m[2])
            if j_ is None and (ligne_jeh := precedente.get(n)):
                j_, p_, t_ = _jeh_prix_total(ligne_jeh)
            jeh[n], prix[n], totaux[n] = j_, p_, t_
            continue
        m = re.match(r"^JEH\b\s*(.*)$", s)
        if m and courant is not None:
            precedente[courant] = m[1]

    # Descriptions : sous le dernier marqueur de chaque phase.
    marques = [(i, int(m[1] or m[2])) for i, l in enumerate(meth) if (m := _MARQUEUR.match(_nu(l)))]
    dernier: dict[int, int] = {}
    for i, n in marques:
        dernier[n] = i
    ordre = sorted(dernier.items(), key=lambda kv: kv[1])
    description: dict[int, str] = {}
    for k, (n, i) in enumerate(ordre):
        fin = ordre[k + 1][1] if k + 1 < len(ordre) else len(meth)
        corps = meth[i + 1:fin]
        coupe = next((j for j, l in enumerate(corps) if re.match(r"^Les différentes étapes", l.strip())), None)
        description[n] = paragraphes(corps[:coupe] if coupe is not None else corps)

    numeros = sorted(set(noms) | set(jeh) | set(totaux))
    if not numeros:
        return _phases_par_intervenant(budget)
    return [{
        "nom": noms.get(n, f"Phase {n}"), "jeh": jeh.get(n), "prix_jeh": prix.get(n),
        "total_ht": totaux.get(n), "description": description.get(n, ""),
    } for n in numeros]


def _budget(texte: str, ce: Ce) -> None:
    def montant(motif: str) -> float | None:
        m = re.search(motif + r"[\s|*]*([\d][\d  .,]*)\s*€", texte, re.IGNORECASE | re.MULTILINE)
        return _nombre(m.group(1)) if m else None

    ce.total_ht = montant(r"^\|?\s*Total H\.?T\.?(?!\s*hors)")
    ce.frais_structure = montant(r"^\|?\s*Frais(?: de structure| HT)?")
    ce.total_ttc = montant(r"^\|?\s*Total T\.?T\.?C\.?")


# Paragraphe repris tel quel dans chaque convention, avant ou après le texte propre à l'étude.
_BOILERPLATE = re.compile(r"Tout au long de l.étude, JuMP.*?(?:par les étudiants|des étudiants)\.?", re.IGNORECASE | re.DOTALL)


def parse(texte: str, genre: str, fichier: str) -> Ce:
    ce = Ce(fichier=fichier)
    _entete(texte, genre, ce)
    lignes = texte.splitlines()

    ce.contexte = paragraphes(bloc(lignes, H_CONTEXTE))
    definition = bloc(lignes, H_DEF)
    ce.existant = paragraphes(_sous_section(definition, r"Étude de l.existant"))
    ce.resume_cdc = paragraphes(_sous_section(definition, r"Résumé du Cahier des Charges proposé"))

    cdc = _sous_section(bloc(lignes, H_CDC), r"Détail du Cahier des Charges proposé") or bloc(lignes, H_CDC)
    ce.cdc = _BOILERPLATE.sub("", paragraphes(cdc)).strip()

    budget = bloc(lignes, H_BUDGET)
    ce.phases = _phases(definition, bloc(lignes, H_METH), budget)
    _budget("\n".join(budget), ce)

    for nom, valeur in (("référence", ce.ref_ce), ("client", ce.client), ("contexte", ce.contexte),
                        ("cahier des charges", ce.cdc), ("budget HT", ce.total_ht), ("phases", ce.phases)):
        if not valeur:
            ce.anomalies.append(f"{nom} introuvable")
    if ce.phases and any(p.get("jeh") is None for p in ce.phases):
        ce.anomalies.append("JEH de phase non lus")
    if ce.phases and ce.total_ht and all(p.get("total_ht") is not None for p in ce.phases):
        somme = sum(p["total_ht"] for p in ce.phases)
        if abs(somme + (ce.frais_structure or 0) - ce.total_ht) > 1:
            ce.anomalies.append(f"phases ({somme:g}) + frais ({ce.frais_structure or 0:g}) ≠ total HT ({ce.total_ht:g})")
    return ce


# ─── Écriture ────────────────────────────────────────────────────────────

def ce_data(ce: Ce) -> dict:
    """Contenu stocké : textes et chiffres, sans email ni téléphone."""
    return {
        "source": "archive",
        "fichier": ce.fichier,
        "ref_ce": ce.ref_ce,
        "projet": ce.projet,
        "client": {"societe": ce.client},
        "interlocuteur": ce.contact,
        "valable_jusqu_au": ce.valable_jusqu_au.isoformat() if ce.valable_jusqu_au else None,
        "contexte": ce.contexte,
        "existant": ce.existant,
        "resume_cdc": ce.resume_cdc,
        "cdc": ce.cdc,
        "phases": ce.phases,
        "budget": {"total_ht": ce.total_ht, "frais_structure": ce.frais_structure, "total_ttc": ce.total_ttc},
    }


def mission(ce: Ce) -> dict:
    resume = re.sub(r"\s+", " ", ce.resume_cdc or ce.contexte).strip()
    if len(resume) > 400:
        resume = resume[:397].rsplit(" ", 1)[0] + "…"
    valable = f" Valable jusqu'au {ce.valable_jusqu_au:%d/%m/%Y}." if ce.valable_jusqu_au else ""
    return {
        "title": f"{ce.ref_ce} — {ce.client}"[:300],
        "description": f"Convention d'étude {ce.ref_ce} (archive).{valable} {resume}".strip(),
        "client_name": ce.client or None,
        "client_contact_name": ce.contact or None,
        "budget": ce.total_ht,
        "status": "archived",
        "category": "convention_etude",
    }


# Contrats qui ne sont pas des conventions d'étude : on n'en lit rien d'autre que ceci, vérifié à la main.
AUTRES = {
    "22armines": {
        "title": "22armines — Sous-traitance ARMINES / MINES Paris",
        "description": "Contrat de sous-traitance (archive) : analyse de données sur des réseaux de chercheurs, "
                       "pour ARMINES et MINES Paris dans le cadre d'un projet avec Air Liquide.",
        "client_name": "ARMINES",
    },
    "22facebook": {
        "title": "22facebook — Statement of Work n°4, Meta",
        "description": "Statement of Work (archive) : traduction de formules mathématiques en Lean et LaTeX "
                       "par cinq annotateurs, pour Meta Platforms.",
        "client_name": "Meta Platforms",
        "start_date": "2022-04-01",
    },
}


def enregistrer(sb, ce: Ce, created_by: str) -> str:
    """Crée ou met à jour la convention et sa mission archivée ; renvoie « créée » ou « mise à jour »."""
    champs = mission(ce)
    data = ce_data(ce)
    existant = sb.table("ce_documents").select("id, mission_id").eq("ref_ce", ce.ref_ce).limit(1).execute().data
    if existant:
        ce_id, mission_id = existant[0]["id"], existant[0]["mission_id"]
        sb.table("ce_documents").update({"ce_data": data}).eq("id", ce_id).execute()
        if mission_id and sb.table("missions").update(champs).eq("id", mission_id).execute().data:
            return "mise à jour"
    else:
        ce_id = None
    mission_id = sb.table("missions").insert({**champs, "created_by": created_by}).execute().data[0]["id"]
    if ce_id:
        sb.table("ce_documents").update({"mission_id": mission_id}).eq("id", ce_id).execute()
    else:
        try:
            sb.table("ce_documents").insert({
                "ref_ce": ce.ref_ce, "ce_data": data, "mission_id": mission_id,
                "created_by": created_by, "status": "final",
            }).execute()
        except Exception:
            sb.table("missions").delete().eq("id", mission_id).execute()
            raise
    return "créée"


def enregistrer_autre(sb, cle: str, created_by: str) -> str:
    info = AUTRES[cle]
    champs = {**info, "status": "archived", "category": "mission"}
    deja = sb.table("missions").select("id").eq("title", info["title"]).eq("category", "mission").limit(1).execute().data
    if deja:
        sb.table("missions").update(champs).eq("id", deja[0]["id"]).execute()
        return "mise à jour"
    sb.table("missions").insert({**champs, "created_by": created_by}).execute()
    return "créée"


# ─── Parcours du dossier ─────────────────────────────────────────────────

def _cle(chemin: Path) -> str:
    """Nom sans accent ni casse ni suffixe numérique de version, pour apparier un PDF et son .md."""
    return re.sub(r"[^a-z0-9]", "", chemin.stem.lower())


def sources(racine: Path) -> list[tuple[str, Path | None, Path | None]]:
    """(clé, pdf, md) pour chaque document des sous-dossiers 22/ et 24/."""
    pdfs = {_cle(p): p for p in sorted(racine.glob("*/pdf/*.pdf"))}
    mds = {_cle(p): p for p in sorted(racine.glob("*/md/*.md"))}
    # 24Elec_H2.pdf ↔ 24Elec_H2_3.md : on rapproche par préfixe quand les noms diffèrent d'un suffixe.
    appariement = []
    restants = dict(mds)
    for cle, pdf in pdfs.items():
        md = restants.pop(cle, None)
        if md is None:
            candidats = [k for k in restants if k.startswith(cle) or cle.startswith(k)]
            if len(candidats) == 1:
                md = restants.pop(candidats[0])
        appariement.append((cle, pdf, md))
    appariement += [(cle, None, md) for cle, md in restants.items()]
    return appariement


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dossier", type=Path)
    ap.add_argument("--created-by", help="uuid du profil auteur (obligatoire sans --dry-run)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.dry_run and not args.created_by:
        ap.error("--created-by est obligatoire sans --dry-run")

    lus: list[Ce] = []
    for cle, pdf, md in sources(args.dossier):
        if cle in AUTRES:
            continue
        try:
            texte, genre = charger(pdf, md)
        except ValueError as exc:
            print(f"✗ {cle}: {exc}")
            continue
        ce = parse(texte, genre, (pdf or md).name)
        lus.append(ce)
        etat = "OK " if not ce.anomalies else "⚠  "
        print(f"{etat}{cle:<22} {genre:<3} {ce.ref_ce:<10} {ce.client[:34]:<34} HT={ce.total_ht} "
              f"phases={len(ce.phases)} ctx={len(ce.contexte)} cdc={len(ce.cdc)}"
              + (f"  [{'; '.join(ce.anomalies)}]" if ce.anomalies else ""))

    refs = [c.ref_ce for c in lus if c.ref_ce]
    doublons = {r for r in refs if refs.count(r) > 1}
    if doublons:
        sys.exit(f"Références en double, rien n'est écrit : {sorted(doublons)}")
    if args.dry_run:
        return

    from app.db import get_supabase_client
    sb = get_supabase_client()
    # Du plus ancien au plus récent : l'archive les affiche par date d'enregistrement décroissante.
    for ce in sorted(lus, key=lambda c: (c.valable_jusqu_au or date.min, c.ref_ce)):
        if not ce.ref_ce or not ce.client:
            print(f"- ignorée (référence ou client illisible) : {ce.fichier}")
            continue
        print(f"  {ce.ref_ce}: {enregistrer(sb, ce, args.created_by)}")
    for cle in AUTRES:
        print(f"  {cle}: {enregistrer_autre(sb, cle, args.created_by)}")


if __name__ == "__main__":
    main()
