/**
 * Суpabase-совместимый query builder поверх postgres.js
 * Позволяет не переписывать все API routes сразу
 */
import { db as pgDb } from './db'

type Row = Record<string, unknown>

function esc(col: string): string {
  // Quote column names with double quotes only if they contain special chars
  return /[^a-z0-9_]/.test(col) ? `"${col}"` : col
}

class QueryBuilder<T extends Row = Row> {
  protected _table: string
  protected _select = '*'
  protected _filters: string[] = []
  protected _values: unknown[] = []
  protected _order: { col: string; asc: boolean }[] = []
  protected _limit: number | null = null
  protected _range: [number, number] | null = null
  protected _countMode = false
  protected _head = false
  protected _singleMode: 'single' | 'maybe' | null = null

  constructor(table: string) { this._table = table }

  protected nextParam() { return `$${this._values.length + 1}` }

  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): this {
    this._select = cols.trim() === '' ? '*' : cols
    if (opts?.count === 'exact') this._countMode = true
    if (opts?.head) this._head = true
    return this
  }

  eq(col: string, val: unknown): this {
    if (val === null) { this._filters.push(`${esc(col)} IS NULL`); return this }
    this._filters.push(`${esc(col)} = ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  neq(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} != ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  gt(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} > ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  gte(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} >= ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  lt(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} < ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  lte(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} <= ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  in(col: string, vals: unknown[]): this {
    if (!vals.length) { this._filters.push('1=0'); return this }
    this._filters.push(`${esc(col)} = ANY(${this.nextParam()})`)
    this._values.push(vals)
    return this
  }

  or(expr: string): this {
    // Parse "col.is.null,col.eq.0" style expression
    const parts = expr.split(',').map(p => {
      const m = p.match(/^(\w+)\.(is|eq|gt|gte|lt|lte|neq)\.(.+)$/)
      if (!m) return p
      const [,col,op,rawVal] = m
      const val = rawVal === 'null' ? null : isNaN(Number(rawVal)) ? `'${rawVal}'` : rawVal
      if (op === 'is' && val === null) return `${esc(col)} IS NULL`
      if (op === 'eq' && val === '0')  return `${esc(col)} = 0`
      return `${esc(col)} ${op === 'neq' ? '!=' : op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : op === 'lt' ? '<' : '='} ${val}`
    })
    this._filters.push(`(${parts.join(' OR ')})`)
    return this
  }

  is(col: string, val: null): this {
    this._filters.push(`${esc(col)} IS NULL`)
    return this
  }

  like(col: string, pattern: string): this {
    this._filters.push(`${esc(col)} LIKE ${this.nextParam()}`)
    this._values.push(pattern)
    return this
  }

  ilike(col: string, pattern: string): this {
    this._filters.push(`${esc(col)} ILIKE ${this.nextParam()}`)
    this._values.push(pattern)
    return this
  }

  not(col: string, op: string, val: unknown): this {
    if (op === 'is' && val === null) { this._filters.push(`${esc(col)} IS NOT NULL`); return this }
    this._filters.push(`NOT (${esc(col)} = ${this.nextParam()})`)
    this._values.push(val)
    return this
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this._order.push({ col, asc: opts?.ascending !== false })
    return this
  }

  limit(n: number): this { this._limit = n; return this }
  range(from: number, to: number): this { this._range = [from, to]; return this }
  single(): this { this._singleMode = 'single'; return this }
  maybeSingle(): this { this._singleMode = 'maybe'; return this }

  protected buildWhere(): string {
    return this._filters.length ? `WHERE ${this._filters.join(' AND ')}` : ''
  }

  protected buildOrder(): string {
    if (!this._order.length) return ''
    return 'ORDER BY ' + this._order.map(o => `${esc(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')
  }

  protected buildLimit(): string {
    if (this._range) return `LIMIT ${this._range[1] - this._range[0] + 1} OFFSET ${this._range[0]}`
    if (this._limit !== null) return `LIMIT ${this._limit}`
    return ''
  }

  // Implements PromiseLike so QueryBuilder is awaitable and supports .then() chaining
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = { data: any; error: null | { message: string }; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: null | { message: string }; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<TResult1 | TResult2>
  }

  private async _execute(): Promise<{ data: T[] | T | null; error: null | { message: string }; count?: number }> {
    const where = this.buildWhere()
    const order = this.buildOrder()
    const lim   = this.buildLimit()

    if (this._head && this._countMode) {
      const sql = `SELECT COUNT(*) c FROM "${this._table}" ${where}`
      const rows = await pgDb.unsafe<{c:string}[]>(sql, this._values as Parameters<typeof pgDb.unsafe>[1])
      return { data: null, count: Number(rows[0].c), error: null }
    }

    const selectCols = this._countMode
      ? `COUNT(*) OVER() AS _total_count, ${this._select === '*' ? '*' : this._select}`
      : this._select

    const sql = `SELECT ${selectCols} FROM "${this._table}" ${where} ${order} ${lim}`.replace(/\s+/g, ' ').trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await pgDb.unsafe<T[]>(sql, this._values as any[])

    const count = this._countMode && rows.length > 0 ? Number((rows[0] as Row)['_total_count']) : undefined
    const data: T[] = count !== undefined ? rows.map(r => { const {_total_count:_, ...rest} = r as Row; return rest as T }) : rows

    if (this._singleMode === 'single') {
      if (!data.length) throw new Error('No rows found')
      return { data: data[0], error: null, count }
    }
    if (this._singleMode === 'maybe') return { data: data[0] ?? null, error: null, count }
    return { data, error: null, count }
  }
}

class MutationBuilder<T extends Row = Row> {
  protected _table: string
  protected _filters: string[] = []
  protected _values: unknown[] = []
  protected _returning = false

  constructor(table: string) { this._table = table }

  protected nextParam(extra: unknown[] = this._values) { return `$${extra.length + 1}` }

  eq(col: string, val: unknown): this {
    this._filters.push(`${esc(col)} = ${this.nextParam()}`)
    this._values.push(val)
    return this
  }

  in(col: string, vals: unknown[]): this {
    if (!vals.length) { this._filters.push('1=0'); return this }
    this._filters.push(`${esc(col)} = ANY(${this.nextParam()})`)
    this._values.push(vals)
    return this
  }

  select(_cols?: string): this { this._returning = true; return this }
  single(): this { return this }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async then(resolve: (v: any) => void, reject: (e: unknown) => void) {
    reject(new Error('MutationBuilder must be subclassed'))
  }
}

class UpdateBuilder<T extends Row = Row> extends MutationBuilder<T> {
  private _data: Row

  constructor(table: string, data: Row) { super(table); this._data = data }

  eq(col: string, val: unknown): this { return super.eq(col, val) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = { data: T | null; error: null | {message:string}; count: number }, TResult2 = never>(
    onfulfilled?: ((v: { data: T | null; error: null | {message:string}; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execUpdate().then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<TResult1 | TResult2>
  }

  private async _execUpdate() {
    try {
      const vals = [...this._values]
      const sets = Object.entries(this._data).map(([col, v]) => {
        vals.push(v); return `${esc(col)} = $${vals.length}`
      })
      // re-index filters against new vals array position
      const filterParts: string[] = []
      const filterVals: unknown[] = []
      // We stored filter placeholders referencing _values (data not yet added), re-build:
      let fi = vals.length
      for (const f of this._filters) {
        filterParts.push(f.replace(/\$\d+/, () => `$${++fi}`))
        filterVals.push(this._values[fi - vals.length - 1])
      }
      // Simpler: rebuild from scratch
      const allVals: unknown[] = []
      const setSql = Object.entries(this._data).map(([col,v]) => { allVals.push(v); return `${esc(col)} = $${allVals.length}` }).join(', ')
      const whereParts = this._filters.map(f => {
        return f.replace(/\$\d+/, () => { const idx = allVals.length + 1; allVals.push(this._values[allVals.length - Object.keys(this._data).length]); return `$${idx}` })
      })

      // Cleanest: just rebuild independently
      const dKeys = Object.keys(this._data)
      const dVals = Object.values(this._data)
      const allParams: unknown[] = [...dVals]
      const setClause = dKeys.map((col,i) => `${esc(col)} = $${i+1}`).join(', ')
      const whereClause = this._filters.length
        ? 'WHERE ' + (this._filters as string[]).map((f,i) => f.replace(/\$\d+/, `$${dVals.length+i+1}`)).join(' AND ')
        : ''
      allParams.push(...this._values)

      const sql = `UPDATE "${this._table}" SET ${setClause} ${whereClause}${this._returning ? ' RETURNING *' : ''}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await pgDb.unsafe<T[]>(sql, allParams as any[])
      return { data: this._returning ? (rows[0] ?? null) : null, error: null as null, count: rows.length }
    } catch(e) { throw e }
  }
}

class InsertBuilder<T extends Row = Row> extends MutationBuilder<T> {
  private _rows: Row[]
  private _onConflict?: string
  private _ignoreDuplicates = false

  constructor(table: string, rows: Row | Row[]) {
    super(table)
    this._rows = Array.isArray(rows) ? rows : [rows]
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this._rows = Array.isArray(rows) ? rows : [rows]
    this._onConflict = opts?.onConflict
    this._ignoreDuplicates = opts?.ignoreDuplicates ?? false
    return this
  }

  eq(col: string, val: unknown): this { return super.eq(col, val) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = { data: T[] | null; error: null | {message:string}; count: number }, TResult2 = never>(
    onfulfilled?: ((v: { data: T[] | null; error: null | {message:string}; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const p = this._execInsert()
    return p.then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<TResult1 | TResult2>
  }

  private async _execInsert(): Promise<{ data: T[] | null; error: null | {message:string}; count: number }> {
    try {
      if (!this._rows.length) return { data: [], error: null, count: 0 }

      const cols = Object.keys(this._rows[0])
      const colsSql = cols.map(c => `"${c}"`).join(', ')
      const vals: unknown[] = []
      const rowsSql = this._rows.map(row => {
        const placeholders = cols.map(col => { vals.push(row[col]); return `$${vals.length}` })
        return `(${placeholders.join(', ')})`
      }).join(', ')

      let conflict = ''
      if (this._onConflict) {
        const conflictCols = this._onConflict.split(',').map(c => `"${c.trim()}"`).join(', ')
        const updateCols = cols.filter(c => !this._onConflict!.split(',').map(s=>s.trim()).includes(c))
        if (updateCols.length) {
          conflict = `ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols.map(c=>`"${c}"=EXCLUDED."${c}"`).join(', ')}`
        } else {
          conflict = `ON CONFLICT (${conflictCols}) DO NOTHING`
        }
      } else if (this._ignoreDuplicates) {
        conflict = 'ON CONFLICT DO NOTHING'
      }

      const sql = `INSERT INTO "${this._table}" (${colsSql}) VALUES ${rowsSql} ${conflict}${this._returning ? ' RETURNING *' : ''}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await pgDb.unsafe<T[]>(sql, vals as any[])
      return { data: this._returning ? rows : null, error: null, count: this._rows.length }
    } catch(e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { data: null, error: { message: msg }, count: 0 }
    }
  }
}

class DeleteBuilder<T extends Row = Row> extends MutationBuilder<T> {
  eq(col: string, val: unknown): this { return super.eq(col, val) }
  in(col: string, vals: unknown[]): this { return super.in(col, vals) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = { data: null; error: null | {message:string}; count: number }, TResult2 = never>(
    onfulfilled?: ((v: { data: null; error: null | {message:string}; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const p = (async () => {
      const where = this._filters.length ? `WHERE ${this._filters.join(' AND ')}` : ''
      const sql = `DELETE FROM "${this._table}" ${where}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await pgDb.unsafe(sql, this._values as any[])
      return { data: null as null, error: null as null | {message:string}, count: (rows as unknown as {length:number}).length ?? 0 }
    })()
    return p.then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<TResult1 | TResult2>
  }
}

class CompatClient {
  from<T extends Row = Row>(table: string) {
    return {
      select: (cols = '*', opts?: { count?: 'exact'; head?: boolean }) =>
        new QueryBuilder<T>(table).select(cols, opts),
      insert: (rows: T | T[]) => new InsertBuilder<T>(table, rows as Row | Row[]),
      upsert: (rows: T | T[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        const b = new InsertBuilder<T>(table, rows as Row | Row[])
        return b.upsert(rows as Row | Row[], opts)
      },
      update: (data: Partial<T>) => new UpdateBuilder<T>(table, data as Row),
      delete: () => new DeleteBuilder<T>(table),
    }
  }
}

let _compat: CompatClient | null = null
export function adminDb(): CompatClient {
  if (!_compat) _compat = new CompatClient()
  return _compat
}

export function createAdminClient(): CompatClient {
  return adminDb()
}
