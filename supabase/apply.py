#!/usr/bin/env python3
"""Exécute du SQL sur le projet Supabase via l'API Management.

Lit le jeton personnel (sbp_…) dans les fichiers .env, jamais en argument :
un jeton passé en ligne de commande finit dans l'historique du shell.

    python supabase/apply.py --check                      état du schéma
    python supabase/apply.py --snapshot                   sauvegarde préalable
    python supabase/apply.py migrations/007_*.sql         applique un fichier
    python supabase/apply.py --sql "select 1"             requête ponctuelle
"""
import argparse
import glob
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def charger_env():
    env = {}
    for f in ('frontend/.env', 'backend/.env', '.env'):
        chemin = os.path.join(RACINE, f)
        if not os.path.exists(chemin):
            continue
        for ligne in io.open(chemin, encoding='utf-8'):
            if '=' in ligne and not ligne.strip().startswith('#'):
                k, v = ligne.strip().split('=', 1)
                env[k] = v.strip().strip('"').strip("'")
    return env


ENV = charger_env()
JETON = next((ENV[k] for k in ('SUPABASE_ACCESS_TOKEN', 'SUPABASE_TOKEN', 'SUPABASE_PAT')
              if ENV.get(k, '').startswith('sbp_')), None)
REF = re.sub(r'https://([^.]+)\.supabase\.co', r'\1', ENV.get('VITE_SUPABASE_URL', '').rstrip('/'))


def query(sql, timeout=300):
    """Renvoie (lignes, erreur). L'erreur est le message Postgres, pas une trace."""
    if not JETON:
        return None, 'Aucun jeton sbp_ trouvé dans les .env'
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': sql}).encode('utf-8'), method='POST')
    req.add_header('Authorization', 'Bearer ' + JETON)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            corps = r.read().decode('utf-8')
            return (json.loads(corps) if corps.strip() else []), None
    except urllib.error.HTTPError as e:
        brut = e.read().decode('utf-8', 'replace')
        try:
            d = json.loads(brut)
            return None, d.get('message') or d.get('error') or brut
        except ValueError:
            return None, brut[:500]
    except Exception as e:
        return None, f'{type(e).__name__}: {e}'


def etat():
    lignes, err = query("""
      select table_name, (select count(*) from information_schema.columns c
                          where c.table_schema='public' and c.table_name=t.table_name) as colonnes
      from information_schema.tables t
      where table_schema='public' and table_type='BASE TABLE'
      order by table_name
    """)
    if err:
        print('erreur :', err); return 1
    print(f'{len(lignes)} tables dans public :')
    for r in lignes:
        print('  %-30s %2d colonnes' % (r['table_name'], r['colonnes']))

    for libelle, sql in [
        ('vues',      "select count(*) n from information_schema.views where table_schema='public'"),
        ('fonctions', "select count(*) n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'"),
        ('policies',  "select count(*) n from pg_policies where schemaname='public'"),
    ]:
        r, e = query(sql)
        print('  %-30s %s' % (libelle, r[0]['n'] if r else e))
    return 0


def snapshot():
    """Sauvegarde locale de ce que les migrations réécrivent."""
    dossier = os.path.join(RACINE, 'supabase', 'snapshots')
    os.makedirs(dossier, exist_ok=True)
    horo = datetime.now().strftime('%Y%m%d-%H%M%S')

    cibles = {
        # 008 réécrit entièrement profiles.role : c'est l'irréversible.
        'profiles': 'select id, prenom, nom, email, role::text as role from public.profiles order by id',
        # 013 réécrit contacts.status.
        'contacts_status': "select id, status from public.contacts where status is not null",
        'prospecting_lists': 'select * from public.prospecting_lists order by id',
        'missions': 'select id, title, status, chef_de_projet, created_by from public.missions order by id',
    }
    total = 0
    for nom, sql in cibles.items():
        lignes, err = query(sql)
        if err:
            print(f'  {nom:22s} ERREUR {err[:80]}'); continue
        chemin = os.path.join(dossier, f'{horo}_{nom}.json')
        io.open(chemin, 'w', encoding='utf-8').write(json.dumps(lignes, ensure_ascii=False, indent=1))
        total += len(lignes)
        print(f'  {nom:22s} {len(lignes):5d} lignes -> {os.path.relpath(chemin, RACINE)}')
    print(f'\n{total} lignes sauvegardées.')
    return 0


def appliquer(chemins):
    for motif in chemins:
        for chemin in sorted(glob.glob(os.path.join(RACINE, 'supabase', motif))) or \
                      sorted(glob.glob(motif)):
            nom = os.path.basename(chemin)
            sql = io.open(chemin, encoding='utf-8').read()
            print(f'  {nom} … ', end='', flush=True)
            _, err = query(sql)
            if err:
                print('ÉCHEC')
                print('    ' + err.replace('\n', '\n    ')[:900])
                return 1
            print('OK')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fichiers', nargs='*')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--snapshot', action='store_true')
    ap.add_argument('--sql')
    a = ap.parse_args()

    if not JETON:
        print('Aucun jeton sbp_ dans les .env.'); return 1

    if a.check:
        return etat()
    if a.snapshot:
        return snapshot()
    if a.sql:
        lignes, err = query(a.sql)
        print(err if err else json.dumps(lignes, ensure_ascii=False, indent=1)[:4000])
        return 1 if err else 0
    if a.fichiers:
        return appliquer(a.fichiers)
    ap.print_help()
    return 0


if __name__ == '__main__':
    sys.exit(main())
