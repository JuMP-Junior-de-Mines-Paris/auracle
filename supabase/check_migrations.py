#!/usr/bin/env python3
"""Vérifie l'enchaînement des migrations sans base de données.

Rejoue les fichiers dans l'ordre en construisant un modèle du schéma, puis
contrôle qu'à chaque instruction, ce qui est référencé existe déjà : table,
colonne, clé étrangère, cible de politique, de trigger, d'index ou de vue.

Ce que ça n'attrape PAS — le corps des fonctions plpgsql/sql est une chaîne
opaque pour l'analyseur, donc ce qu'elles référencent n'est pas vérifié.
C'est une passe de cohérence structurelle, pas un remplacement de l'exécution.

    python supabase/check_migrations.py
"""
import glob
import io
import os
import re
import sys

import pglast
from pglast import ast

# Tables fournies par Supabase, absentes de nos migrations.
EXTERNES = {
    'auth.users': {'id', 'email'},
    'information_schema.tables': {'table_schema', 'table_name'},
}

# Colonnes que Postgres crée sans qu'on les déclare.
IMPLICITES = {'ctid', 'xmin', 'tableoid'}


class Schema:
    def __init__(self):
        self.tables = {}          # nom -> set(colonnes)
        self.types = set()
        self.vues = set()
        self.fonctions = set()
        self.problemes = []

    def signaler(self, fichier, msg):
        self.problemes.append((fichier, msg))

    def existe(self, nom):
        # EXTERNES est déjà qualifié (auth.users) : comparer tel quel, sans
        # re-préfixer par public.
        return nom in self.tables or nom in self.vues or nom in EXTERNES


def nom_relation(rel):
    if rel is None:
        return None
    schema = rel.schemaname or 'public'
    return rel.relname if schema == 'public' else f'{schema}.{rel.relname}'


def colonnes_de(stmt):
    """Colonnes déclarées par un CREATE TABLE, avec leurs clés étrangères."""
    cols, fks = set(), []
    for elt in (stmt.tableElts or []):
        if isinstance(elt, ast.ColumnDef):
            cols.add(elt.colname)
            for c in (elt.constraints or []):
                if c.contype == pglast.enums.parsenodes.ConstrType.CONSTR_FOREIGN:
                    cible = nom_relation(c.pktable)
                    champs = [f.sval for f in (c.pk_attrs or [])]
                    fks.append((cible, champs))
        elif isinstance(elt, ast.Constraint):
            if elt.contype == pglast.enums.parsenodes.ConstrType.CONSTR_FOREIGN:
                fks.append((nom_relation(elt.pktable), [f.sval for f in (elt.pk_attrs or [])]))
    return cols, fks


def verifier_fk(schema, fichier, cible, champs, contexte):
    if cible is None:
        return
    if cible in EXTERNES:
        connues = EXTERNES[cible]
    elif cible in schema.tables:
        connues = schema.tables[cible]
    else:
        schema.signaler(fichier, f'{contexte} : clé étrangère vers la table inconnue « {cible} »')
        return
    for c in champs:
        if c not in connues:
            schema.signaler(fichier, f'{contexte} : clé étrangère vers « {cible}.{c} », colonne inconnue')


