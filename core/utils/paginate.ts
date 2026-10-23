export const paginated = async (
  limit: number,
  callback: (offset: number, limit: number) => Promise<number>,
) => {
  if (!(limit > 0)) throw new RangeError("paginated: limit must be > 0");

  let length = 0;
  let offset = 0;

  do {
    length = await callback(offset, limit);

    offset += limit;
  } while (length === limit);
};
