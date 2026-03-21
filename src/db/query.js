export async function collectFromSource(
  source,
  { query = null, direction = 'next', limit = Number.POSITIVE_INFINITY, transform } = {}
) {
  const rows = []
  let cursor = await source.openCursor(query, direction)

  while (cursor && rows.length < limit) {
    rows.push(transform ? await transform(cursor.value, cursor) : cursor.value)
    cursor = await cursor.continue()
  }

  return rows
}

export async function reduceFromSource(
  source,
  reducer,
  initialValue,
  { query = null, direction = 'next' } = {}
) {
  let accumulator = initialValue
  let cursor = await source.openCursor(query, direction)

  while (cursor) {
    accumulator = await reducer(accumulator, cursor.value, cursor)
    cursor = await cursor.continue()
  }

  return accumulator
}