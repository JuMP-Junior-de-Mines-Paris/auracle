#!/usr/bin/env python3
"""Assemble les migrations non appliquées en fichiers prêts à coller.

Le projet applique ses migrations à la main dans le SQL Editor Supabase
(cf. CLAUDE.md). Coller neuf fichiers l'un après l'autre invite à en
sauter un ou à les inverser ; ce script produit deux blocs à coller tels
quels, dans le bon ordre.

Deux blocs et pas un seul, parce que 012 pose les contraintes d'unicité :
elle ne peut passer qu'une fois les doublons existants fusionnés depuis
/annuaire/doublons. Elle s'annule d'elle-même sinon, mais autant ne pas
la proposer avant.

    python supabase/bundle.py
"""
import io
import os
import sys

# Ordre d'application. 012 est isolée volontairement (voir plus haut).
BLOC_A = ['007_security_hotfix.sql', '008_rbac_roles.sql', '009_permission_policies.sql',
          '010_audit_log.sql', '011_contacts_dedup.sql', '013_prospection.sql',
          '014_tasks.sql', '015_notes.sql', '016_search_index.sql', '017_signup_trigger.sql', '018_notebooks.sql', '019_directory_outreach.sql', '020_prospection_stats.sql']
BLOC_B = ['012_contacts_unique.sql']

ENTETE_A = """-- ═══════════════════════════════════════════════════════════════════
--  JuMP Oracle — bloc 1/2 : socle de permissions et nouveaux modules
--  Généré par supabase/bundle.py — ne pas éditer à la main.
--
--  À coller dans le SQL Editor Supabase et exécuter d'un bloc.
--  Chaque migration garde sa propre transaction : si l'une échoue, les
--  précédentes restent acquises et le message dit laquelle reprendre.
--
--  Contient : {liste}
--
--  APRÈS : attribuer les vrais rôles depuis /admin, puis nettoyer
--  /annuaire/doublons, puis exécuter le bloc 2.
-- ═══════════════════════════════════════════════════════════════════
"""

ENTETE_B = """-- ═══════════════════════════════════════════════════════════════════
--  JuMP Oracle — bloc 2/2 : verrouillage de l'unicité des contacts
--  Généré par supabase/bundle.py — ne pas éditer à la main.
--
--  À N'EXÉCUTER QU'APRÈS avoir vidé /annuaire/doublons. Si des doublons
--  subsistent, le script s'arrête en donnant leur nombre par clé, sans
--  rien modifier.
-- ═══════════════════════════════════════════════════════════════════
"""


def assembler(dossier, fichiers, entete):
    morceaux = [entete.format(liste=', '.join(f[:3] for f in fichiers))]
    for f in fichiers:
        chemin = os.path.join(dossier, 'migrations', f)
        sql = io.open(chemin, encoding='utf-8').read().rstrip()
        morceaux.append(
            '\n\n-- ───────────────────────────────────────────────────────────────\n'
            f'--  {f}\n'
            '-- ───────────────────────────────────────────────────────────────\n\n'
            + sql
            + f"\n\ndo $$ begin raise notice '  ✓ {f} appliquée'; end $$;\n"
        )
    return ''.join(morceaux)


def main():
    ici = os.path.dirname(os.path.abspath(__file__))
    sortie = os.path.join(ici, 'bundles')
    os.makedirs(sortie, exist_ok=True)

    for nom, fichiers, entete in [
        ('bloc_1_socle_et_modules.sql', BLOC_A, ENTETE_A),
        ('bloc_2_unicite_contacts.sql', BLOC_B, ENTETE_B),
    ]:
        contenu = assembler(ici, fichiers, entete)
        chemin = os.path.join(sortie, nom)
        io.open(chemin, 'w', encoding='utf-8', newline='\n').write(contenu)
        lignes = contenu.count('\n')
        print(f'  {nom:32s} {len(fichiers)} migration(s), {lignes} lignes')

    print(f'\nÉcrits dans supabase/bundles/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
