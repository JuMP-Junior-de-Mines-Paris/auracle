# État réel de la base — relevé du 13 septembre 2026

Relevé via PostgREST avec la clé service-role, projet `gongtjaryqklplvjjvvh`.
Ce document existe parce que **le dépôt et la base ont divergé** : plusieurs
hypothèses des migrations 007→015 étaient fausses, et les appliquer telles
quelles aurait abîmé les données.

## Divergences avec `supabase/schema.sql`

| Point | Ce que dit le dépôt | Ce que contient la base |
| --- | --- | --- |
| `profiles.role` | enum `admin`, `project_manager`, `consultant` | enum `user_role` **étendu**, valeurs françaises : `Président`, `Vice-Président`, `Secrétaire Générale`, `Trésorière`, `Vice-Trésorière`, `Respo DevCo`, `Respo Qualité`, `Respo Com`, `Respo SI`, `Chef de Projet`, `Cheffe de Projet` |
| `contacts.created_by` | déclaré | **absent** |
| Rôles du bureau | 9 annoncés à l'oral | **10** — `Respo Com` n'avait pas été cité |

Conséquences sur les migrations, corrigées :

- **008** mappait `role = 'admin'`, qui n'existe plus : la règle de repli aurait
  basculé **les 21 membres en chef de projet**, effaçant le bureau. La
  correspondance se fait désormais sur les libellés réels, sans accents ni
  casse, et tout libellé non reconnu **arrête** la migration au lieu d'être
  écrasé. Vérifié à blanc : 21/21 mappés, zéro orphelin.
- **011** crée `contacts.created_by`, que `upsert_contact()` écrit.
- `respo_com` ajouté à la table des rôles, au bureau étendu.

## Volumes

| Table | Lignes |
| --- | --- |
| `contacts` | 15 737 |
| `profiles` | 21 |
| `prospecting_lists` | 5 |
| `prospecting_list_contacts` | 10 |
| `missions` | 3 |
| `milestones` | 3 |
| `meetings` | 1 |
| `mission_team` | 1 |
| `list_shares` | 1 |
| `contact_notes` | 0 |
| `ce_documents` | 0 |

## Remplissage de l'annuaire

| Champ | Fiches renseignées | Part |
| --- | --- | --- |
| `id_profil` | 15 737 | 100 % |
| `entreprise_actuelle` | 11 541 | 73 % |
| `linkedin` | 11 292 | 72 % |
| `status` | 2 | ~0 % |
| `email` | **0** | 0 % |
| `telephone` | **0** | 0 % |
| `tags` | **0** | 0 % |

### Ce que ça change

**Aucun contact n'a d'e-mail ni de téléphone.** La prospection ne peut donc
passer que par LinkedIn. En conséquence :

- le canal par défaut d'une démarche est `linkedin`, pas `email` ;
- les boutons d'envoi d'e-mail ne s'affichent que si l'adresse existe, donc
  jamais en l'état — ils sont passés en action secondaire ;
- la clé de dédoublonnage par e-mail et la détection par téléphone sont
  inertes aujourd'hui. Elles restent en place : ce sont des index partiels,
  sans coût sur des colonnes nulles, et l'enrichissement futur les activera.

**`id_profil` et `linkedin` sont les seuls identifiants réels.**

## Doublons

Mesurés sur les 15 737 fiches, par clé forte :

| Clé | Renseignées | Grappes | Fiches en trop |
| --- | --- | --- | --- |
| `id_profil` | 15 737 | **0** | 0 |
| `linkedin` (slug normalisé) | 11 287 | **0** | 0 |
| `email` | 0 | 0 | 0 |

**L'annuaire est propre.** La migration 012 passera donc sans avoir à
fusionner quoi que ce soit, et la page Doublons s'ouvrira vide — ce qui
confirme au passage que l'import initial a été fait proprement.

Le dédoublonnage reste utile en prévention : rien n'empêche aujourd'hui un
second import de tout dupliquer, et c'est précisément ce que 012 verrouille.

## Comment ce relevé a été fait

La clé service-role donne accès aux **données** via PostgREST, pas au schéma :
`api.supabase.com` refuse une clé projet (il lui faut un jeton personnel
`sbp_`), et il n'existe aucune fonction d'exécution SQL. Les colonnes ont donc
été lues dans la spécification OpenAPI que PostgREST publie sur `/rest/v1/`,
et les volumes via des requêtes `HEAD` avec `Prefer: count=exact`.
