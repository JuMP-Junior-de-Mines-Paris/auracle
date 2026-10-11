import { vi } from 'vitest'

/**
 * Faux client Supabase.
 *
 * Le vrai client est un constructeur de requêtes chaînable qui ne part
 * qu'au `await` : chaque méthode se renvoie elle-même, et l'objet est
 * « thenable ». On reproduit ce contrat plutôt que de simuler chaque
 * appel — sinon un test passe alors que la vraie chaîne casserait.
 *
 *   tables  { missions: [...], contacts: [...] }  résultat des select
 *   rpcs    { my_permissions: [...] }             résultat des .rpc()
 *   user    l'utilisateur connecté
 */
export function makeSupabase({ tables = {}, rpcs = {}, user = { id: 'u1', email: 'test@jump-mines.fr' } } = {}) {
  const calls = { insert: [], update: [], delete: [], rpc: [], from: [] }

  function builder(table) {
    const rows = tables[table] ?? []
    let result = { data: rows, error: null, count: rows.length }

    const chain = {}
    const passthrough = [
      'select', 'order', 'range', 'or', 'ilike', 'eq', 'neq', 'is', 'in', 'not',
      'lt', 'gt', 'lte', 'gte', 'match', 'limit', 'contains', 'filter', 'overlaps',
    ]
    for (const m of passthrough) chain[m] = vi.fn(() => chain)

    chain.insert = vi.fn(payload => {
      calls.insert.push({ table, payload })
      result = { data: Array.isArray(payload) ? payload : { id: 'new-id', ...payload }, error: null }
      return chain
    })
    chain.upsert = vi.fn(payload => {
      calls.insert.push({ table, payload, upsert: true })
      return chain
    })
    chain.update = vi.fn(payload => {
      calls.update.push({ table, payload })
      result = { data: { id: 'updated-id', ...payload }, error: null }
      return chain
    })
    chain.delete = vi.fn(() => {
      calls.delete.push({ table })
      result = { data: null, error: null }
      return chain
    })

    // .single() / .maybeSingle() dégradent la liste en un seul enregistrement,
    // exactement comme PostgREST.
    chain.single = vi.fn(() => {
      const d = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data
      result = { ...result, data: d }
      return chain
    })
    chain.maybeSingle = chain.single

    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    return chain
  }

  return {
    from: vi.fn(t => { calls.from.push(t); return builder(t) }),
    rpc: vi.fn((name, args) => {
      calls.rpc.push({ name, args })
      return Promise.resolve(
        name in rpcs
          ? { data: rpcs[name], error: null }
          : { data: null, error: { message: `function ${name} does not exist`, code: '42883' } }
      )
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: user ? { user } : null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    __calls: calls,
  }
}
