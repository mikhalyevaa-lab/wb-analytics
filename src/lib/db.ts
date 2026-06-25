import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof postgres> | undefined
}

export const db = globalThis.__db ?? postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  types: {
    // date → строка 'YYYY-MM-DD'
    date: {
      to: 1082,
      from: [1082],
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
    // timestamp и timestamptz → строка ISO
    timestamp: {
      to: 1114,
      from: [1114, 1184],
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
    // numeric/decimal → число
    numeric: {
      to: 1700,
      from: [1700],
      serialize: (x: number) => String(x),
      parse: (x: string) => parseFloat(x),
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalThis.__db = db