def jouer(schema, fichier, sql):
    for stmt in pglast.parse_sql(sql):
        n = stmt.stmt

        if isinstance(n, ast.CreateStmt):
            nom = nom_relation(n.relation)
            cols, fks = colonnes_de(n)
            # `create table if not exists` sur une table connue : on fusionne.
            schema.tables.setdefault(nom, set()).update(cols)
            for cible, champs in fks:
                verifier_fk(schema, fichier, cible, champs, f'create table {nom}')

        elif isinstance(n, ast.AlterTableStmt):
            nom = nom_relation(n.relation)
            if not schema.existe(nom):
                schema.signaler(fichier, f'alter table sur « {nom} », table inconnue')
                continue
            for cmd in (n.cmds or []):
                d = cmd.def_
                if isinstance(d, ast.ColumnDef):
                    schema.tables[nom].add(d.colname)
                    for c in (d.constraints or []):
                        if c.contype == pglast.enums.parsenodes.ConstrType.CONSTR_FOREIGN:
                            verifier_fk(schema, fichier, nom_relation(c.pktable),
                                        [f.sval for f in (c.pk_attrs or [])],
                                        f'{nom}.{d.colname}')
                elif isinstance(d, ast.Constraint) and \
                        d.contype == pglast.enums.parsenodes.ConstrType.CONSTR_FOREIGN:
                    verifier_fk(schema, fichier, nom_relation(d.pktable),
                                [f.sval for f in (d.pk_attrs or [])],
                                f'contrainte sur {nom}')
                elif cmd.subtype == pglast.enums.parsenodes.AlterTableType.AT_DropColumn:
                    schema.tables[nom].discard(cmd.name)

        elif isinstance(n, ast.CreatePolicyStmt):
            nom = nom_relation(n.table)
            if not schema.existe(nom):
                schema.signaler(fichier, f'policy « {n.policy_name} » sur « {nom} », table inconnue')

        elif isinstance(n, ast.CreateTrigStmt):
            nom = nom_relation(n.relation)
            if not schema.existe(nom):
                schema.signaler(fichier, f'trigger « {n.trigname} » sur « {nom} », table inconnue')

        elif isinstance(n, ast.IndexStmt):
            nom = nom_relation(n.relation)
            if not schema.existe(nom):
                schema.signaler(fichier, f'index « {n.idxname} » sur « {nom} », table inconnue')
            else:
                for p in (n.indexParams or []):
                    if p.name and p.name not in schema.tables.get(nom, set()) and p.name not in IMPLICITES:
                        schema.signaler(fichier, f'index « {n.idxname} » sur la colonne inconnue « {nom}.{p.name} »')

        elif isinstance(n, ast.ViewStmt):
            schema.vues.add(nom_relation(n.view))

        elif isinstance(n, ast.InsertStmt):
            nom = nom_relation(n.relation)
            if not schema.existe(nom):
                schema.signaler(fichier, f'insert dans « {nom} », table inconnue')
            else:
                for c in (n.cols or []):
                    if c.name not in schema.tables.get(nom, set()):
                        schema.signaler(fichier, f'insert dans « {nom} » : colonne inconnue « {c.name} »')

        elif isinstance(n, ast.CreateEnumStmt):
            schema.types.add('.'.join(x.sval for x in n.typeName))

        elif isinstance(n, ast.DropStmt):
            for obj in (n.objects or []):
                if isinstance(obj, ast.TypeName):
                    schema.types.discard('.'.join(x.sval for x in obj.names))

        elif isinstance(n, ast.CreateFunctionStmt):
            schema.fonctions.add('.'.join(x.sval for x in n.funcname))

        elif isinstance(n, ast.RenameStmt) and n.renameType == \
                pglast.enums.parsenodes.ObjectType.OBJECT_TABLE:
            ancien = nom_relation(n.relation)
            if ancien in schema.tables:
                schema.tables[n.newname] = schema.tables.pop(ancien)


def main():
    ici = os.path.dirname(os.path.abspath(__file__))
    fichiers = sorted(glob.glob(os.path.join(ici, 'migrations', '*.sql')))

    schema = Schema()
    # schema.sql pose les tables d'origine ; les migrations partent de là.
    base = os.path.join(ici, 'schema.sql')
    if os.path.exists(base):
        jouer(schema, 'schema.sql', io.open(base, encoding='utf-8').read())

    for f in fichiers:
        court = os.path.basename(f)
        sql = io.open(f, encoding='utf-8').read()
        avant = len(schema.problemes)
        try:
            jouer(schema, court, sql)
        except Exception as e:
            schema.signaler(court, f'analyse impossible : {str(e)[:120]}')
        etat = 'OK ' if len(schema.problemes) == avant else 'ERR'
        print(f'  {etat}  {court}')

    print()
    print(f'{len(schema.tables)} tables, {len(schema.vues)} vues, '
          f'{len(schema.fonctions)} fonctions après la dernière migration.')

    if schema.problemes:
        print(f'\n{len(schema.problemes)} incohérence(s) :\n')
        for f, m in schema.problemes:
            print(f'  {f} — {m}')
        return 1

    print('\nAucune incohérence structurelle.')
    print('Rappel : le corps des fonctions n\'est pas analysé.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
